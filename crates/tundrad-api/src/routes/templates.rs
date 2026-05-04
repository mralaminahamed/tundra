use axum::{Json, response::IntoResponse};
use serde_json::json;

use crate::templates::builtin_templates;

/// `GET /api/v1/templates` — returns all built-in site templates.
/// No authentication required; this is a public catalogue.
pub async fn list() -> impl IntoResponse {
    let templates = builtin_templates();
    Json(json!({ "data": templates }))
}
