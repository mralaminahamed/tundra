use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct Daemon {
    pub id: Uuid,
    pub site_id: Uuid,
    pub name: String,
    pub command: String,
    pub working_dir: String,
    pub env_file: String,
    pub is_active: bool,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct NewDaemon {
    pub site_id: Uuid,
    pub name: String,
    pub command: String,
    pub working_dir: Option<String>,
    pub env_file: Option<String>,
}
