use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ServerStatus {
    Provisioning,
    Active,
    Degraded,
    Offline,
    Disabled,
}

impl ServerStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Provisioning => "provisioning",
            Self::Active => "active",
            Self::Degraded => "degraded",
            Self::Offline => "offline",
            Self::Disabled => "disabled",
        }
    }
}

impl std::str::FromStr for ServerStatus {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "provisioning" => Ok(Self::Provisioning),
            "active" => Ok(Self::Active),
            "degraded" => Ok(Self::Degraded),
            "offline" => Ok(Self::Offline),
            "disabled" => Ok(Self::Disabled),
            other => Err(format!("unknown server status: {other}")),
        }
    }
}

/// A managed server.
#[derive(Debug, Clone)]
pub struct Server {
    pub id: Uuid,
    pub name: String,
    pub hostname: String,
    pub region: Option<String>,
    pub public_ip: Option<String>,
    pub os: String,
    pub os_version: String,
    pub arch: String,
    pub agent_version: Option<String>,
    pub status: ServerStatus,
    pub agent_last_seen_at: Option<OffsetDateTime>,
    pub capabilities: serde_json::Value,
    pub resources_total: serde_json::Value,
    pub agent_cert_fingerprint: Option<String>,
    pub notes: Option<String>,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
    pub deleted_at: Option<OffsetDateTime>,
}

pub struct NewServer {
    pub name: String,
    pub hostname: String,
    pub region: Option<String>,
    pub os: String,
}
