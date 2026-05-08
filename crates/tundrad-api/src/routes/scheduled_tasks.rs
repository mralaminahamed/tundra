use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use tundrad_auth::{Action, AuthzService, Resource};
use tundrad_domain::{AuditActor, NewAuditEntry, NewScheduledTask};
use tundrad_repo::PgPool;
use uuid::Uuid;

use crate::{error::ApiError, extractors::AuthSession};

// ── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct ScheduledTaskDto {
    pub id: String,
    pub site_id: String,
    pub name: String,
    pub schedule: String,
    pub command: String,
    pub working_dir: String,
    pub is_active: bool,
    pub last_run_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct CreateScheduledTaskRequest {
    pub name: String,
    pub schedule: String,
    pub command: String,
    pub working_dir: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateScheduledTaskRequest {
    pub name: Option<String>,
    pub schedule: Option<String>,
    pub command: Option<String>,
    pub working_dir: Option<String>,
    pub is_active: Option<bool>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn to_dto(t: tundrad_domain::ScheduledTask) -> ScheduledTaskDto {
    ScheduledTaskDto {
        id: t.id.to_string(),
        site_id: t.site_id.to_string(),
        name: t.name,
        schedule: t.schedule,
        command: t.command,
        working_dir: t.working_dir,
        is_active: t.is_active,
        last_run_at: t.last_run_at.map(|dt| dt.to_string()),
        created_at: t.created_at.to_string(),
        updated_at: t.updated_at.to_string(),
    }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

pub async fn list_scheduled_tasks(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(site_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::ScheduledTask)
        .map_err(ApiError::from)?;
    let tasks = tundrad_repo::ScheduledTaskRepo::new(&pool)
        .list(site_id)
        .await
        .map_err(ApiError::from)?;
    let data: Vec<_> = tasks.into_iter().map(to_dto).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn create_scheduled_task(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(site_id): Path<Uuid>,
    Json(body): Json<CreateScheduledTaskRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Create, Resource::ScheduledTask)
        .map_err(ApiError::from)?;

    let task = tundrad_repo::ScheduledTaskRepo::new(&pool)
        .create(NewScheduledTask {
            site_id,
            name: body.name,
            schedule: body.schedule,
            command: body.command,
            working_dir: body.working_dir,
        })
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "scheduled_task.create".to_owned(),
            resource_type: Some("scheduled_task".to_owned()),
            resource_id: Some(task.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "name": task.name, "schedule": task.schedule }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok((StatusCode::CREATED, Json(to_dto(task))))
}

pub async fn get_scheduled_task(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::ScheduledTask)
        .map_err(ApiError::from)?;
    let task = tundrad_repo::ScheduledTaskRepo::new(&pool)
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(to_dto(task)))
}

pub async fn update_scheduled_task(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateScheduledTaskRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Update, Resource::ScheduledTask)
        .map_err(ApiError::from)?;
    let task = tundrad_repo::ScheduledTaskRepo::new(&pool)
        .update(
            id,
            tundrad_repo::UpdateScheduledTask {
                name: body.name,
                schedule: body.schedule,
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
            action: "scheduled_task.update".to_owned(),
            resource_type: Some("scheduled_task".to_owned()),
            resource_id: Some(task.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "is_active": task.is_active }),
        })
        .await
        .map_err(ApiError::from)?;
    Ok(Json(to_dto(task)))
}

pub async fn delete_scheduled_task(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Delete, Resource::ScheduledTask)
        .map_err(ApiError::from)?;
    tundrad_repo::ScheduledTaskRepo::new(&pool)
        .delete(id)
        .await
        .map_err(ApiError::from)?;
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "scheduled_task.delete".to_owned(),
            resource_type: Some("scheduled_task".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::Value::Object(Default::default()),
        })
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn run_scheduled_task_now(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Create, Resource::ScheduledTask)
        .map_err(ApiError::from)?;
    // Verify the task exists before recording the run.
    tundrad_repo::ScheduledTaskRepo::new(&pool)
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?;
    tundrad_repo::ScheduledTaskRepo::new(&pool)
        .mark_run(id)
        .await
        .map_err(ApiError::from)?;
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "scheduled_task.run_now".to_owned(),
            resource_type: Some("scheduled_task".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::Value::Object(Default::default()),
        })
        .await
        .map_err(ApiError::from)?;
    Ok((
        StatusCode::ACCEPTED,
        Json(serde_json::json!({ "queued": true, "task_id": id })),
    ))
}
