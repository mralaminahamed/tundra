use axum::{Json, extract::State, http::StatusCode, response::IntoResponse};
use serde_json::json;
use tundrad_repo::PgPool;

pub async fn healthz() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({"status":"ok"})))
}

pub async fn readyz(State(pool): State<PgPool>) -> impl IntoResponse {
    match sqlx::query("SELECT 1").execute(&pool).await {
        Ok(_) => (StatusCode::OK, Json(json!({"status":"ok","db":"ok"}))),
        Err(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"status":"degraded","db":"unavailable"})),
        ),
    }
}
