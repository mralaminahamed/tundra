use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use tundrad_auth::{Action, AuthzService, Resource};
use tundrad_domain::{
    AuditActor, NewAuditEntry,
    site_move::{MOVE_STAGES, NewSiteMove, SiteMove, SiteMoveStatus},
};
use tundrad_repo::PgPool;
use uuid::Uuid;

use crate::{error::ApiError, extractors::AuthSession};

// ── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct SiteMoveDto {
    pub id: String,
    pub site_id: String,
    pub from_server_id: String,
    pub to_server_id: String,
    pub status: String,
    pub current_stage: Option<String>,
    pub error: Option<String>,
    pub initiated_by: Option<String>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct InitiateMoveRequest {
    pub to_server_id: Uuid,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn to_dto(m: SiteMove) -> SiteMoveDto {
    SiteMoveDto {
        id: m.id.to_string(),
        site_id: m.site_id.to_string(),
        from_server_id: m.from_server_id.to_string(),
        to_server_id: m.to_server_id.to_string(),
        status: m.status.to_string(),
        current_stage: m.current_stage,
        error: m.error,
        initiated_by: m.initiated_by.map(|id| id.to_string()),
        started_at: m.started_at.map(|t| t.to_string()),
        finished_at: m.finished_at.map(|t| t.to_string()),
        created_at: m.created_at.to_string(),
    }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

pub async fn initiate_site_move(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(site_id): Path<Uuid>,
    Json(body): Json<InitiateMoveRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Create, Resource::SiteMove)
        .map_err(ApiError::from)?;

    let site = tundrad_repo::SiteRepo::new(&pool)
        .find_by_id(site_id)
        .await
        .map_err(ApiError::from)?;

    let move_record = tundrad_repo::SiteMoveRepo::new(&pool)
        .create(NewSiteMove {
            site_id,
            from_server_id: site.server_id,
            to_server_id: body.to_server_id,
            initiated_by: Some(session.operator_id),
        })
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(NewAuditEntry {
            actor: AuditActor::Operator(session.operator_id),
            action: "sites.move.initiated".to_owned(),
            resource_type: Some("site_move".to_owned()),
            resource_id: Some(move_record.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({
                "site_id": site_id,
                "from_server_id": site.server_id,
                "to_server_id": body.to_server_id,
            }),
        })
        .await
        .map_err(ApiError::from)?;

    // Spawn stub migration pipeline — walks all stages then completes.
    let pool2 = pool.clone();
    let move_id = move_record.id;
    let to_server_id = body.to_server_id;
    tokio::spawn(async move {
        let repo = tundrad_repo::SiteMoveRepo::new(&pool2);
        for stage in MOVE_STAGES {
            let _ = repo.set_stage(move_id, stage).await;
        }
        let _ = repo.complete_move(move_id, site_id, to_server_id).await;
    });

    Ok((StatusCode::ACCEPTED, Json(to_dto(move_record))))
}

pub async fn get_site_move(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(move_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::SiteMove)
        .map_err(ApiError::from)?;

    let m = tundrad_repo::SiteMoveRepo::new(&pool)
        .find_by_id(move_id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(to_dto(m)))
}

pub async fn list_site_moves(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(site_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::SiteMove)
        .map_err(ApiError::from)?;

    let moves = tundrad_repo::SiteMoveRepo::new(&pool)
        .list_for_site(site_id)
        .await
        .map_err(ApiError::from)?;
    let data: Vec<_> = moves.into_iter().map(to_dto).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn abandon_site_move(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(move_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Create, Resource::SiteMove)
        .map_err(ApiError::from)?;

    tundrad_repo::SiteMoveRepo::new(&pool)
        .set_status(
            move_id,
            SiteMoveStatus::Abandoned,
            Some("operator_cancelled"),
        )
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}
