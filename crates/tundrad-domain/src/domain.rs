use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DnsManagedBy {
    Tundra,
    External,
    Registrar,
}

impl DnsManagedBy {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Tundra => "tundra",
            Self::External => "external",
            Self::Registrar => "registrar",
        }
    }
}

impl std::str::FromStr for DnsManagedBy {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "tundra" => Ok(Self::Tundra),
            "external" => Ok(Self::External),
            "registrar" => Ok(Self::Registrar),
            o => Err(format!("unknown dns_managed_by value: {o}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Domain {
    pub id: Uuid,
    pub site_id: Option<Uuid>,
    pub site_name: Option<String>,
    pub apex: String,
    pub dns_managed_by: DnsManagedBy,
    pub registration_expires_at: Option<OffsetDateTime>,
    pub auto_renew: bool,
    pub ns_locked: bool,
    pub notes: Option<String>,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct NewDomain {
    pub site_id: Option<Uuid>,
    pub apex: String,
    pub dns_managed_by: DnsManagedBy,
    pub registration_expires_at: Option<OffsetDateTime>,
    pub auto_renew: bool,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct UpdateDomain {
    pub dns_managed_by: Option<DnsManagedBy>,
    pub registration_expires_at: Option<Option<OffsetDateTime>>,
    pub auto_renew: Option<bool>,
    pub notes: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DnsRecord {
    pub id: Uuid,
    pub domain_id: Uuid,
    pub name: String,
    pub record_type: String,
    pub ttl: i32,
    pub priority: Option<i32>,
    pub content: String,
    pub is_managed: bool,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct NewDnsRecord {
    pub domain_id: Uuid,
    pub name: String,
    pub record_type: String,
    pub ttl: i32,
    pub priority: Option<i32>,
    pub content: String,
    pub is_managed: bool,
}
