pub mod alert_rules;
pub mod audit_log;
pub mod backup;
pub mod daemon;
pub mod database;
pub mod domain;
pub mod error;
pub mod mail;
pub mod metrics;
pub mod operator;
pub mod passkey;
pub mod scheduled_task;
pub mod server;
pub mod server_metrics;
pub mod session;
pub mod site;
pub mod site_move;

pub use alert_rules::AlertRuleRepo;
pub use audit_log::AuditLogRepo;
pub use backup::{BackupJobRepo, BackupRestoreRepo, BackupSnapshotRepo, BackupTargetRepo};
pub use daemon::DaemonRepo;
pub use database::{DatabaseRepo, DatabaseServerRepo, DbUserRepo};
pub use domain::{DnsRecordRepo, DomainRepo};
pub use error::RepoError;
pub use mail::{AliasRepo, DkimKeyRepo, MailDomainRepo, MailQueueRepo, MailboxRepo};
pub use metrics::MetricsRepo;
pub use operator::OperatorRepo;
pub use passkey::{NewPasskey, Passkey, PasskeyChallengeRepo, PasskeyRepo};
pub use scheduled_task::ScheduledTaskRepo;
pub use server::{AgentCredentialsRepo, ServerRepo};
pub use server_metrics::ServerMetricsRepo;
pub use session::SessionRepo;
pub use site::SiteRepo;
pub use site_move::SiteMoveRepo;

/// Re-export the pool type so callers don't need to depend on sqlx directly.
pub type PgPool = sqlx::PgPool;
