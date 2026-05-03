use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BackupTargetKind {
    S3,
    Local,
    Sftp,
    B2,
    Wasabi,
    R2,
}

impl BackupTargetKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::S3 => "s3",
            Self::Local => "local",
            Self::Sftp => "sftp",
            Self::B2 => "b2",
            Self::Wasabi => "wasabi",
            Self::R2 => "r2",
        }
    }
}

impl std::str::FromStr for BackupTargetKind {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "s3" => Ok(Self::S3),
            "local" => Ok(Self::Local),
            "sftp" => Ok(Self::Sftp),
            "b2" => Ok(Self::B2),
            "wasabi" => Ok(Self::Wasabi),
            "r2" => Ok(Self::R2),
            other => Err(format!("unknown backup target kind: {other}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupTarget {
    pub id: Uuid,
    pub name: String,
    pub kind: BackupTargetKind,
    pub config: serde_json::Value,
    pub is_default: bool,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct NewBackupTarget {
    pub name: String,
    pub kind: BackupTargetKind,
    pub config: serde_json::Value,
    pub repo_password: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupJob {
    pub id: Uuid,
    pub name: String,
    pub scope_kind: String,
    pub scope_id: Option<Uuid>,
    pub target_id: Uuid,
    pub schedule_cron: Option<String>,
    pub retention_policy: serde_json::Value,
    pub is_active: bool,
    pub last_run_at: Option<OffsetDateTime>,
    pub last_status: Option<String>,
    pub next_run_at: Option<OffsetDateTime>,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct NewBackupJob {
    pub name: String,
    pub scope_kind: String,
    pub scope_id: Option<Uuid>,
    pub target_id: Uuid,
    pub schedule_cron: Option<String>,
    pub retention_policy: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupSnapshot {
    pub id: Uuid,
    pub job_id: Uuid,
    pub snapshot_id: String,
    pub size_bytes: i64,
    pub files_new: Option<i64>,
    pub files_changed: Option<i64>,
    pub duration_ms: i32,
    pub status: String,
    pub error: Option<String>,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupRestore {
    pub id: Uuid,
    pub snapshot_id: Uuid,
    pub operator_id: Uuid,
    pub target_path: Option<String>,
    pub status: String,
    pub preview: Option<serde_json::Value>,
    pub started_at: Option<OffsetDateTime>,
    pub completed_at: Option<OffsetDateTime>,
    pub error: Option<String>,
    pub created_at: OffsetDateTime,
}
