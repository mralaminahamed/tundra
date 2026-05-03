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

#[derive(Serialize)]
pub struct OperatorDto {
    pub id: String,
    pub public_id: String,
    pub email: String,
    pub full_name: String,
    pub role: String,
    pub is_active: bool,
    pub has_totp: bool,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct InviteRequest {
    pub email: String,
    pub full_name: String,
    pub role: String,
    pub password: String,
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
        .require(&op.role, Action::Read, Resource::Operator)
        .map_err(ApiError::from)?;

    // For P1 return just the current operator; full pagination in P2.
    Ok(Json(serde_json::json!({
        "data": [to_dto(&op)],
        "next_cursor": null
    })))
}

pub async fn get_me(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(to_dto(&op)))
}

pub async fn invite(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<InviteRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let actor = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&actor.role, Action::Create, Resource::Operator)
        .map_err(ApiError::from)?;

    let role: tundrad_domain::operator::OperatorRole = body
        .role
        .parse()
        .map_err(|e: String| ApiError::bad_request(e))?;

    let password_hash =
        tundrad_crypto::hash_password(&body.password).map_err(|_| ApiError::internal())?;

    let new_op = tundrad_domain::operator::NewOperator {
        email: body.email,
        full_name: body.full_name,
        role,
        password_hash: Some(password_hash),
    };

    let op = tundrad_repo::OperatorRepo::new(&pool)
        .create(new_op)
        .await
        .map_err(ApiError::from)?;

    // Write audit entry.
    tundrad_repo::AuditLogRepo::new(&pool)
        .append(tundrad_domain::NewAuditEntry {
            actor: tundrad_domain::AuditActor::Operator(session.operator_id),
            action: "operator.invite".to_owned(),
            resource_type: Some("operator".to_owned()),
            resource_id: Some(op.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "email": op.email }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok((StatusCode::CREATED, Json(to_dto(&op))))
}

pub async fn delete(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let actor = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&actor.role, Action::Delete, Resource::Operator)
        .map_err(ApiError::from)?;

    tundrad_repo::OperatorRepo::new(&pool)
        .soft_delete(id)
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(tundrad_domain::NewAuditEntry {
            actor: tundrad_domain::AuditActor::Operator(session.operator_id),
            action: "operator.delete".to_owned(),
            resource_type: Some("operator".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::Value::Object(Default::default()),
        })
        .await
        .map_err(ApiError::from)?;

    Ok(StatusCode::NO_CONTENT)
}

fn to_dto(op: &tundrad_domain::Operator) -> OperatorDto {
    OperatorDto {
        id: op.id.to_string(),
        public_id: op.public_id.clone(),
        email: op.email.clone(),
        full_name: op.full_name.clone(),
        role: op.role.as_str().to_owned(),
        is_active: op.is_active,
        has_totp: op.has_totp,
        created_at: op.created_at.to_string(),
    }
}
