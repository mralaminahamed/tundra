use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A single real-time event forwarded to WebSocket subscribers.
///
/// Serialises to the wire format:
/// `{"event_id":"evt_…","channel":"…","type":"…","occurred_at":"…","data":{…}}`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub event_id: String,
    pub channel: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub occurred_at: String,
    pub data: serde_json::Value,
}

impl Event {
    pub fn new(
        channel: impl Into<String>,
        event_type: impl Into<String>,
        data: serde_json::Value,
    ) -> Self {
        Self {
            event_id: format!("evt_{}", Uuid::now_v7().simple()),
            channel: channel.into(),
            event_type: event_type.into(),
            occurred_at: time::OffsetDateTime::now_utc().to_string(),
            data,
        }
    }
}

/// Enumeration of all event types produced by the control plane.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventType {
    DeployQueued,
    DeployStarted,
    DeployStage,
    DeployLog,
    DeploySucceeded,
    DeployFailed,
    SiteHealthChanged,
    SiteTlsRenewed,
    ServerMetrics,
    ServerStatusChanged,
    LogLine,
}

impl EventType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::DeployQueued => "deploy.queued",
            Self::DeployStarted => "deploy.started",
            Self::DeployStage => "deploy.stage",
            Self::DeployLog => "deploy.log",
            Self::DeploySucceeded => "deploy.succeeded",
            Self::DeployFailed => "deploy.failed",
            Self::SiteHealthChanged => "site.health_changed",
            Self::SiteTlsRenewed => "site.tls_renewed",
            Self::ServerMetrics => "server.metrics",
            Self::ServerStatusChanged => "server.status_changed",
            Self::LogLine => "log.line",
        }
    }
}
