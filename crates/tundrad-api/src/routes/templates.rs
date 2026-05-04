use axum::{Json, extract::State, response::IntoResponse};
use serde_json::json;
use tundrad_repo::PgPool;

use crate::templates::builtin_templates;

/// GET /api/v1/templates — built-in templates merged with plugin-contributed
/// templates whose owning plugin is currently enabled.
pub async fn list(State(pool): State<PgPool>) -> impl IntoResponse {
    let mut templates = builtin_templates();

    let plugin_rows: Vec<serde_json::Value> = sqlx::query_scalar(
        "SELECT pt.manifest
         FROM plugin_templates pt
         JOIN plugins p ON p.plugin_id = pt.plugin_id
         WHERE p.state = 'enabled'
         ORDER BY pt.template_id ASC",
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    for manifest_json in plugin_rows {
        if let Ok(manifest) = serde_json::from_value(manifest_json) {
            templates.push(manifest);
        }
    }

    templates.sort_by(|a, b| a.id.cmp(&b.id));
    Json(json!({ "data": templates }))
}
