use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractors::AuthSession;
use tundrad_repo::PgPool;

#[derive(sqlx::FromRow)]
struct PluginRow {
    id: Uuid,
    plugin_id: String,
    version: String,
    manifest: serde_json::Value,
    source: String,
    state: String,
    enabled_at: Option<time::OffsetDateTime>,
    signature_verified: bool,
    created_at: time::OffsetDateTime,
}

// GET /api/v1/plugins — list installed plugins
pub async fn list_plugins(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
) -> Result<impl IntoResponse, ApiError> {
    let rows = sqlx::query_as::<_, PluginRow>(
        "SELECT id, plugin_id, version, manifest, source, state, \
         enabled_at, signature_verified, created_at \
         FROM plugins ORDER BY created_at DESC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "db");
        ApiError::internal()
    })?;

    let plugins: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.id,
                "plugin_id": r.plugin_id,
                "version": r.version,
                "manifest": r.manifest,
                "source": r.source,
                "state": r.state,
                "enabled_at": r.enabled_at,
                "signature_verified": r.signature_verified,
                "created_at": r.created_at,
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "data": plugins })))
}

// GET /api/v1/plugins/:id
pub async fn get_plugin(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let row = sqlx::query_as::<_, PluginRow>(
        "SELECT id, plugin_id, version, manifest, source, state, \
         enabled_at, signature_verified, created_at \
         FROM plugins WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "db");
        ApiError::internal()
    })?;

    match row {
        Some(r) => Ok(Json(serde_json::json!({
            "id": r.id,
            "plugin_id": r.plugin_id,
            "version": r.version,
            "manifest": r.manifest,
            "source": r.source,
            "state": r.state,
            "enabled_at": r.enabled_at,
            "signature_verified": r.signature_verified,
            "created_at": r.created_at,
        }))
        .into_response()),
        None => Err(ApiError::not_found("plugin")),
    }
}

// POST /api/v1/plugins/:id/enable
pub async fn enable_plugin(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    sqlx::query("UPDATE plugins SET state = 'enabled', enabled_at = now() WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "db");
            ApiError::internal()
        })?;
    Ok(StatusCode::NO_CONTENT)
}

// POST /api/v1/plugins/:id/disable
pub async fn disable_plugin(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    sqlx::query("UPDATE plugins SET state = 'disabled', disabled_at = now() WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "db");
            ApiError::internal()
        })?;
    Ok(StatusCode::NO_CONTENT)
}
