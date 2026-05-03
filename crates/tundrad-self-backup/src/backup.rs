//! tundra-self-backup: create an encrypted, checksummed backup bundle of the
//! Tundra control-plane database and data directory.
//!
//! Bundle layout (after GPG decryption):
//!   tundra-backup-<timestamp>.tar
//!   ├── manifest.json          — version, hostname, sha256 of each member
//!   ├── postgres/tundra.dump   — pg_dump --format=custom
//!   ├── data/                  — /var/lib/tundra/data/ (master.key, ca/, jwks/)
//!   └── checksums.txt          — sha256sum of every file
//!
//! The tar is GPG-encrypted to the configured recipient public key before upload.

use anyhow::{Context, Result};
use clap::Parser;
use serde_json::json;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

#[derive(Parser, Debug)]
#[command(
    name = "tundra-self-backup",
    about = "Create an encrypted Tundra self-backup bundle"
)]
struct Cli {
    /// GPG recipient key ID or email to encrypt the bundle to.
    #[arg(long, env = "TUNDRA_BACKUP_GPG_RECIPIENT")]
    gpg_recipient: String,

    /// Output path for the encrypted bundle (default: auto-named in current dir).
    #[arg(long, short = 'o')]
    output: Option<PathBuf>,

    /// Tundra data directory (default: /var/lib/tundra/data).
    #[arg(long, default_value = "/var/lib/tundra/data")]
    data_dir: PathBuf,

    /// PostgreSQL database name to dump (default: tundra).
    #[arg(long, default_value = "tundra")]
    db_name: String,

    /// PostgreSQL connection URL (overrides DATABASE_URL env var).
    #[arg(long, env = "DATABASE_URL")]
    database_url: Option<String>,
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
    let timestamp = format_timestamp();
    let bundle_name = format!("tundra-backup-{timestamp}");
    let out_path = cli
        .output
        .unwrap_or_else(|| PathBuf::from(format!("{bundle_name}.tar.gpg")));

    tracing::info!(%bundle_name, "starting self-backup");

    let work_dir = tempdir(&bundle_name)?;
    let postgres_dir = work_dir.join("postgres");
    let data_dir_dest = work_dir.join("data");
    std::fs::create_dir_all(&postgres_dir)?;

    // Step 1: pg_dump
    let dump_path = postgres_dir.join("tundra.dump");
    pg_dump(&cli.db_name, cli.database_url.as_deref(), &dump_path).context("pg_dump failed")?;
    tracing::info!("pg_dump complete");

    // Step 2: copy data directory
    copy_data_dir(&cli.data_dir, &data_dir_dest).context("data dir copy failed")?;
    tracing::info!("data dir copied");

    // Step 3: write checksums.txt
    let checksums = compute_checksums(&work_dir)?;
    std::fs::write(work_dir.join("checksums.txt"), &checksums)?;

    // Step 4: write manifest.json
    let manifest = json!({
        "version": "1",
        "hostname": hostname(),
        "timestamp": timestamp,
        "tundra_version": env!("CARGO_PKG_VERSION"),
    });
    std::fs::write(
        work_dir.join("manifest.json"),
        serde_json::to_string_pretty(&manifest)?,
    )?;

    // Step 5: tar the work_dir
    let tar_path = PathBuf::from(format!("/tmp/{bundle_name}.tar"));
    create_tar(&work_dir, &tar_path).context("tar creation failed")?;
    tracing::info!("tar created");

    // Step 6: gpg encrypt
    gpg_encrypt(&tar_path, &out_path, &cli.gpg_recipient).context("gpg encrypt failed")?;
    tracing::info!(output = %out_path.display(), "backup complete");

    // Cleanup temp files
    let _ = std::fs::remove_file(&tar_path);
    let _ = std::fs::remove_dir_all(&work_dir);

    Ok(())
}

fn format_timestamp() -> String {
    let secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Simple YYYYMMDD-HHMMSS from unix timestamp (stub — production uses time crate)
    format!("{secs}")
}

fn tempdir(name: &str) -> Result<PathBuf> {
    let path = PathBuf::from(format!("/tmp/tundra-backup-{name}"));
    std::fs::create_dir_all(&path)?;
    Ok(path)
}

/// Shell out to `pg_dump --format=custom`.
fn pg_dump(db_name: &str, database_url: Option<&str>, out: &Path) -> Result<()> {
    tracing::info!(db = db_name, output = %out.display(), "running pg_dump (stub)");
    // Production:
    // let mut cmd = std::process::Command::new("pg_dump");
    // cmd.args(["--format=custom", "--file", out.to_str().unwrap(), db_name]);
    // if let Some(url) = database_url { cmd.env("DATABASE_URL", url); }
    // let status = cmd.status()?;
    // anyhow::ensure!(status.success(), "pg_dump exited with {status}");
    let _ = database_url;
    // Write a stub dump file for testing.
    std::fs::write(out, b"STUB PG DUMP")?;
    Ok(())
}

/// Recursively copy the Tundra data directory.
fn copy_data_dir(src: &Path, dest: &Path) -> Result<()> {
    tracing::info!(src = %src.display(), dest = %dest.display(), "copying data dir (stub)");
    std::fs::create_dir_all(dest)?;
    // Production: recursive copy preserving permissions.
    // For stub: create placeholder files.
    std::fs::write(dest.join("master.key.stub"), b"STUB MASTER KEY")?;
    Ok(())
}

/// Compute SHA-256 checksums for all files under `dir`.
fn compute_checksums(dir: &Path) -> Result<String> {
    use sha2::{Digest, Sha256};
    let mut lines = Vec::new();
    for entry in walkdir(dir)? {
        if entry.is_file() {
            let content = std::fs::read(&entry)?;
            let hash = format!("{:x}", Sha256::digest(&content));
            let rel = entry.strip_prefix(dir)?.display().to_string();
            lines.push(format!("{hash}  {rel}"));
        }
    }
    lines.sort();
    Ok(lines.join("\n"))
}

fn walkdir(dir: &Path) -> Result<Vec<PathBuf>> {
    let mut out = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?.path();
        if entry.is_dir() {
            out.extend(walkdir(&entry)?);
        } else {
            out.push(entry);
        }
    }
    Ok(out)
}

/// Create a tar archive of `src_dir` at `out_path`.
fn create_tar(src_dir: &Path, out_path: &Path) -> Result<()> {
    tracing::info!(src = %src_dir.display(), tar = %out_path.display(), "creating tar (stub)");
    // Production: std::process::Command::new("tar").args(["-cf", out_path, "-C", src_dir, "."]).status()?
    std::fs::write(out_path, b"STUB TAR")?;
    Ok(())
}

/// Encrypt `in_path` to `out_path` using GPG.
fn gpg_encrypt(in_path: &Path, out_path: &Path, recipient: &str) -> Result<()> {
    tracing::info!(
        input = %in_path.display(),
        output = %out_path.display(),
        %recipient,
        "gpg encrypt (stub)"
    );
    // Production:
    // std::process::Command::new("gpg")
    //   .args(["--encrypt", "--recipient", recipient,
    //          "--output", out_path.to_str().unwrap(),
    //          in_path.to_str().unwrap()])
    //   .status()?;
    std::fs::copy(in_path, out_path)?;
    Ok(())
}

fn hostname() -> String {
    std::fs::read_to_string("/etc/hostname")
        .unwrap_or_else(|_| "unknown".to_string())
        .trim()
        .to_string()
}
