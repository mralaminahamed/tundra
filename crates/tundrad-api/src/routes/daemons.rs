use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use tundrad_auth::{Action, AuthzService, Resource};
use tundrad_domain::{AuditActor, NewAuditEntry, NewDaemon};
use tundrad_repo::PgPool;
use uuid::Uuid;

use crate::{error::ApiError, extractors::AuthSession};

// ── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct DaemonDto {
    pub id: String,
    pub site_id: String,
    pub name: String,
    pub command: String,
    pub working_dir: String,
    pub env_file: String,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct CreateDaemonRequest {
    pub name: String,
    pub command: String,
    pub working_dir: Option<String>,
    pub env_file: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateDaemonRequest {
    pub name: Option<String>,
    pub command: Option<String>,
    pub working_dir: Option<String>,
    pub is_active: Option<bool>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn to_daemon_dto(d: tundrad_domain::Daemon) -> DaemonDto {
    DaemonDto {
        id: d.id.to_string(),
        site_id: d.site_id.to_string(),
        name: d.name,
        command: d.command,
        working_dir: d.working_dir,
        env_file: d.env_file,
        is_active: d.is_active,
        created_at: d.created_at.to_string(),
        updated_at: d.updated_at.to_string(),
    }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

pub async fn list_daemons(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(site_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::Daemon)
        .map_err(ApiError::from)?;
    let daemons = tundrad_repo::DaemonRepo::new(&pool)
        .list(site_id)
        .await
        .map_err(ApiError::from)?;
    let data: Vec<_> = daemons.into_iter().map(to_daemon_dto).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn create_daemon(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(site_id): Path<Uuid>,
    Json(body): Json<CreateDaemonRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Create, Resource::Daemon)
        .map_err(ApiError::from)?;
    let daemon = tundrad_repo::DaemonRepo::new(&pool)
        .create(NewDaemon {
            site_id,
            name: body.name,
            command: body.command,
            working_dir: body.working_dir,
            env_file: body.env_file,
        })
        .await
        .map_err(ApiError::from)?;
    Ok((StatusCode::CREATED, Json(to_daemon_dto(daemon))))
}

pub async fn get_daemon(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::Daemon)
        .map_err(ApiError::from)?;
    let daemon = tundrad_repo::DaemonRepo::new(&pool)
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(to_daemon_dto(daemon)))
}

pub async fn update_daemon(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateDaemonRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Update, Resource::Daemon)
        .map_err(ApiError::from)?;
    let daemon = tundrad_repo::DaemonRepo::new(&pool)
        .update(
            id,
            tundrad_repo::UpdateDaemon {
                name: body.name,
                command: body.command,
                working_dir: body.working_dir,
                is_active: body.is_active,
            },
        )
        .await
        .map_err(ApiError::from)?;
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "daemon.update".to_owned(),
            resource_type: Some("daemon".to_owned()),
            resource_id: Some(daemon.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "is_active": daemon.is_active }),
        })
        .await
        .map_err(ApiError::from)?;
    Ok(Json(to_daemon_dto(daemon)))
}

pub async fn delete_daemon(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Delete, Resource::Daemon)
        .map_err(ApiError::from)?;
    tundrad_repo::DaemonRepo::new(&pool)
        .delete(id)
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}
