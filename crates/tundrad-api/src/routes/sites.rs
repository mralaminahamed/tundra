use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use tundrad_auth::{Action, AuthzService, Resource};
use tundrad_repo::PgPool;
use uuid::Uuid;

use crate::{error::ApiError, extractors::AuthSession};

// ── Request / Response DTOs ───────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateSiteRequest {
    pub name: String,
    pub primary_domain: String,
    pub server_id: Uuid,
    pub application: ApplicationSpec,
}

#[derive(Deserialize)]
pub struct ApplicationSpec {
    pub kind: String,
    pub runtime_version: String,
    pub build_command: Option<String>,
    pub start_command: Option<String>,
    pub health_check_path: Option<String>,
    pub source_kind: String,
    pub source_config: serde_json::Value,
}

#[derive(Deserialize)]
pub struct TriggerDeployRequest {
    pub trigger: Option<String>,
    pub source_ref: Option<String>,
}

#[derive(Serialize)]
pub struct SiteDto {
    pub id: String,
    pub name: String,
    pub primary_domain: String,
    pub server_id: String,
    pub status: String,
    pub document_root: String,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct DeploymentDto {
    pub id: String,
    pub site_id: String,
    pub status: String,
    pub triggered_by: String,
    pub source_ref: Option<String>,
    pub created_at: String,
    pub log_stream: String,
}

#[derive(Serialize)]
pub struct CreateSiteResponse {
    pub data: SiteDto,
    pub deployment: DeploymentDto,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

pub async fn list(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Read, Resource::Site)
        .map_err(ApiError::from)?;

    let sites = tundrad_repo::SiteRepo::new(&pool)
        .list(None, 100)
        .await
        .map_err(ApiError::from)?;

    let data: Vec<SiteDto> = sites.into_iter().map(to_site_dto).collect();
    Ok(Json(
        serde_json::json!({ "data": data, "next_cursor": null }),
    ))
}

pub async fn get(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Read, Resource::Site)
        .map_err(ApiError::from)?;

    let site = tundrad_repo::SiteRepo::new(&pool)
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(to_site_dto(site)))
}

pub async fn create(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<CreateSiteRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Create, Resource::Site)
        .map_err(ApiError::from)?;

    let new_site = tundrad_domain::NewSite {
        name: body.name,
        primary_domain: body.primary_domain,
        server_id: body.server_id,
        kind: body.application.kind,
        runtime_version: body.application.runtime_version,
        build_command: body.application.build_command,
        start_command: body.application.start_command,
        health_check_path: body
            .application
            .health_check_path
            .unwrap_or_else(|| "/".to_owned()),
        source_kind: body.application.source_kind,
        source_config: body.application.source_config,
    };

    let (site, _app, deploy) = tundrad_repo::SiteRepo::new(&pool)
        .create_with_application(new_site, session.operator_id)
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(tundrad_domain::NewAuditEntry {
            actor: tundrad_domain::AuditActor::Operator(session.operator_id),
            action: "site.create".to_owned(),
            resource_type: Some("site".to_owned()),
            resource_id: Some(site.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "domain": site.primary_domain }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok((
        StatusCode::CREATED,
        Json(CreateSiteResponse {
            deployment: to_deploy_dto(&deploy),
            data: to_site_dto(site),
        }),
    ))
}

pub async fn delete(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Delete, Resource::Site)
        .map_err(ApiError::from)?;

    tundrad_repo::SiteRepo::new(&pool)
        .soft_delete(id)
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(tundrad_domain::NewAuditEntry {
            actor: tundrad_domain::AuditActor::Operator(session.operator_id),
            action: "site.delete".to_owned(),
            resource_type: Some("site".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::Value::Object(Default::default()),
        })
        .await
        .map_err(ApiError::from)?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_deployments(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(site_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Read, Resource::Deployment)
        .map_err(ApiError::from)?;

    let deploys = tundrad_repo::SiteRepo::new(&pool)
        .list_deployments(site_id, 50)
        .await
        .map_err(ApiError::from)?;

    let data: Vec<DeploymentDto> = deploys.iter().map(to_deploy_dto).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn trigger_deploy(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(site_id): Path<Uuid>,
    Json(body): Json<TriggerDeployRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Create, Resource::Deployment)
        .map_err(ApiError::from)?;

    let site = tundrad_repo::SiteRepo::new(&pool)
        .find_by_id(site_id)
        .await
        .map_err(ApiError::from)?;

    let app_id = site
        .application_id
        .ok_or_else(|| ApiError::bad_request("site has no application yet"))?;

    let trigger = body.trigger.as_deref().unwrap_or("manual");
    let deploy = tundrad_repo::SiteRepo::new(&pool)
        .create_deployment(
            site_id,
            app_id,
            trigger,
            session.operator_id,
            body.source_ref.as_deref(),
        )
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(tundrad_domain::NewAuditEntry {
            actor: tundrad_domain::AuditActor::Operator(session.operator_id),
            action: "site.deploy".to_owned(),
            resource_type: Some("deployment".to_owned()),
            resource_id: Some(deploy.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "site_id": site_id }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok((StatusCode::ACCEPTED, Json(to_deploy_dto(&deploy))))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn to_site_dto(s: tundrad_domain::Site) -> SiteDto {
    SiteDto {
        id: s.id.to_string(),
        name: s.name,
        primary_domain: s.primary_domain,
        server_id: s.server_id.to_string(),
        status: s.status.as_str().to_owned(),
        document_root: s.document_root,
        created_at: s.created_at.to_string(),
    }
}

fn to_deploy_dto(d: &tundrad_domain::Deployment) -> DeploymentDto {
    let log_stream = format!("/ws/v1/events?subscribe=deployment:{}", d.id);
    DeploymentDto {
        id: d.id.to_string(),
        site_id: d.site_id.to_string(),
        status: d.status.as_str().to_owned(),
        triggered_by: d.triggered_by.clone(),
        source_ref: d.source_ref.clone(),
        created_at: d.created_at.to_string(),
        log_stream,
    }
}
