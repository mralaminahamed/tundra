use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use tundrad_auth::{Action, AuthzService, Resource};
use tundrad_domain::{AuditActor, BackupTargetKind, NewAuditEntry, NewBackupJob, NewBackupTarget};
use tundrad_repo::PgPool;
use uuid::Uuid;

use crate::{error::ApiError, extractors::AuthSession};

// ── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct BackupTargetDto {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub config: serde_json::Value,
    pub is_default: bool,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct BackupJobDto {
    pub id: String,
    pub name: String,
    pub scope_kind: String,
    pub scope_id: Option<String>,
    pub target_id: String,
    pub schedule_cron: Option<String>,
    pub retention_policy: serde_json::Value,
    pub is_active: bool,
    pub last_run_at: Option<String>,
    pub last_status: Option<String>,
    pub next_run_at: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct BackupSnapshotDto {
    pub id: String,
    pub job_id: String,
    pub snapshot_id: String,
    pub size_bytes: i64,
    pub status: String,
    pub duration_ms: i32,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct RestorePreviewDto {
    pub restore_id: String,
    pub preview: serde_json::Value,
    pub expires_at: String,
}

#[derive(Deserialize)]
pub struct CreateBackupTargetRequest {
    pub name: String,
    pub kind: String,
    pub config: serde_json::Value,
    pub repo_password: String,
    pub is_default: Option<bool>,
}

#[derive(Deserialize)]
pub struct CreateBackupJobRequest {
    pub name: String,
    pub scope_kind: String,
    pub scope_id: Option<String>,
    pub target_id: String,
    pub schedule_cron: Option<String>,
    pub retention_policy: Option<serde_json::Value>,
}

#[derive(Deserialize)]
pub struct SnapshotJobQuery {
    pub job_id: Option<Uuid>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn to_target_dto(t: tundrad_domain::BackupTarget) -> BackupTargetDto {
    BackupTargetDto {
        id: t.id.to_string(),
        name: t.name,
        kind: t.kind.as_str().to_owned(),
        config: t.config,
        is_default: t.is_default,
        created_at: t.created_at.to_string(),
    }
}

fn to_job_dto(j: tundrad_domain::BackupJob) -> BackupJobDto {
    BackupJobDto {
        id: j.id.to_string(),
        name: j.name,
        scope_kind: j.scope_kind,
        scope_id: j.scope_id.map(|u| u.to_string()),
        target_id: j.target_id.to_string(),
        schedule_cron: j.schedule_cron,
        retention_policy: j.retention_policy,
        is_active: j.is_active,
        last_run_at: j.last_run_at.map(|t| t.to_string()),
        last_status: j.last_status,
        next_run_at: j.next_run_at.map(|t| t.to_string()),
        created_at: j.created_at.to_string(),
    }
}

fn to_snapshot_dto(s: tundrad_domain::BackupSnapshot) -> BackupSnapshotDto {
    BackupSnapshotDto {
        id: s.id.to_string(),
        job_id: s.job_id.to_string(),
        snapshot_id: s.snapshot_id,
        size_bytes: s.size_bytes,
        status: s.status,
        duration_ms: s.duration_ms,
        created_at: s.created_at.to_string(),
    }
}

// ── Backup Targets ────────────────────────────────────────────────────────────

pub async fn list_backup_targets(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::BackupTarget)
        .map_err(ApiError::from)?;
    let targets = tundrad_repo::BackupTargetRepo::new(&pool)
        .list()
        .await
        .map_err(ApiError::from)?;
    let data: Vec<_> = targets.into_iter().map(to_target_dto).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn get_backup_target(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::BackupTarget)
        .map_err(ApiError::from)?;
    let target = tundrad_repo::BackupTargetRepo::new(&pool)
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(to_target_dto(target)))
}

pub async fn create_backup_target(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<CreateBackupTargetRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Create, Resource::BackupTarget)
        .map_err(ApiError::from)?;

    let kind: BackupTargetKind = body
        .kind
        .parse()
        .map_err(|_| ApiError::bad_request("unknown backup target kind"))?;

    let target = tundrad_repo::BackupTargetRepo::new(&pool)
        .create(NewBackupTarget {
            name: body.name,
            kind,
            config: body.config,
            repo_password: body.repo_password,
            is_default: body.is_default.unwrap_or(false),
        })
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "backup_target.create".to_owned(),
            resource_type: Some("backup_target".to_owned()),
            resource_id: Some(target.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "name": target.name, "kind": target.kind.as_str() }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok((StatusCode::CREATED, Json(to_target_dto(target))))
}

