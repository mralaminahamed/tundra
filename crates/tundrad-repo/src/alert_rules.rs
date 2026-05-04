use crate::{PgPool, RepoError};
use time::OffsetDateTime;
use tundrad_domain::metrics::{AlertDelivery, AlertRule, NewAlertRule};
use uuid::Uuid;

// ── Row types ─────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct AlertRuleRow {
    id: Uuid,
    name: String,
    description: Option<String>,
    scope_type: String,
    scope_id: Option<Uuid>,
    metric: String,
    condition: String,
    threshold: f64,
    duration_secs: i32,
    severity: String,
    channels: serde_json::Value,
    is_enabled: bool,
    created_by: Option<Uuid>,
    created_at: OffsetDateTime,
    updated_at: OffsetDateTime,
}

impl From<AlertRuleRow> for AlertRule {
    fn from(r: AlertRuleRow) -> Self {
        AlertRule {
            id: r.id,
            name: r.name,
            description: r.description,
            scope_type: r.scope_type,
            scope_id: r.scope_id,
            metric: r.metric,
            condition: r.condition,
            threshold: r.threshold,
            duration_secs: r.duration_secs,
            severity: r.severity,
            channels: r.channels,
            is_enabled: r.is_enabled,
            created_by: r.created_by,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

#[derive(sqlx::FromRow)]
struct AlertDeliveryRow {
    id: Uuid,
    rule_id: Uuid,
    scope_id: Option<Uuid>,
    fired_at: OffsetDateTime,
    resolved_at: Option<OffsetDateTime>,
    current_value: f64,
    threshold: f64,
    delivery_status: String,
    error: Option<String>,
}

impl From<AlertDeliveryRow> for AlertDelivery {
    fn from(r: AlertDeliveryRow) -> Self {
        AlertDelivery {
            id: r.id,
            rule_id: r.rule_id,
            scope_id: r.scope_id,
            fired_at: r.fired_at,
            resolved_at: r.resolved_at,
            current_value: r.current_value,
            threshold: r.threshold,
            delivery_status: r.delivery_status,
            error: r.error,
        }
    }
}

const RULE_COLS: &str = "id, name, description, scope_type, scope_id, metric, condition, \
    threshold::float8 AS threshold, duration_secs, severity, channels, is_enabled, \
    created_by, created_at, updated_at";

const DELIVERY_COLS: &str = "id, rule_id, scope_id, fired_at, resolved_at, \
    current_value::float8 AS current_value, threshold::float8 AS threshold, \
    delivery_status, error";

// ── AlertRuleRepo ─────────────────────────────────────────────────────────────

pub struct AlertRuleRepo<'a> {
    pool: &'a PgPool,
}

impl<'a> AlertRuleRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn list_enabled(&self) -> Result<Vec<AlertRule>, RepoError> {
        sqlx::query_as::<_, AlertRuleRow>(&format!(
            "SELECT {RULE_COLS} FROM alert_rules WHERE is_enabled = true ORDER BY created_at DESC"
        ))
        .fetch_all(self.pool)
        .await
        .map(|rows| rows.into_iter().map(AlertRule::from).collect())
        .map_err(RepoError::from)
    }

    pub async fn list_all(&self) -> Result<Vec<AlertRule>, RepoError> {
        sqlx::query_as::<_, AlertRuleRow>(&format!(
            "SELECT {RULE_COLS} FROM alert_rules ORDER BY created_at DESC"
        ))
        .fetch_all(self.pool)
        .await
        .map(|rows| rows.into_iter().map(AlertRule::from).collect())
        .map_err(RepoError::from)
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<Option<AlertRule>, RepoError> {
        sqlx::query_as::<_, AlertRuleRow>(&format!(
            "SELECT {RULE_COLS} FROM alert_rules WHERE id = $1"
        ))
        .bind(id)
        .fetch_optional(self.pool)
        .await
        .map(|opt| opt.map(AlertRule::from))
        .map_err(RepoError::from)
    }

    pub async fn create(
        &self,
        rule: &NewAlertRule,
        created_by: Uuid,
    ) -> Result<AlertRule, RepoError> {
        sqlx::query_as::<_, AlertRuleRow>(&format!(
            "INSERT INTO alert_rules \
               (name, description, scope_type, scope_id, metric, condition, threshold, \
                duration_secs, severity, channels, created_by) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) \
             RETURNING {RULE_COLS}"
        ))
        .bind(&rule.name)
        .bind(&rule.description)
        .bind(&rule.scope_type)
        .bind(rule.scope_id)
        .bind(&rule.metric)
        .bind(&rule.condition)
        .bind(rule.threshold)
        .bind(rule.duration_secs)
        .bind(&rule.severity)
        .bind(&rule.channels)
        .bind(created_by)
        .fetch_one(self.pool)
        .await
        .map(AlertRule::from)
        .map_err(RepoError::from)
    }

    pub async fn update_enabled(&self, id: Uuid, enabled: bool) -> Result<(), RepoError> {
        let rows = sqlx::query("UPDATE alert_rules SET is_enabled = $1 WHERE id = $2")
            .bind(enabled)
            .bind(id)
            .execute(self.pool)
            .await?
            .rows_affected();
        if rows == 0 {
            return Err(RepoError::NotFound);
        }
        Ok(())
    }

    pub async fn delete(&self, id: Uuid) -> Result<(), RepoError> {
        let rows = sqlx::query("DELETE FROM alert_rules WHERE id = $1")
            .bind(id)
            .execute(self.pool)
            .await?
            .rows_affected();
        if rows == 0 {
            return Err(RepoError::NotFound);
        }
        Ok(())
    }

    pub async fn record_delivery(
        &self,
        rule_id: Uuid,
        scope_id: Option<Uuid>,
        current_value: f64,
        threshold: f64,
    ) -> Result<Uuid, RepoError> {
        let row: (Uuid,) = sqlx::query_as(
            "INSERT INTO alert_deliveries (rule_id, scope_id, current_value, threshold) \
             VALUES ($1, $2, $3, $4) RETURNING id",
        )
        .bind(rule_id)
        .bind(scope_id)
        .bind(current_value)
        .bind(threshold)
        .fetch_one(self.pool)
        .await?;
        Ok(row.0)
    }

    pub async fn resolve_delivery(&self, delivery_id: Uuid) -> Result<(), RepoError> {
        let rows = sqlx::query(
            "UPDATE alert_deliveries SET resolved_at = now(), delivery_status = 'delivered' \
             WHERE id = $1 AND resolved_at IS NULL",
        )
        .bind(delivery_id)
        .execute(self.pool)
        .await?
        .rows_affected();
        if rows == 0 {
            return Err(RepoError::NotFound);
        }
        Ok(())
    }

    pub async fn list_recent_deliveries(
        &self,
        since: OffsetDateTime,
        limit: i64,
    ) -> Result<Vec<AlertDelivery>, RepoError> {
        sqlx::query_as::<_, AlertDeliveryRow>(&format!(
            "SELECT {DELIVERY_COLS} FROM alert_deliveries \
             WHERE fired_at >= $1 ORDER BY fired_at DESC LIMIT $2"
        ))
        .bind(since)
        .bind(limit)
        .fetch_all(self.pool)
        .await
        .map(|rows| rows.into_iter().map(AlertDelivery::from).collect())
        .map_err(RepoError::from)
    }
}
