use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use tundrad_auth::{Action, AuthzService, Resource};
use tundrad_pki::SetupToken;
use tundrad_repo::PgPool;
use uuid::Uuid;

use crate::{error::ApiError, extractors::AuthSession};

#[derive(Deserialize)]
pub struct CreateServerRequest {
    pub name: String,
    pub hostname: String,
    pub region: Option<String>,
    pub os: Option<String>,
}

#[derive(Serialize)]
pub struct ServerDto {
    pub id: String,
    pub name: String,
    pub hostname: String,
    pub region: Option<String>,
    pub os: String,
    pub status: String,
    pub agent_version: Option<String>,
    pub agent_last_seen_at: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct CreateServerResponse {
    pub server: ServerDto,
    /// Single-use setup token — show once, never stored in plaintext.
    pub setup_token: String,
    pub enrolment_command: String,
}

pub async fn list(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Read, Resource::Server)
        .map_err(ApiError::from)?;

    let servers = tundrad_repo::ServerRepo::new(&pool)
        .list(100)
        .await
        .map_err(ApiError::from)?;

    let data: Vec<ServerDto> = servers.into_iter().map(to_dto).collect();
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
        .require(&op.role, Action::Read, Resource::Server)
        .map_err(ApiError::from)?;

    let server = tundrad_repo::ServerRepo::new(&pool)
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(to_dto(server)))
}

pub async fn create(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<CreateServerRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Create, Resource::Server)
        .map_err(ApiError::from)?;

    let token = SetupToken::generate();
    let token_hash = token.hash();

    let new_server = tundrad_domain::server::NewServer {
        name: body.name,
        hostname: body.hostname.clone(),
        region: body.region,
        os: body.os.unwrap_or_else(|| "ubuntu-24.04".to_owned()),
    };

    let server = tundrad_repo::ServerRepo::new(&pool)
        .create(new_server, &token_hash.0, token.expires_at)
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(tundrad_domain::NewAuditEntry {
            actor: tundrad_domain::AuditActor::Operator(session.operator_id),
            action: "server.create".to_owned(),
            resource_type: Some("server".to_owned()),
            resource_id: Some(server.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "hostname": server.hostname }),
        })
        .await
        .map_err(ApiError::from)?;

    let enrolment_command = format!(
        "curl -fsSL https://<panel-host>/agent/install | sudo bash -s -- --token={}",
        token.raw
    );

    Ok((
        StatusCode::CREATED,
        Json(CreateServerResponse {
            setup_token: token.raw,
            enrolment_command,
            server: to_dto(server),
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
        .require(&op.role, Action::Delete, Resource::Server)
        .map_err(ApiError::from)?;

    tundrad_repo::ServerRepo::new(&pool)
        .soft_delete(id)
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(tundrad_domain::NewAuditEntry {
            actor: tundrad_domain::AuditActor::Operator(session.operator_id),
            action: "server.delete".to_owned(),
            resource_type: Some("server".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::Value::Object(Default::default()),
        })
        .await
        .map_err(ApiError::from)?;

    Ok(StatusCode::NO_CONTENT)
}

fn to_dto(s: tundrad_domain::Server) -> ServerDto {
    ServerDto {
        id: s.id.to_string(),
        name: s.name,
        hostname: s.hostname,
        region: s.region,
        os: s.os,
        status: s.status.as_str().to_owned(),
        agent_version: s.agent_version,
        agent_last_seen_at: s.agent_last_seen_at.map(|t| t.to_string()),
        created_at: s.created_at.to_string(),
    }
}
