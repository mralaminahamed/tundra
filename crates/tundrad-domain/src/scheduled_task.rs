use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct ScheduledTask {
    pub id: Uuid,
    pub site_id: Uuid,
    pub name: String,
    pub schedule: String,
    pub command: String,
    pub working_dir: String,
    pub is_active: bool,
    pub last_run_at: Option<time::OffsetDateTime>,
    pub created_at: time::OffsetDateTime,
    pub updated_at: time::OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct NewScheduledTask {
    pub site_id: Uuid,
    pub name: String,
    pub schedule: String,
    pub command: String,
    pub working_dir: Option<String>,
}