pub async fn delete_backup_target(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Delete, Resource::BackupTarget)
        .map_err(ApiError::from)?;
    tundrad_repo::BackupTargetRepo::new(&pool)
        .delete(id)
        .await
        .map_err(ApiError::from)?;
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "backup_target.delete".to_owned(),
            resource_type: Some("backup_target".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::Value::Object(Default::default()),
        })
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn test_backup_target(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::BackupTarget)
        .map_err(ApiError::from)?;
    let target = tundrad_repo::BackupTargetRepo::new(&pool)
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?;
    let repo_password = tundrad_repo::BackupTargetRepo::new(&pool)
        .get_repo_password(id)
        .await
        .map_err(ApiError::from)?;

    let restic_target = tundrad_backup::BackupTarget {
        id: target.id,
        name: target.name.clone(),
        kind: target
            .kind
            .as_str()
            .parse()
            .map_err(|_| ApiError::bad_request("unknown kind"))?,
        config: target.config,
        repo_password,
        is_default: target.is_default,
    };
    tundrad_backup::ResticClient::new(restic_target)
        .check()
        .await
        .map_err(|e| ApiError::bad_request(&e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Backup Jobs ───────────────────────────────────────────────────────────────

pub async fn list_backup_jobs(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::BackupJob)
        .map_err(ApiError::from)?;
    let jobs = tundrad_repo::BackupJobRepo::new(&pool)
        .list()
        .await
        .map_err(ApiError::from)?;
    let data: Vec<_> = jobs.into_iter().map(to_job_dto).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn get_backup_job(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::BackupJob)
        .map_err(ApiError::from)?;
    let job = tundrad_repo::BackupJobRepo::new(&pool)
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(to_job_dto(job)))
}

pub async fn create_backup_job(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<CreateBackupJobRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Create, Resource::BackupJob)
        .map_err(ApiError::from)?;

    let target_id: Uuid = body
        .target_id
        .parse()
        .map_err(|_| ApiError::bad_request("invalid target_id"))?;
    let scope_id = body
        .scope_id
        .as_deref()
        .map(|s| s.parse::<Uuid>())
        .transpose()
        .map_err(|_| ApiError::bad_request("invalid scope_id"))?;

    let job = tundrad_repo::BackupJobRepo::new(&pool)
        .create(NewBackupJob {
            name: body.name,
            scope_kind: body.scope_kind,
            scope_id,
            target_id,
            schedule_cron: body.schedule_cron,
            retention_policy: body
                .retention_policy
                .unwrap_or_else(|| serde_json::json!({})),
        })
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "backup_job.create".to_owned(),
            resource_type: Some("backup_job".to_owned()),
            resource_id: Some(job.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "name": job.name, "scope_kind": job.scope_kind }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok((StatusCode::CREATED, Json(to_job_dto(job))))
}

pub async fn delete_backup_job(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Delete, Resource::BackupJob)
        .map_err(ApiError::from)?;
    tundrad_repo::BackupJobRepo::new(&pool)
        .delete(id)
        .await
        .map_err(ApiError::from)?;
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "backup_job.delete".to_owned(),
            resource_type: Some("backup_job".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::Value::Object(Default::default()),
        })
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn run_backup_job_now(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Create, Resource::BackupJob)
        .map_err(ApiError::from)?;
    // Verify job exists.
    tundrad_repo::BackupJobRepo::new(&pool)
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?;
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "backup_job.run_now".to_owned(),
            resource_type: Some("backup_job".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::Value::Object(Default::default()),
        })
        .await
        .map_err(ApiError::from)?;
    Ok((
        StatusCode::ACCEPTED,
        Json(serde_json::json!({ "queued": true, "job_id": id })),
    ))
}

