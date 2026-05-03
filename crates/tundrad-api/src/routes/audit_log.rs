use axum::{
    Json,
    extract::{Query, State},
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use tundrad_auth::{Action, AuthzService, Resource};
use tundrad_repo::PgPool;
use uuid::Uuid;

use crate::{error::ApiError, extractors::AuthSession};

#[derive(Deserialize)]
pub struct ListParams {
    pub limit: Option<i64>,
    pub cursor: Option<Uuid>,
}

#[derive(Serialize)]
pub struct AuditEntryDto {
    pub id: String,
    pub occurred_at: String,
    pub actor_type: String,
    pub actor_id: Option<String>,
    pub action: String,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub ip: Option<String>,
    pub details: serde_json::Value,
}

pub async fn list(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Query(params): Query<ListParams>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Read, Resource::AuditLog)
        .map_err(ApiError::from)?;

    let limit = params.limit.unwrap_or(50).min(200);
    let entries = tundrad_repo::AuditLogRepo::new(&pool)
        .list(limit, params.cursor)
        .await
        .map_err(ApiError::from)?;

    let next_cursor = entries.last().map(|e| e.id.to_string());
    let data: Vec<AuditEntryDto> = entries
        .into_iter()
        .map(|e| AuditEntryDto {
            id: e.id.to_string(),
            occurred_at: e.occurred_at.to_string(),
            actor_type: e.actor_type,
            actor_id: e.actor_id.map(|u| u.to_string()),
            action: e.action,
            resource_type: e.resource_type,
            resource_id: e.resource_id.map(|u| u.to_string()),
            ip: e.ip,
            details: e.details,
        })
        .collect();

    Ok(Json(serde_json::json!({
        "data": data,
        "next_cursor": next_cursor
    })))
}
