pub mod encrypted_field;
pub mod error;
pub mod key_ring;
pub mod master_key;
pub mod password;

pub use encrypted_field::{
    BackupRepoPasswordFamily, DbSuperuserPasswordFamily, DbUserPasswordFamily,
    DkimPrivateKeyFamily, EncryptedBackupRepoPassword, EncryptedDbSuperuserPassword,
    EncryptedDbUserPassword, EncryptedDkimPrivateKey, EncryptedEnvVar, EncryptedFamily,
    EncryptedField, EncryptedPluginSettings, EncryptedRecoveryCodes, EncryptedTotpSecret,
    EnvVarFamily, IntegrationSecretFamily, PluginSettingsFamily, RecoveryCodesFamily,
    TotpSecretFamily,
};
pub use error::CryptoError;
pub use key_ring::KeyRing;
pub use master_key::MasterKey;
pub use password::{hash_password, verify_password};

// ── Convenience helpers for encrypting/decrypting TOTP secrets ───────────────

/// Encrypt a TOTP secret string, returning the raw `bytea` blob for DB storage.
pub fn encrypt_totp_secret(secret: &str) -> Result<Vec<u8>, CryptoError> {
    let owned = secret.to_owned();
    encrypted_field::encrypt_value(&owned, TotpSecretFamily::FAMILY)
}

/// Decrypt a raw `bytea` blob from the DB back to a TOTP secret string.
pub fn decrypt_totp_secret(bytes: &[u8]) -> Result<String, CryptoError> {
    encrypted_field::decrypt_value::<String>(bytes, TotpSecretFamily::FAMILY)
}

/// Encrypt a list of recovery codes, returning the raw `bytea` blob for DB storage.
pub fn encrypt_recovery_codes(codes: &[String]) -> Result<Vec<u8>, CryptoError> {
    let owned: Vec<String> = codes.to_vec();
    encrypted_field::encrypt_value(&owned, RecoveryCodesFamily::FAMILY)
}
