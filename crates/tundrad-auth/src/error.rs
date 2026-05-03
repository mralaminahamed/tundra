use thiserror::Error;

#[derive(Debug, Error)]
pub enum AuthError {
    /// Invalid credentials — never reveal which field was wrong.
    #[error("invalid credentials")]
    InvalidCredentials,

    #[error("session not found")]
    SessionNotFound,

    #[error("session expired")]
    SessionExpired,

    #[error("session revoked")]
    SessionRevoked,

    /// The operation requires a fresh full authentication (step-up).
    #[error("step-up authentication required")]
    StepUpRequired,

    #[error("forbidden: {0}")]
    Forbidden(String),

    #[error("token revoked")]
    TokenRevoked,

    #[error("token expired")]
    TokenExpired,

    #[error(transparent)]
    Crypto(#[from] tundrad_crypto::CryptoError),

    /// Repo errors that are not "not found" bubble up as-is.
    /// NotFound is mapped to InvalidCredentials in auth flows.
    #[error("repository error: {0}")]
    Repo(#[from] tundrad_repo::RepoError),

    /// HIBP service unavailable — non-fatal; callers log and continue.
    #[error("hibp service unavailable")]
    HibpUnavailable,

    #[error("internal error: {0}")]
    Internal(String),
}
