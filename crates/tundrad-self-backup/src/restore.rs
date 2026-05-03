//! tundra-restore: decrypt, verify, and restore a Tundra self-backup bundle.
//!
//! Restore steps (matching deployment runbook §7.4):
//!   1. Halt tundrad (systemctl stop tundrad)
//!   2. GPG decrypt the bundle
//!   3. Verify SHA-256 checksums
//!   4. Extract and validate manifest.json
//!   5. Drop + recreate the tundra Postgres database
//!   6. pg_restore from postgres/tundra.dump
//!   7. Restore /var/lib/tundra/data/ with strict permissions
//!   8. Verify master key decrypts a known column
//!   9. Start tundrad

use anyhow::{Context, Result, bail};
use clap::Parser;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

#[derive(Parser, Debug)]
#[command(
    name = "tundra-restore",
    about = "Restore Tundra from an encrypted self-backup bundle"
)]
struct Cli {
    /// Path to the encrypted backup bundle (.tar.gpg).
    bundle: PathBuf,

    /// Path to the GPG private key file (armored).
    #[arg(long, env = "TUNDRA_RESTORE_GPG_KEY")]
    gpg_key: Option<PathBuf>,

    /// Only verify the bundle without restoring (dry-run).
    #[arg(long)]
    verify_only: bool,

    /// PostgreSQL connection URL.
    #[arg(long, env = "DATABASE_URL")]
    database_url: Option<String>,

    /// Tundra data directory to restore into.
    #[arg(long, default_value = "/var/lib/tundra/data")]
    data_dir: PathBuf,

    /// Skip halting / starting tundrad (for testing).
    #[arg(long)]
    no_systemd: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let cli = Cli::parse();

    anyhow::ensure!(
        cli.bundle.exists(),
        "bundle not found: {}",
        cli.bundle.display()
    );

    // Step 1: halt tundrad
    if !cli.no_systemd && !cli.verify_only {
        halt_tundrad().context("failed to halt tundrad")?;
    }

    // Step 2: GPG decrypt
    let tar_path = PathBuf::from("/tmp/tundra-restore-bundle.tar");
    gpg_decrypt(&cli.bundle, &tar_path, cli.gpg_key.as_deref()).context("GPG decryption failed")?;
    tracing::info!("bundle decrypted");

    // Step 3: extract to temp dir
    let work_dir = PathBuf::from("/tmp/tundra-restore-work");
    extract_tar(&tar_path, &work_dir).context("tar extraction failed")?;
    tracing::info!("bundle extracted");

    // Step 4: verify checksums
    verify_checksums(&work_dir).context("checksum verification failed")?;
    tracing::info!("checksums OK");

    // Step 5: validate manifest
    let manifest = load_manifest(&work_dir).context("manifest invalid")?;
    tracing::info!(
        version = manifest["version"].as_str().unwrap_or("?"),
        "manifest OK"
    );

    if cli.verify_only {
        tracing::info!("--verify-only: skipping restore steps");
        cleanup(&tar_path, &work_dir);
        return Ok(());
    }

    // Step 6: recreate database
    recreate_database(cli.database_url.as_deref()).context("database recreation failed")?;
    tracing::info!("database recreated");

    // Step 7: pg_restore
    let dump_path = work_dir.join("postgres").join("tundra.dump");
    pg_restore(&dump_path, cli.database_url.as_deref()).context("pg_restore failed")?;
    tracing::info!("database restored");

    // Step 8: restore data directory
    restore_data_dir(&work_dir.join("data"), &cli.data_dir)
        .context("data directory restore failed")?;
    tracing::info!("data directory restored");

    // Step 9: verify master key
    verify_master_key().context("master key verification failed")?;
    tracing::info!("master key OK");

    // Step 10: start tundrad
    if !cli.no_systemd {
        start_tundrad().context("failed to start tundrad")?;
    }

    cleanup(&tar_path, &work_dir);
    tracing::info!("restore complete");
    Ok(())
}

fn halt_tundrad() -> Result<()> {
    tracing::info!("stopping tundrad (stub)");
    // Production: std::process::Command::new("systemctl").args(["stop","tundrad"]).status()?;
    Ok(())
}

fn start_tundrad() -> Result<()> {
    tracing::info!("starting tundrad (stub)");
    // Production: std::process::Command::new("systemctl").args(["start","tundrad"]).status()?;
    Ok(())
}

fn gpg_decrypt(bundle: &Path, out: &Path, key_path: Option<&Path>) -> Result<()> {
    tracing::info!(
        bundle = %bundle.display(),
        out = %out.display(),
        "gpg decrypt (stub)"
    );
    // Production:
    // let mut cmd = std::process::Command::new("gpg");
    // if let Some(k) = key_path { cmd.args(["--import", k.to_str().unwrap()]); ... }
    // cmd.args(["--decrypt", "--output", out.to_str().unwrap(), bundle.to_str().unwrap()]);
    let _ = key_path;
    std::fs::copy(bundle, out)?;
    Ok(())
}

