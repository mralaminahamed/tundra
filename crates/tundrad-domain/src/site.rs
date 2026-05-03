use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SiteStatus {
    Provisioning,
    Active,
    Suspended,
    Migrating,
    Archived,
}

impl SiteStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Provisioning => "provisioning",
            Self::Active => "active",
            Self::Suspended => "suspended",
            Self::Migrating => "migrating",
            Self::Archived => "archived",
        }
    }
}

impl std::str::FromStr for SiteStatus {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "provisioning" => Ok(Self::Provisioning),
            "active" => Ok(Self::Active),
            "suspended" => Ok(Self::Suspended),
            "migrating" => Ok(Self::Migrating),
            "archived" => Ok(Self::Archived),
            other => Err(format!("unknown site status: {other}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DeploymentStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
    Cancelled,
}

impl DeploymentStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        }
    }
}

impl std::str::FromStr for DeploymentStatus {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "queued" => Ok(Self::Queued),
            "running" => Ok(Self::Running),
            "succeeded" => Ok(Self::Succeeded),
            "failed" => Ok(Self::Failed),
            "cancelled" => Ok(Self::Cancelled),
            other => Err(format!("unknown deployment status: {other}")),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Site {
    pub id: Uuid,
    pub name: String,
    pub primary_domain: String,
    pub server_id: Uuid,
    pub application_id: Option<Uuid>,
    pub status: SiteStatus,
    pub document_root: String,
    pub base_path: String,
    pub notes: Option<String>,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
    pub deleted_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone)]
pub struct Application {
    pub id: Uuid,
    pub site_id: Uuid,
    pub kind: String,
    pub runtime_version: String,
    pub build_command: Option<String>,
    pub start_command: Option<String>,
    pub process_count: i32,
    pub health_check_path: String,
    pub source_kind: String,
    pub source_config: serde_json::Value,
    pub current_release_id: Option<Uuid>,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct Deployment {
    pub id: Uuid,
    pub application_id: Uuid,
    pub site_id: Uuid,
    pub triggered_by: String,
    pub triggered_by_id: Option<Uuid>,
    pub source_ref: Option<String>,
    pub status: DeploymentStatus,
    pub started_at: Option<OffsetDateTime>,
    pub finished_at: Option<OffsetDateTime>,
    pub error: Option<String>,
    pub created_at: OffsetDateTime,
}

pub struct NewSite {
    pub name: String,
    pub primary_domain: String,
    pub server_id: Uuid,
    pub kind: String,
    pub runtime_version: String,
    pub build_command: Option<String>,
    pub start_command: Option<String>,
    pub health_check_path: String,
    pub source_kind: String,
    pub source_config: serde_json::Value,
}
