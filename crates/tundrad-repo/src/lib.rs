pub mod audit_log;
pub mod backup;
pub mod daemon;
pub mod database;
pub mod domain;
pub mod error;
pub mod mail;
pub mod operator;
pub mod scheduled_task;
pub mod server;
pub mod session;
pub mod site;

pub use audit_log::AuditLogRepo;
pub use backup::{BackupJobRepo, BackupRestoreRepo, BackupSnapshotRepo, BackupTargetRepo};
pub use daemon::DaemonRepo;
pub use database::{DatabaseRepo, DatabaseServerRepo, DbUserRepo};
pub use domain::{DnsRecordRepo, DomainRepo};
pub use error::RepoError;
pub use mail::{AliasRepo, DkimKeyRepo, MailDomainRepo, MailQueueRepo, MailboxRepo};
pub use operator::OperatorRepo;
pub use scheduled_task::ScheduledTaskRepo;
pub use server::ServerRepo;
pub use session::SessionRepo;
pub use site::SiteRepo;

/// Re-export the pool type so callers don't need to depend on sqlx directly.
pub type PgPool = sqlx::PgPool;
