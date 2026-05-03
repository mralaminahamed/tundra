use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DbEngine {
    Postgresql,
    Mysql,
    Mariadb,
    Valkey,
}

impl DbEngine {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Postgresql => "postgresql",
            Self::Mysql => "mysql",
            Self::Mariadb => "mariadb",
            Self::Valkey => "valkey",
        }
    }
}

impl std::str::FromStr for DbEngine {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "postgresql" => Ok(Self::Postgresql),
            "mysql" => Ok(Self::Mysql),
            "mariadb" => Ok(Self::Mariadb),
            "valkey" => Ok(Self::Valkey),
            other => Err(format!("unknown db engine: {other}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DbServerStatus {
    Active,
    Stopped,
    Error,
}

impl DbServerStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Stopped => "stopped",
            Self::Error => "error",
        }
    }
}

impl std::str::FromStr for DbServerStatus {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "active" => Ok(Self::Active),
            "stopped" => Ok(Self::Stopped),
            "error" => Ok(Self::Error),
            other => Err(format!("unknown db server status: {other}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseServer {
    pub id: Uuid,
    pub server_id: Uuid,
    pub engine: DbEngine,
    pub version: String,
    pub port: i32,
    pub bind_address: String,
    pub superuser: String,
    pub status: DbServerStatus,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct NewDatabaseServer {
    pub server_id: Uuid,
    pub engine: DbEngine,
    pub version: String,
    pub port: i32,
    pub superuser: String,
    pub superuser_password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Database {
    pub id: Uuid,
    pub database_server_id: Uuid,
    pub name: String,
    pub charset: Option<String>,
    pub collation: Option<String>,
    pub size_bytes: Option<i64>,
    pub application_id: Option<Uuid>,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct NewDatabase {
    pub database_server_id: Uuid,
    pub name: String,
    pub charset: Option<String>,
    pub collation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbUser {
    pub id: Uuid,
    pub database_server_id: Uuid,
    pub username: String,
    pub is_managed: bool,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct NewDbUser {
    pub database_server_id: Uuid,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbGrant {
    pub db_user_id: Uuid,
    pub database_id: Uuid,
    pub privileges: Vec<String>,
}
