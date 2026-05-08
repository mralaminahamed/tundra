use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{agent_auth::AgentServer, error::ApiError};

// ── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct QueuedDeploymentDto {
    pub deployment_id: String,
    pub site_id: String,
    pub application_id: String,
    pub kind: String,
    pub runtime_version: Option<String>,
    pub build_command: Option<String>,
    pub start_command: Option<String>,
    pub health_check_path: String,
    pub source_kind: String,
    pub source_config: serde_json::Value,
    pub source_ref: Option<String>,
    pub document_root: String,
    pub primary_domain: String,
}

#[derive(Deserialize)]
pub struct UpdateDeploymentStatusRequest {
    /// One of: `"running"`, `"succeeded"`, `"failed"`
    pub status: String,
    /// Unix timestamp (seconds) when the deployment was picked up.
    pub started_at: Option<i64>,
    /// Unix timestamp (seconds) when the deployment finished.
    pub finished_at: Option<i64>,
    /// Human-readable error message (only for `"failed"` status).
    pub error: Option<String>,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/// `GET /api/v1/agent/deployments`
///
/// Returns the next batch of queued deployments for the calling server.
pub async fn list_queued_deployments(
    State(pool): State<PgPool>,
    AgentServer { server_id }: AgentServer,
) -> Result<impl IntoResponse, ApiError> {
    let deployments = tundrad_repo::SiteRepo::new(&pool)
        .list_queued_for_server(server_id, 10)
        .await
        .map_err(ApiError::from)?;

    let dtos: Vec<QueuedDeploymentDto> = deployments
        .into_iter()
        .map(|d| QueuedDeploymentDto {
            deployment_id: d.deployment_id.to_string(),
            site_id: d.site_id.to_string(),
            application_id: d.application_id.to_string(),
            kind: d.kind,
            runtime_version: d.runtime_version,
            build_command: d.build_command,
            start_command: d.start_command,
            health_check_path: d.health_check_path,
            source_kind: d.source_kind,
            source_config: d.source_config,
            source_ref: d.source_ref,
            document_root: d.document_root,
            primary_domain: d.primary_domain,
        })
        .collect();

    Ok(Json(serde_json::json!({ "data": dtos })))
}

/// `PATCH /api/v1/agent/deployments/:id/status`
///
/// Called by the agent to transition a deployment through `running → succeeded|failed`.
pub async fn update_deployment_status(
    State(pool): State<PgPool>,
    AgentServer { server_id: _ }: AgentServer,
    Path(deployment_id): Path<Uuid>,
    Json(body): Json<UpdateDeploymentStatusRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let started_at = body
        .started_at
        .and_then(|ts| OffsetDateTime::from_unix_timestamp(ts).ok());
    let finished_at = body
        .finished_at
        .and_then(|ts| OffsetDateTime::from_unix_timestamp(ts).ok());

    tundrad_repo::SiteRepo::new(&pool)
        .update_deployment_status(
            deployment_id,
            &body.status,
            started_at,
            finished_at,
            body.error.as_deref(),
        )
        .await
        .map_err(ApiError::from)?;

    Ok(StatusCode::NO_CONTENT)
}
