//! `tundra master-key` subcommands.
//!
//! Provides two operations:
//!
//! - `rotate` — re-encrypts every encrypted column under a new master key,
//!   in batches of 1000 rows, with resume support via `key_rotation_state`.
//! - `verify` — samples encrypted columns to confirm the active master key
//!   can decrypt them successfully.
//!
//! The implementations here are *stubs*: they print a detailed plan and
//! connection requirements but do not perform live DB operations.  The full
//! implementation requires `tundrad-crypto` internals (EncryptedField<T>
//! codec, HKDF key derivation) and a live PostgreSQL connection, which are
//! wired up separately inside `tundrad`.

use std::path::PathBuf;

/// Arguments for the `master-key rotate` command.
pub struct RotateArgs {
    /// Path where the new 32-byte key should be written.
    /// Defaults to `/var/lib/tundra/data/master.key.new`.
    pub new_key_path: Option<PathBuf>,

    /// If true, rename the existing key to a timestamped file before
    /// atomically replacing it with the new key.
    pub backup_old: bool,

    /// If true, look for an existing `key_rotation_state` row with
    /// `status = 'running'` and continue from where it left off.
    pub resume: bool,

    /// PostgreSQL connection URL (from `DATABASE_URL` env or `--database-url`).
    pub database_url: String,
}

/// Run the master-key rotation procedure.
///
/// Full algorithm (executed when connected to a live database):
/// 1. Checks for an existing in-progress rotation in `key_rotation_state`
///    (if `--resume`).
/// 2. Generates a new 32-byte key at `new_key_path` (or a temp path).
/// 3. Opens a transaction; re-encrypts encrypted columns in batches of 1000.
/// 4. Updates `key_version` on each row after re-encryption.
/// 5. Records progress in `key_rotation_state`.
/// 6. On completion, atomically renames `new_key_path` → `master.key`.
///
/// **Stub**: validates arguments, prints the rotation plan, and exits with
/// instructions.  Connect to a real database to run the live procedure.
pub async fn rotate(args: RotateArgs) -> anyhow::Result<()> {
    let new_key_display = args
        .new_key_path
        .as_deref()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "/var/lib/tundra/data/master.key.new".to_string());

    println!("==> Tundra master-key rotation");
    println!("    Old key path : /var/lib/tundra/data/master.key");
    println!("    New key path : {new_key_display}");
    println!("    Backup old   : {}", args.backup_old);
    println!("    Resume mode  : {}", args.resume);
    println!();
    println!("This command re-encrypts all encrypted columns under the new master key.");
    println!("Tables affected: operators, plugin_settings, api_tokens");
    println!("  • Encrypted columns processed in batches of 1000 rows");
    println!("  • Each row is marked with key_version=2 after re-encryption");
    println!("  • Progress is recorded in key_rotation_state for safe resume");
    println!("  • Old key file is retained until rotation is verified complete");
    println!();
    println!("Run during a maintenance window with tundrad stopped:");
    println!("  sudo systemctl stop tundrad");
    println!("  sudo -u tundra tundra master-key rotate \\");
    println!("    --new-key-path /var/lib/tundra/data/master.key.new \\");
    println!("    --backup-old");
    println!();

    if args.resume {
        println!("Resume mode: will query key_rotation_state for an existing 'running' row.");
        println!("Both the old and new key files must be present to resume.");
        println!();
    }

    println!(
        "Stub: connect to database at {} to proceed.",
        args.database_url
    );
    println!("To resume a partial rotation: tundra master-key rotate --resume");

    Ok(())
}

/// Verify that the active master key can decrypt a sample of encrypted rows.
///
/// **Stub**: prints what it would verify.  The live implementation iterates
/// a random sample of rows from each encrypted table and calls
/// `EncryptedField<T>::decrypt()` using the currently loaded master key.
pub async fn verify(database_url: &str) -> anyhow::Result<()> {
    println!("==> Tundra master-key verify");
    println!("Sampling encrypted columns from the database...");
    println!();
    println!("Columns that will be sampled:");
    println!("  • operators.totp_secret_encrypted");
    println!("  • plugin_settings.value");
    println!("  • api_tokens.token_hash  (verifies HKDF key derivation)");
    println!();
    println!("(Stub) Would verify operators.totp_secret_encrypted and plugin_settings.value");
    println!("OK: master key verification stub — connect to {database_url} to run live.");

    Ok(())
}
