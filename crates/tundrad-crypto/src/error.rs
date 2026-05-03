use thiserror::Error;

#[derive(Debug, Error)]
pub enum CryptoError {
    #[error("master key file must be exactly 64 bytes, got {0}")]
    InvalidMasterKeyLength(usize),

    #[error("master key integrity check failed — BLAKE3 trailer mismatch")]
    MasterKeyIntegrityFailed,

    #[error("IO error reading master key: {0}")]
    Io(#[from] std::io::Error),

    #[error("HKDF key expansion failed")]
    HkdfExpand,

    #[error("AEAD cipher initialisation failed")]
    AeadInit,

    #[error("encryption failed")]
    Encrypt,

    #[error("decryption failed — bad key, corrupted ciphertext, or wrong family")]
    Decrypt,

    #[error("invalid ciphertext: {0}")]
    InvalidCiphertext(&'static str),

    #[error("KeyRing not initialised — call KeyRing::init_global before serving")]
    KeyRingNotInitialized,

    #[error("KeyRing already initialised")]
    AlreadyInitialized,

    #[error("JSON serialisation error: {0}")]
    Json(#[from] serde_json::Error),
}
