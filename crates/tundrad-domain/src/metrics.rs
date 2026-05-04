use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricSample {
    pub id: i64,
    #[serde(with = "time::serde::rfc3339")]
    pub occurred_at: OffsetDateTime,
    pub scope_type: String,
    pub scope_id: Uuid,
    pub metric: String,
    pub value: f64,
    pub labels: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewMetricSample {
    #[serde(with = "time::serde::rfc3339")]
    pub occurred_at: OffsetDateTime,
    pub scope_type: String,
    pub scope_id: Uuid,
    pub metric: String,
    pub value: f64,
    pub labels: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum AlertCondition {
    Gt,
    Lt,
    Gte,
    Lte,
    Eq,
}

impl AlertCondition {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Gt => "gt",
            Self::Lt => "lt",
            Self::Gte => "gte",
            Self::Lte => "lte",
            Self::Eq => "eq",
        }
    }

    pub fn evaluate(&self, value: f64, threshold: f64) -> bool {
        match self {
            Self::Gt => value > threshold,
            Self::Lt => value < threshold,
            Self::Gte => value >= threshold,
            Self::Lte => value <= threshold,
            Self::Eq => (value - threshold).abs() < f64::EPSILON,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertRule {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub scope_type: String,
    pub scope_id: Option<Uuid>,
    pub metric: String,
    pub condition: String,
    pub threshold: f64,
    pub duration_secs: i32,
    pub severity: String,
    pub channels: serde_json::Value,
    pub is_enabled: bool,
    pub created_by: Option<Uuid>,
    #[serde(with = "time::serde::rfc3339")]
    pub created_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339")]
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewAlertRule {
    pub name: String,
    pub description: Option<String>,
    pub scope_type: String,
    pub scope_id: Option<Uuid>,
    pub metric: String,
    pub condition: String,
    pub threshold: f64,
    pub duration_secs: i32,
    pub severity: String,
    pub channels: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertDelivery {
    pub id: Uuid,
    pub rule_id: Uuid,
    pub scope_id: Option<Uuid>,
    #[serde(with = "time::serde::rfc3339")]
    pub fired_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339::option")]
    pub resolved_at: Option<OffsetDateTime>,
    pub current_value: f64,
    pub threshold: f64,
    pub delivery_status: String,
    pub error: Option<String>,
}
