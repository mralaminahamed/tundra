use serde_json::Value;
use time::OffsetDateTime;
use uuid::Uuid;

/// Who triggered the audited action.
#[derive(Debug, Clone)]
pub enum AuditActor {
    Operator(Uuid),
    Plugin(Uuid),
    McpSession(Uuid),
    System,
}

impl AuditActor {
    pub fn actor_type(&self) -> &'static str {
        match self {
            Self::Operator(_) => "operator",
            Self::Plugin(_) => "plugin",
            Self::McpSession(_) => "mcp_session",
            Self::System => "system",
        }
    }

    pub fn actor_id(&self) -> Option<Uuid> {
        match self {
            Self::Operator(id) | Self::Plugin(id) | Self::McpSession(id) => Some(*id),
            Self::System => None,
        }
    }
}

/// A persisted audit log row (read path).
#[derive(Debug, Clone)]
pub struct AuditEntry {
    pub id: Uuid,
    pub occurred_at: OffsetDateTime,
    pub actor_type: String,
    pub actor_id: Option<Uuid>,
    pub action: String,
    pub resource_type: Option<String>,
    pub resource_id: Option<Uuid>,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    pub details: Value,
}

/// Write a new audit entry.
pub struct NewAuditEntry {
    pub actor: AuditActor,
    pub action: String,
    pub resource_type: Option<String>,
    pub resource_id: Option<Uuid>,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    pub details: Value,
}

impl NewAuditEntry {
    pub fn system(action: impl Into<String>) -> Self {
        Self {
            actor: AuditActor::System,
            action: action.into(),
            resource_type: None,
            resource_id: None,
            ip: None,
            user_agent: None,
            details: Value::Object(Default::default()),
        }
    }
}
