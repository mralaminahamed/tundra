use thiserror::Error;

#[derive(Debug, Error)]
pub enum RepoError {
    #[error("database error: {0}")]
    Sqlx(#[from] sqlx::Error),

    #[error("record not found")]
    NotFound,

    #[error("conflict: {0}")]
    Conflict(String),

    #[error("crypto error: {0}")]
    Crypto(#[from] tundrad_crypto::CryptoError),
}
