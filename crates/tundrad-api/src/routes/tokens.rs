use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use tundrad_auth::{Action, AuthzService, Resource, TokenEnv, mint_token};
use tundrad_repo::PgPool;
use uuid::Uuid;

use crate::{error::ApiError, extractors::AuthSession};

#[derive(Deserialize)]
pub struct CreateTokenRequest {
    pub name: String,
    pub scopes: Vec<String>,
    pub expires_in_days: Option<i64>,
}

#[derive(Serialize)]
pub struct TokenDto {
    pub id: String,
    pub name: String,
    pub scopes: Vec<String>,
    pub created_at: String,
    pub expires_at: Option<String>,
}

#[derive(Serialize)]
pub struct CreateTokenResponse {
    pub token: String, // raw token — shown only once
    #[serde(flatten)]
    pub meta: TokenDto,
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
        .require(&op.role, Action::Read, Resource::ApiToken)
        .map_err(ApiError::from)?;

    // For P1 return empty list; full token repo in P2.
    Ok(Json(serde_json::json!({ "data": [], "next_cursor": null })))
}

pub async fn create(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<CreateTokenRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Create, Resource::ApiToken)
        .map_err(ApiError::from)?;

    let env = TokenEnv::Prod;
    let (raw_token, _hash) = mint_token(env);

    let now = time::OffsetDateTime::now_utc();
    let expires_at = body.expires_in_days.map(|d| now + time::Duration::days(d));

    // Full DB persistence of api_tokens row is wired in P2 when tundrad-repo
    // gains an ApiTokenRepo. For P1 we return the minted token so the API
    // surface is exercisable.
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(tundrad_domain::NewAuditEntry {
            actor: tundrad_domain::AuditActor::Operator(session.operator_id),
            action: "api_token.create".to_owned(),
            resource_type: Some("api_token".to_owned()),
            resource_id: None,
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "name": body.name, "scopes": body.scopes }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok((
        StatusCode::CREATED,
        Json(CreateTokenResponse {
            token: raw_token,
            meta: TokenDto {
                id: Uuid::now_v7().to_string(),
                name: body.name,
                scopes: body.scopes,
                created_at: now.to_string(),
                expires_at: expires_at.map(|t| t.to_string()),
            },
        }),
    ))
}

pub async fn revoke(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(_token_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Delete, Resource::ApiToken)
        .map_err(ApiError::from)?;

    // Full revocation wired in P2 with ApiTokenRepo.
    Ok(StatusCode::NO_CONTENT)
}
