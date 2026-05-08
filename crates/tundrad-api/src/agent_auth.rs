use axum::{extract::FromRequestParts, http::request::Parts};
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::ApiError;

/// Axum extractor that authenticates an agent request via the `X-Tundra-Server-Id` header.
///
/// Reads the header, parses it as a UUID, and verifies the corresponding server
/// record exists (and is not soft-deleted) in the database.
pub struct AgentServer {
    pub server_id: Uuid,
}

impl FromRequestParts<PgPool> for AgentServer {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, pool: &PgPool) -> Result<Self, Self::Rejection> {
        let server_id_str = parts
            .headers
            .get("X-Tundra-Server-Id")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| {
                ApiError::new(
                    axum::http::StatusCode::UNAUTHORIZED,
                    "MISSING_SERVER_ID",
                    "Missing X-Tundra-Server-Id header",
                )
            })?;

        let server_id: Uuid = server_id_str.parse().map_err(|_| {
            ApiError::new(
                axum::http::StatusCode::UNAUTHORIZED,
                "INVALID_SERVER_ID",
                "Invalid server ID format",
            )
        })?;

        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM servers WHERE id = $1 AND deleted_at IS NULL)",
        )
        .bind(server_id)
        .fetch_one(pool)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "db error checking server existence");
            ApiError::internal()
        })?;

        if !exists {
            return Err(ApiError::new(
                axum::http::StatusCode::UNAUTHORIZED,
                "UNKNOWN_SERVER",
                "Unknown server",
            ));
        }

        Ok(AgentServer { server_id })
    }
}