// ── Backup Snapshots ──────────────────────────────────────────────────────────

pub async fn list_backup_snapshots(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Query(q): Query<SnapshotJobQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::BackupSnapshot)
        .map_err(ApiError::from)?;
    let snaps = tundrad_repo::BackupSnapshotRepo::new(&pool)
        .list(q.job_id)
        .await
        .map_err(ApiError::from)?;
    let data: Vec<_> = snaps.into_iter().map(to_snapshot_dto).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn get_backup_snapshot(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::BackupSnapshot)
        .map_err(ApiError::from)?;
    let snap = tundrad_repo::BackupSnapshotRepo::new(&pool)
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(to_snapshot_dto(snap)))
}

/// Step 1 of preview-then-confirm restore: create a pending restore record.
pub async fn initiate_restore(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(snapshot_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Create, Resource::BackupSnapshot)
        .map_err(ApiError::from)?;

    let snap = tundrad_repo::BackupSnapshotRepo::new(&pool)
        .find_by_id(snapshot_id)
        .await
        .map_err(ApiError::from)?;

    let preview = serde_json::json!({
        "snapshot_id": snap.snapshot_id,
        "size_bytes": snap.size_bytes,
        "job_id": snap.job_id,
        "created_at": snap.created_at.to_string(),
    });

    let expires_at = time::OffsetDateTime::now_utc() + time::Duration::minutes(10);

    let restore = tundrad_repo::BackupRestoreRepo::new(&pool)
        .create(snapshot_id, session.operator_id, None, preview.clone())
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "backup.restore.initiated".to_owned(),
            resource_type: Some("backup_restore".to_owned()),
            resource_id: Some(restore.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "snapshot_id": snapshot_id }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok((
        StatusCode::CREATED,
        Json(RestorePreviewDto {
            restore_id: restore.id.to_string(),
            preview,
            expires_at: expires_at.to_string(),
        }),
    ))
}

/// Step 2 of preview-then-confirm restore: confirm and start.
pub async fn confirm_restore(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(restore_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Create, Resource::BackupSnapshot)
        .map_err(ApiError::from)?;

    let restore = tundrad_repo::BackupRestoreRepo::new(&pool)
        .find_by_id(restore_id)
        .await
        .map_err(ApiError::from)?;

    if restore.status != "pending" {
        return Err(ApiError::bad_request("restore is not in pending state"));
    }
    // 10-minute expiry on the preview.
    let threshold = time::OffsetDateTime::now_utc() - time::Duration::minutes(10);
    if restore.created_at < threshold {
        return Err(ApiError::bad_request("restore preview has expired"));
    }

    tundrad_repo::BackupRestoreRepo::new(&pool)
        .update_status(restore_id, "confirmed")
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "backup.restore.confirmed".to_owned(),
            resource_type: Some("backup_restore".to_owned()),
            resource_id: Some(restore_id),
            ip: None,
            user_agent: None,
            details: serde_json::Value::Object(Default::default()),
        })
        .await
        .map_err(ApiError::from)?;

    Ok((
        StatusCode::ACCEPTED,
        Json(serde_json::json!({ "restore_id": restore_id, "status": "confirmed" })),
    ))
}

pub async fn cancel_restore(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(restore_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Delete, Resource::BackupSnapshot)
        .map_err(ApiError::from)?;
    tundrad_repo::BackupRestoreRepo::new(&pool)
        .cancel(restore_id, session.operator_id)
        .await
        .map_err(ApiError::from)?;
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "backup.restore.cancelled".to_owned(),
            resource_type: Some("backup_restore".to_owned()),
            resource_id: Some(restore_id),
            ip: None,
            user_agent: None,
            details: serde_json::Value::Object(Default::default()),
        })
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}
