use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{error::ApiError, extractors::AuthSession};
use tundrad_domain::metrics::NewAlertRule;
use tundrad_repo::{AlertRuleRepo, PgPool};

pub async fn list_alert_rules(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
) -> Result<impl IntoResponse, ApiError> {
    let repo = AlertRuleRepo::new(&pool);
    let rules = repo.list_all().await.map_err(|e| {
        tracing::error!(error = %e, "list alert rules");
        ApiError::internal()
    })?;
    Ok(Json(serde_json::json!({ "data": rules })))
}

#[derive(Deserialize)]
pub struct CreateAlertRuleBody {
    pub name: String,
    pub description: Option<String>,
    pub scope_type: String,
    pub scope_id: Option<Uuid>,
    pub metric: String,
    pub condition: String,
    pub threshold: f64,
    pub duration_secs: i32,
    pub severity: String,
    pub channels: Option<serde_json::Value>,
}

pub async fn create_alert_rule(
    AuthSession(session): AuthSession,
    State(pool): State<PgPool>,
    Json(body): Json<CreateAlertRuleBody>,
) -> Result<impl IntoResponse, ApiError> {
    let repo = AlertRuleRepo::new(&pool);
    let new_rule = NewAlertRule {
        name: body.name,
        description: body.description,
        scope_type: body.scope_type,
        scope_id: body.scope_id,
        metric: body.metric,
        condition: body.condition,
        threshold: body.threshold,
        duration_secs: body.duration_secs,
        severity: body.severity,
        channels: body.channels.unwrap_or(serde_json::json!([])),
    };
    let rule = repo
        .create(&new_rule, session.operator_id)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "create alert rule");
            ApiError::internal()
        })?;
    Ok((StatusCode::CREATED, Json(rule)))
}

pub async fn enable_alert_rule(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let repo = AlertRuleRepo::new(&pool);
    repo.update_enabled(id, true).await.map_err(|e| {
        tracing::error!(error = %e, "enable alert rule");
        ApiError::internal()
    })?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn disable_alert_rule(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let repo = AlertRuleRepo::new(&pool);
    repo.update_enabled(id, false).await.map_err(|e| {
        tracing::error!(error = %e, "disable alert rule");
        ApiError::internal()
    })?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_alert_rule(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let repo = AlertRuleRepo::new(&pool);
    repo.delete(id).await.map_err(|e| {
        tracing::error!(error = %e, "delete alert rule");
        ApiError::internal()
    })?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub struct DeliveriesQuery {
    limit: Option<i64>,
}

pub async fn list_alert_deliveries(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Query(q): Query<DeliveriesQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let limit = q.limit.unwrap_or(50).min(200);
    let since = time::OffsetDateTime::now_utc() - time::Duration::hours(24);
    let rows: Vec<tundrad_domain::metrics::AlertDelivery> = tundrad_repo::AlertRuleRepo::new(&pool)
        .list_recent_deliveries(since, limit)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "list deliveries");
            ApiError::internal()
        })?;
    Ok(Json(serde_json::json!({ "data": rows })))
}
