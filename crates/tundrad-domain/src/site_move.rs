use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SiteMoveStatus {
    Pending,
    Running,
    Succeeded,
    Failed,
    Abandoned,
}

impl SiteMoveStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Running => "running",
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
            Self::Abandoned => "abandoned",
        }
    }
}

impl std::fmt::Display for SiteMoveStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone)]
pub struct SiteMove {
    pub id: Uuid,
    pub site_id: Uuid,
    pub from_server_id: Uuid,
    pub to_server_id: Uuid,
    pub status: SiteMoveStatus,
    pub current_stage: Option<String>,
    pub error: Option<String>,
    pub initiated_by: Option<Uuid>,
    pub started_at: Option<time::OffsetDateTime>,
    pub finished_at: Option<time::OffsetDateTime>,
    pub created_at: time::OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct NewSiteMove {
    pub site_id: Uuid,
    pub from_server_id: Uuid,
    pub to_server_id: Uuid,
    pub initiated_by: Option<Uuid>,
}

/// Possible move stages, in order.
pub const MOVE_STAGES: &[&str] = &[
    "acquire_lock",
    "sync_artifacts",
    "database_migrate",
    "update_server_id",
    "issue_tls_cert",
    "update_dns",
    "health_check",
    "retire_source",
];
