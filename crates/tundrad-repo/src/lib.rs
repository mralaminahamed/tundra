pub mod audit_log;
pub mod error;
pub mod operator;
pub mod server;
pub mod session;
pub mod site;

pub use audit_log::AuditLogRepo;
pub use error::RepoError;
pub use operator::OperatorRepo;
pub use server::ServerRepo;
pub use session::SessionRepo;
pub use site::SiteRepo;

/// Re-export the pool type so callers don't need to depend on sqlx directly.
pub type PgPool = sqlx::PgPool;
