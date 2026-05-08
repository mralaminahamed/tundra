use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::TryRng;
use serde::{Deserialize, Serialize};
use tundrad_auth::{Action, AuthzService, Resource};
use tundrad_repo::{AuditLogRepo, NewPasskey, PasskeyChallengeRepo, PasskeyRepo, PgPool};
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
    pub phone: Option<String>,
    pub timezone: String,
    pub job_title: Option<String>,
    pub preferred_locale: String,
    pub last_login_at: Option<String>,
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

    let all = tundrad_repo::OperatorRepo::new(&pool)
        .list_all()
        .await
        .map_err(ApiError::from)?;

    let data: Vec<_> = all.iter().map(to_dto).collect();
    Ok(Json(serde_json::json!({ "data": data, "next_cursor": null })))
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
        .require(&op.role, Action::Read, Resource::Operator)
        .map_err(ApiError::from)?;
    let target = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(to_dto(&target)))
}

#[derive(Deserialize)]
pub struct UpdateOperatorRequest {
    pub full_name: Option<String>,
    pub email: Option<String>,
    pub role: Option<String>,
    pub is_active: Option<bool>,
}

pub async fn update(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateOperatorRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let actor = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&actor.role, Action::Update, Resource::Operator)
        .map_err(ApiError::from)?;

    if id == session.operator_id {
        return Err(ApiError::bad_request("cannot modify your own account"));
    }

    let mut target = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?;

    if body.full_name.is_some() || body.email.is_some() {
        target = tundrad_repo::OperatorRepo::new(&pool)
            .update_profile(id, body.full_name.as_deref(), body.email.as_deref(), None, None, None, None)
            .await
            .map_err(ApiError::from)?;
    }

    if let Some(role) = &body.role {
        target = tundrad_repo::OperatorRepo::new(&pool)
            .update_role(id, role)
            .await
            .map_err(ApiError::from)?;
    }

    if let Some(active) = body.is_active {
        target = tundrad_repo::OperatorRepo::new(&pool)
            .set_active(id, active)
            .await
            .map_err(ApiError::from)?;
    }

    AuditLogRepo::new(&pool)
        .append(tundrad_domain::NewAuditEntry {
            actor: tundrad_domain::AuditActor::Operator(session.operator_id),
            action: "operator.update".to_owned(),
            resource_type: Some("operator".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "role": body.role, "is_active": body.is_active }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok(Json(to_dto(&target)))
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

#[derive(Deserialize)]
pub struct PatchMeRequest {
    pub full_name: Option<String>,
    pub email: Option<String>,
    pub phone: Option<serde_json::Value>,   // null = clear, string = set
    pub timezone: Option<String>,
    pub job_title: Option<serde_json::Value>, // null = clear, string = set
    pub preferred_locale: Option<String>,
}

pub async fn patch_me(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<PatchMeRequest>,
) -> Result<impl IntoResponse, ApiError> {
    // JSON null = clear the field, absent = leave unchanged, string = set value
    fn nullable_str(v: &Option<serde_json::Value>) -> Option<Option<&str>> {
        match v {
            None => None,
            Some(serde_json::Value::Null) => Some(None),
            Some(serde_json::Value::String(s)) => Some(Some(s.as_str())),
            _ => None,
        }
    }

    let op = tundrad_repo::OperatorRepo::new(&pool)
        .update_profile(
            session.operator_id,
            body.full_name.as_deref(),
            body.email.as_deref(),
            nullable_str(&body.phone),
            body.timezone.as_deref(),
            nullable_str(&body.job_title),
            body.preferred_locale.as_deref(),
        )
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
        phone: op.phone.clone(),
        timezone: op.timezone.clone(),
        job_title: op.job_title.clone(),
        preferred_locale: op.preferred_locale.clone(),
        last_login_at: op.last_login_at.map(|t| t.to_string()),
        created_at: op.created_at.to_string(),
    }
}

// ─── Passkey management ───────────────────────────────────────────────────────

/// POST /api/v1/operators/me/passkeys/challenge
///
/// Returns a registration challenge for WebAuthn credential creation.
#[derive(Serialize)]
pub struct PasskeyRegChallengeResponse {
    pub challenge_id: Uuid,
    pub challenge: String, // base64url
}

pub async fn passkey_register_challenge(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
) -> Result<impl IntoResponse, ApiError> {
    let mut bytes = [0u8; 32];
    rand::rng().try_fill_bytes(&mut bytes).expect("rng");

    let challenge_id = PasskeyChallengeRepo::new(&pool)
        .create(&bytes, Some(session.operator_id))
        .await
        .map_err(ApiError::from)?;

    Ok(Json(PasskeyRegChallengeResponse {
        challenge_id,
        challenge: URL_SAFE_NO_PAD.encode(bytes),
    }))
}

/// POST /api/v1/operators/me/passkeys/register
///
/// Body: `{ challenge_id, credential_id (base64url), public_key_cbor (base64url),
///          label: String, aaguid: Option<String> }`
/// Stores the passkey credential. Challenge integrity is verified but full
/// attestation is not required (no certificate chain, no openssl).
#[derive(Deserialize)]
pub struct PasskeyRegisterRequest {
    pub challenge_id: Uuid,
    pub credential_id: String,   // base64url
    pub public_key_cbor: String, // base64url — raw COSE_Key bytes
    pub label: String,
    pub aaguid: Option<String>, // UUID string
}

#[derive(Serialize)]
pub struct PasskeyDto {
    pub id: String,
    pub label: Option<String>,
    pub aaguid: Option<String>,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

pub async fn passkey_register(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<PasskeyRegisterRequest>,
) -> Result<impl IntoResponse, ApiError> {
    // Verify the challenge belongs to this operator.
    let (_, challenge_operator_id) = PasskeyChallengeRepo::new(&pool)
        .consume(body.challenge_id)
        .await
        .map_err(|_| ApiError::bad_request("challenge not found or expired"))?;

    if challenge_operator_id != Some(session.operator_id) {
        return Err(ApiError::bad_request("challenge operator mismatch"));
    }

    let cred_id_bytes = URL_SAFE_NO_PAD
        .decode(&body.credential_id)
        .map_err(|_| ApiError::bad_request("invalid credential_id encoding"))?;

    let public_key_bytes = URL_SAFE_NO_PAD
        .decode(&body.public_key_cbor)
        .map_err(|_| ApiError::bad_request("invalid public_key_cbor encoding"))?;

    let aaguid: Option<Uuid> = body
        .aaguid
        .as_deref()
        .map(|s| {
            s.parse::<Uuid>()
                .map_err(|_| ApiError::bad_request("invalid aaguid format"))
        })
        .transpose()?;

    let passkey = PasskeyRepo::new(&pool)
        .create(NewPasskey {
            operator_id: session.operator_id,
            credential_id: cred_id_bytes,
            public_key: public_key_bytes,
            aaguid,
            device_label: Some(body.label.clone()),
        })
        .await
        .map_err(ApiError::from)?;

    AuditLogRepo::new(&pool)
        .append(tundrad_domain::NewAuditEntry {
            actor: tundrad_domain::AuditActor::Operator(session.operator_id),
            action: "operator.passkey_registered".to_owned(),
            resource_type: Some("passkey".to_owned()),
            resource_id: Some(passkey.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "label": body.label }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok((StatusCode::CREATED, Json(to_passkey_dto(&passkey))))
}

/// GET /api/v1/operators/me/passkeys
///
/// Lists the current operator's registered passkeys (public key bytes not included).
pub async fn passkeys_list(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
) -> Result<impl IntoResponse, ApiError> {
    let passkeys = PasskeyRepo::new(&pool)
        .list_by_operator(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    let dtos: Vec<PasskeyDto> = passkeys.iter().map(to_passkey_dto).collect();
    Ok(Json(serde_json::json!({ "data": dtos })))
}

/// DELETE /api/v1/operators/me/passkeys/{id}
pub async fn passkey_delete(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    PasskeyRepo::new(&pool)
        .delete(id, session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuditLogRepo::new(&pool)
        .append(tundrad_domain::NewAuditEntry {
            actor: tundrad_domain::AuditActor::Operator(session.operator_id),
            action: "operator.passkey_deleted".to_owned(),
            resource_type: Some("passkey".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({}),
        })
        .await
        .map_err(ApiError::from)?;

    Ok(StatusCode::NO_CONTENT)
}

fn to_passkey_dto(p: &tundrad_repo::Passkey) -> PasskeyDto {
    PasskeyDto {
        id: p.id.to_string(),
        label: p.device_label.clone(),
        aaguid: p.aaguid.map(|u| u.to_string()),
        created_at: p.created_at.to_string(),
        last_used_at: p.last_used_at.map(|t| t.to_string()),
    }
}
