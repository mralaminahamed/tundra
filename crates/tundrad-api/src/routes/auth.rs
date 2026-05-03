use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use tundrad_auth::SessionService;
use tundrad_repo::PgPool;

use crate::{error::ApiError, extractors::AuthSession};

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub operator: OperatorDto,
    pub requires_totp: bool,
}

#[derive(Serialize)]
pub struct OperatorDto {
    pub id: String,
    pub email: String,
    pub full_name: String,
    pub role: String,
}

pub async fn login(
    State(pool): State<PgPool>,
    headers: HeaderMap,
    Json(body): Json<LoginRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let user_agent = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let ip = headers
        .get("X-Forwarded-For")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);

    let svc = SessionService::new(&pool);
    let (session, raw_token) = svc
        .authenticate_password(&body.email, &body.password, user_agent, ip)
        .await
        .map_err(ApiError::from)?;

    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    let cookie = format!(
        "tundra_session={}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000",
        String::from_utf8_lossy(&raw_token),
    );

    Ok((
        StatusCode::OK,
        [(header::SET_COOKIE, cookie)],
        Json(LoginResponse {
            requires_totp: op.has_totp,
            operator: OperatorDto {
                id: op.id.to_string(),
                email: op.email,
                full_name: op.full_name,
                role: op.role.as_str().to_owned(),
            },
        }),
    ))
}

pub async fn logout(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
) -> Result<impl IntoResponse, ApiError> {
    let svc = SessionService::new(&pool);
    svc.revoke(session.id, "operator_logout")
        .await
        .map_err(ApiError::from)?;

    let clear = "tundra_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0";
    Ok((StatusCode::NO_CONTENT, [(header::SET_COOKIE, clear)]))
}

pub async fn me(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(OperatorDto {
        id: op.id.to_string(),
        email: op.email,
        full_name: op.full_name,
        role: op.role.as_str().to_owned(),
    }))
}
