use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::error::ApiError;
use tundrad_domain::operator::{NewOperator, OperatorRole};
use tundrad_repo::OperatorRepo;

// ─── Response types ───────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct SetupStatusResponse {
    pub needs_setup: bool,
    pub version: &'static str,
}

#[derive(Serialize)]
pub struct SetupInitResponse {
    pub ok: bool,
}

// ─── Request types ────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SetupInitRequest {
    pub name: String,
    pub email: String,
    pub password: String,
    pub instance_name: Option<String>,
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

/// GET /api/v1/setup/status
/// Public — returns whether first-time setup is required.
pub async fn status(State(pool): State<PgPool>) -> Result<Json<SetupStatusResponse>, ApiError> {
    let count = OperatorRepo::new(&pool)
        .count()
        .await
        .map_err(|_| ApiError::internal())?;

    Ok(Json(SetupStatusResponse {
        needs_setup: count == 0,
        version: env!("CARGO_PKG_VERSION"),
    }))
}

/// POST /api/v1/setup/init
/// Public — creates the first owner account. Returns 409 if already initialized.
pub async fn init(
    State(pool): State<PgPool>,
    Json(body): Json<SetupInitRequest>,
) -> Result<(StatusCode, Json<SetupInitResponse>), ApiError> {
    let repo = OperatorRepo::new(&pool);

    // Guard: only works on a fresh install
    let count = repo.count().await.map_err(|_| ApiError::internal())?;
    if count > 0 {
        return Err(ApiError::conflict("setup.already_initialized"));
    }

    // Validate inputs
    let name = body.name.trim().to_owned();
    let email = body.email.trim().to_lowercase();
    let password = body.password;

    if name.is_empty() {
        return Err(ApiError::bad_request("setup.name_required"));
    }
    if email.is_empty() || !email.contains('@') {
        return Err(ApiError::bad_request("setup.email_invalid"));
    }
    if password.len() < 8 {
        return Err(ApiError::bad_request("setup.password_too_short"));
    }

    // Hash password
    let password_hash =
        tundrad_crypto::hash_password(&password).map_err(|_| ApiError::internal())?;

    // Create owner operator
    let new_op = NewOperator {
        full_name: name,
        email,
        role: OperatorRole::Owner,
        password_hash: Some(password_hash),
    };
    repo.create(new_op)
        .await
        .map_err(|_| ApiError::internal())?;

    // Optionally persist instance name to platform settings
    if let Some(instance_name) = body.instance_name {
        let inst = instance_name.trim().to_owned();
        if !inst.is_empty() {
            let _ = sqlx::query(
                "INSERT INTO platform_settings (key, value, updated_by)
                 VALUES ('instance_name', $1, 'setup')
                 ON CONFLICT (key) DO UPDATE SET value = $1",
            )
            .bind(serde_json::Value::String(inst))
            .execute(&pool)
            .await;
        }
    }

    Ok((StatusCode::CREATED, Json(SetupInitResponse { ok: true })))
}