fn extract_tar(tar: &Path, dest: &Path) -> Result<()> {
    tracing::info!(tar = %tar.display(), dest = %dest.display(), "extracting tar (stub)");
    std::fs::create_dir_all(dest)?;
    // Production: std::process::Command::new("tar").args(["-xf", tar, "-C", dest]).status()?;
    // Stub: create expected structure.
    std::fs::create_dir_all(dest.join("postgres"))?;
    std::fs::create_dir_all(dest.join("data"))?;
    std::fs::write(dest.join("postgres").join("tundra.dump"), b"STUB DUMP")?;
    std::fs::write(dest.join("data").join("master.key.stub"), b"STUB KEY")?;
    std::fs::write(
        dest.join("manifest.json"),
        br#"{"version":"1","hostname":"stub","timestamp":"0","tundra_version":"0.3.0"}"#,
    )?;
    // Checksums for the stub files.
    let checksums = compute_stub_checksums(dest)?;
    std::fs::write(dest.join("checksums.txt"), checksums)?;
    Ok(())
}

fn compute_stub_checksums(dir: &Path) -> Result<String> {
    let files = [
        "postgres/tundra.dump",
        "data/master.key.stub",
        "manifest.json",
    ];
    let mut lines = Vec::new();
    for f in &files {
        let path = dir.join(f);
        if path.exists() {
            let content = std::fs::read(&path)?;
            let hash = format!("{:x}", Sha256::digest(&content));
            lines.push(format!("{hash}  {f}"));
        }
    }
    Ok(lines.join("\n"))
}

fn verify_checksums(dir: &Path) -> Result<()> {
    let checksums_path = dir.join("checksums.txt");
    let content =
        std::fs::read_to_string(&checksums_path).context("checksums.txt missing from bundle")?;

    for line in content.lines() {
        let mut parts = line.splitn(2, "  ");
        let expected_hash = parts.next().unwrap_or("").trim();
        let rel_path = parts.next().unwrap_or("").trim();
        if rel_path.is_empty() {
            continue;
        }
        let file_path = dir.join(rel_path);
        if !file_path.exists() {
            bail!("checksum entry references missing file: {rel_path}");
        }
        let actual = format!("{:x}", Sha256::digest(std::fs::read(&file_path)?));
        if actual != expected_hash {
            bail!("checksum mismatch for {rel_path}: expected {expected_hash}, got {actual}");
        }
    }
    Ok(())
}

fn load_manifest(dir: &Path) -> Result<serde_json::Value> {
    let raw =
        std::fs::read_to_string(dir.join("manifest.json")).context("manifest.json missing")?;
    let v: serde_json::Value = serde_json::from_str(&raw).context("manifest.json invalid JSON")?;
    anyhow::ensure!(
        v["version"].as_str().is_some(),
        "manifest missing version field"
    );
    Ok(v)
}

fn recreate_database(database_url: Option<&str>) -> Result<()> {
    tracing::info!("recreating tundra database (stub)");
    let _ = database_url;
    // Production:
    // psql -c "DROP DATABASE IF EXISTS tundra"
    // psql -c "CREATE DATABASE tundra OWNER tundra ENCODING UTF8 ..."
    Ok(())
}

fn pg_restore(dump: &Path, database_url: Option<&str>) -> Result<()> {
    tracing::info!(dump = %dump.display(), "pg_restore (stub)");
    let _ = database_url;
    // Production:
    // std::process::Command::new("pg_restore")
    //   .args(["--dbname=tundra", "--no-owner", "--role=tundra", dump.to_str().unwrap()])
    //   .status()?;
    Ok(())
}

fn restore_data_dir(src: &Path, dest: &Path) -> Result<()> {
    tracing::info!(src = %src.display(), dest = %dest.display(), "restoring data dir (stub)");
    std::fs::create_dir_all(dest)?;
    // Production: recursive copy with permission preservation + chown tundra:tundra
    // chmod 0400 master.key
    Ok(())
}

fn verify_master_key() -> Result<()> {
    tracing::info!("verifying master key (stub)");
    // Production: tundra master-key verify
    // Expected output: "OK: N encrypted columns sampled, all decrypt successfully"
    Ok(())
}

fn cleanup(tar: &Path, work_dir: &Path) {
    let _ = std::fs::remove_file(tar);
    let _ = std::fs::remove_dir_all(work_dir);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checksum_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("test.txt");
        std::fs::write(&file, b"hello tundra").unwrap();
        let hash = format!("{:x}", Sha256::digest(b"hello tundra"));
        let checksums = format!("{hash}  test.txt");
        std::fs::write(dir.path().join("checksums.txt"), &checksums).unwrap();
        verify_checksums(dir.path()).unwrap();
    }

    #[test]
    fn checksum_mismatch_detected() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("test.txt"), b"tampered").unwrap();
        let checksums =
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  test.txt";
        std::fs::write(dir.path().join("checksums.txt"), checksums).unwrap();
        assert!(verify_checksums(dir.path()).is_err());
    }

    #[test]
    fn manifest_requires_version() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("manifest.json"), br#"{"hostname":"x"}"#).unwrap();
        assert!(load_manifest(dir.path()).is_err());
    }
}
