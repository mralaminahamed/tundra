use thiserror::Error;

#[derive(Debug, Error)]
pub enum PkiError {
    #[error("CA not initialized at {0}")]
    CaNotInitialized(String),

    #[error("certificate generation failed: {0}")]
    CertGen(String),

    #[error("PEM parse error: {0}")]
    PemParse(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("setup token expired")]
    TokenExpired,

    #[error("setup token already used")]
    TokenUsed,
}

impl From<rcgen::Error> for PkiError {
    fn from(e: rcgen::Error) -> Self {
        PkiError::CertGen(e.to_string())
    }
}
