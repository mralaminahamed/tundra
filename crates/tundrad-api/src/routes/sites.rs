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

use crate::{error::ApiError, extractors::AuthSession, serde_util::fmt_dt};

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
    pub source_kind: Option<String>,
    pub source_config: Option<serde_json::Value>,
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

#[derive(Deserialize)]
pub struct UpdateSiteRequest {
    pub name: Option<String>,
    pub primary_domain: Option<String>,
    pub status: Option<String>,
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

    // Batch-fetch source_kind + source_config from applications (one query, no N+1)
    let site_ids: Vec<Uuid> = sites.iter().map(|s| s.id).collect();
    let app_rows: Vec<(Uuid, String, serde_json::Value)> = sqlx::query_as(
        "SELECT site_id, source_kind, source_config FROM applications WHERE site_id = ANY($1)",
    )
    .bind(&site_ids)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();
    let source_map: std::collections::HashMap<Uuid, (String, serde_json::Value)> = app_rows
        .into_iter()
        .map(|(id, k, c)| (id, (k, c)))
        .collect();

    let data: Vec<SiteDto> = sites
        .into_iter()
        .map(|s| {
            let (sk, sc) = source_map
                .get(&s.id)
                .map(|(k, c)| (Some(k.clone()), Some(c.clone())))
                .unwrap_or((None, None));
            to_site_dto(s, sk, sc)
        })
        .collect();
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

    let app_row: Option<(String, serde_json::Value)> = sqlx::query_as(
        "SELECT source_kind, source_config FROM applications WHERE site_id = $1 LIMIT 1",
    )
    .bind(site.id)
    .fetch_optional(&pool)
    .await
    .unwrap_or(None);

    let (source_kind, source_config) = app_row
        .map(|(k, c)| (Some(k), Some(c)))
        .unwrap_or((None, None));

    Ok(Json(to_site_dto(site, source_kind, source_config)))
}

pub async fn update(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateSiteRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Update, Resource::Site)
        .map_err(ApiError::from)?;

    let site = tundrad_repo::SiteRepo::new(&pool)
        .update(
            id,
            body.name.as_deref(),
            body.primary_domain.as_deref(),
            body.status.as_deref(),
        )
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(tundrad_domain::NewAuditEntry {
            actor: tundrad_domain::AuditActor::Operator(session.operator_id),
            action: "site.update".to_owned(),
            resource_type: Some("site".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "name": body.name, "primary_domain": body.primary_domain }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok(Json(to_site_dto(site, None, None)))
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

    let (site, app, deploy) = tundrad_repo::SiteRepo::new(&pool)
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
            data: to_site_dto(site, Some(app.source_kind), Some(app.source_config)),
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

fn to_site_dto(
    s: tundrad_domain::Site,
    source_kind: Option<String>,
    source_config: Option<serde_json::Value>,
) -> SiteDto {
    SiteDto {
        id: s.id.to_string(),
        name: s.name,
        primary_domain: s.primary_domain,
        server_id: s.server_id.to_string(),
        status: s.status.as_str().to_owned(),
        document_root: s.document_root,
        source_kind,
        source_config,
        created_at: fmt_dt(s.created_at),
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
        created_at: fmt_dt(d.created_at),
        log_stream,
    }
}
