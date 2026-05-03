pub mod audit_log;
pub mod error;
pub mod operator;
pub mod session;

pub use error::RepoError;

/// Re-export the pool type so callers don't need to depend on sqlx directly.
pub type PgPool = sqlx::PgPool;
