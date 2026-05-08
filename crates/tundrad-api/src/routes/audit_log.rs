use axum::{
    Json,
    extract::{Query, State},
    http::header,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use tundrad_auth::{Action, AuthzService, Resource};
use tundrad_repo::PgPool;
use uuid::Uuid;

use crate::{error::ApiError, extractors::AuthSession};

#[derive(Deserialize)]
pub struct ListParams {
    pub limit: Option<i64>,
    pub cursor: Option<Uuid>,
    // filters
    pub resource_type: Option<String>,
    pub actor_type: Option<String>,
    pub actor_id: Option<Uuid>,
    pub action: Option<String>,       // prefix match: "operator." matches all operator.* actions
    pub search: Option<String>,       // free-text search on action + resource_id
    pub from: Option<String>,         // ISO datetime lower bound
    pub until: Option<String>,        // ISO datetime upper bound
}

#[derive(Serialize)]
pub struct AuditEntryDto {
    pub id: String,
    pub occurred_at: String,
    pub actor_type: String,
    pub actor_id: Option<String>,
    pub actor_email: Option<String>,  // joined from operators table
    pub action: String,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    pub details: serde_json::Value,
}

pub async fn list(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Query(params): Query<ListParams>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::AuditLog)
        .map_err(ApiError::from)?;

    let entries = fetch_entries(&pool, &params).await?;
    let next_cursor = entries.last().map(|e| e.id.clone());

    Ok(Json(serde_json::json!({
        "data": entries,
        "next_cursor": next_cursor
    })))
}

pub async fn export_csv(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Query(params): Query<ListParams>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::AuditLog)
        .map_err(ApiError::from)?;

    // For export, override limit to max
    let export_params = ListParams { limit: Some(5000), cursor: None, ..params };
    let entries = fetch_entries(&pool, &export_params).await?;

    let mut csv = "id,occurred_at,actor_type,actor_email,action,resource_type,resource_id,ip\n".to_owned();
    for e in &entries {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{}\n",
            e.id,
            e.occurred_at,
            e.actor_type,
            e.actor_email.as_deref().unwrap_or(""),
            e.action,
            e.resource_type.as_deref().unwrap_or(""),
            e.resource_id.as_deref().unwrap_or(""),
            e.ip.as_deref().unwrap_or(""),
        ));
    }

    Ok((
        [(header::CONTENT_TYPE, "text/csv"), (header::CONTENT_DISPOSITION, "attachment; filename=\"audit-log.csv\"")],
        csv,
    ))
}

async fn fetch_entries(pool: &PgPool, params: &ListParams) -> Result<Vec<AuditEntryDto>, ApiError> {
    let limit = params.limit.unwrap_or(50).min(200);

    #[derive(sqlx::FromRow)]
    struct Row {
        id: Uuid,
        occurred_at: time::OffsetDateTime,
        actor_type: String,
        actor_id: Option<Uuid>,
        actor_email: Option<String>,
        action: String,
        resource_type: Option<String>,
        resource_id: Option<Uuid>,
        ip: Option<String>,
        user_agent: Option<String>,
        details: serde_json::Value,
    }

    // Build dynamic WHERE clauses
    let mut conditions: Vec<String> = Vec::new();
    let mut bind_idx: i32 = 1;

    // cursor pagination
    if params.cursor.is_some() {
        conditions.push(format!(
            "a.occurred_at < (SELECT occurred_at FROM audit_log WHERE id = ${bind_idx})"
        ));
        bind_idx += 1;
    }
    if let Some(ref rt) = params.resource_type {
        if !rt.is_empty() {
            conditions.push(format!("a.resource_type = ${bind_idx}"));
            bind_idx += 1;
        }
    }
    if let Some(ref at) = params.actor_type {
        if !at.is_empty() {
            conditions.push(format!("a.actor_type = ${bind_idx}"));
            bind_idx += 1;
        }
    }
    if params.actor_id.is_some() {
        conditions.push(format!("a.actor_id = ${bind_idx}"));
        bind_idx += 1;
    }
    if let Some(ref act) = params.action {
        if !act.is_empty() {
            // prefix search: "operator." matches all operator.* actions
            if act.ends_with('.') || act.ends_with('*') {
                conditions.push(format!("a.action LIKE ${bind_idx}"));
            } else {
                conditions.push(format!("a.action = ${bind_idx}"));
            }
            bind_idx += 1;
        }
    }
    if let Some(ref s) = params.search {
        if !s.is_empty() {
            conditions.push(format!(
                "(a.action ILIKE ${bind_idx} OR a.resource_id::text ILIKE ${bind_idx})"
            ));
            bind_idx += 1;
        }
    }
    if let Some(ref from) = params.from {
        if !from.is_empty() {
            conditions.push(format!("a.occurred_at >= ${bind_idx}"));
            bind_idx += 1;
        }
    }
    if let Some(ref until) = params.until {
        if !until.is_empty() {
            conditions.push(format!("a.occurred_at <= ${bind_idx}"));
            bind_idx += 1;
        }
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let sql = format!(
        "SELECT a.id, a.occurred_at, a.actor_type, a.actor_id, \
                o.email AS actor_email, \
                a.action, a.resource_type, a.resource_id, \
                a.ip::text AS ip, a.user_agent, a.details \
         FROM   audit_log a \
         LEFT JOIN operators o ON o.id = a.actor_id AND a.actor_type = 'operator' \
         {where_clause} \
         ORDER  BY a.occurred_at DESC, a.id DESC \
         LIMIT  ${bind_idx}"
    );

    let mut q = sqlx::query_as::<_, Row>(&sql);

    // Bind in the same order we built conditions
    if let Some(cursor) = params.cursor {
        q = q.bind(cursor);
    }
    if let Some(ref rt) = params.resource_type {
        if !rt.is_empty() { q = q.bind(rt); }
    }
    if let Some(ref at) = params.actor_type {
        if !at.is_empty() { q = q.bind(at); }
    }
    if let Some(actor_id) = params.actor_id {
        q = q.bind(actor_id);
    }
    if let Some(ref act) = params.action {
        if !act.is_empty() {
            if act.ends_with('.') || act.ends_with('*') {
                let pattern = format!("{}%", act.trim_end_matches('*'));
                q = q.bind(pattern);
            } else {
                q = q.bind(act);
            }
        }
    }
    if let Some(ref s) = params.search {
        if !s.is_empty() {
            let pattern = format!("%{s}%");
            q = q.bind(pattern);
        }
    }
    if let Some(ref from) = params.from {
        if !from.is_empty() { q = q.bind(from); }
    }
    if let Some(ref until) = params.until {
        if !until.is_empty() { q = q.bind(until); }
    }
    q = q.bind(limit);

    let rows = q.fetch_all(pool).await.map_err(|e| ApiError::from(tundrad_repo::RepoError::from(e)))?;

    Ok(rows.into_iter().map(|r| AuditEntryDto {
        id: r.id.to_string(),
        occurred_at: r.occurred_at.to_string(),
        actor_type: r.actor_type,
        actor_id: r.actor_id.map(|u| u.to_string()),
        actor_email: r.actor_email,
        action: r.action,
        resource_type: r.resource_type,
        resource_id: r.resource_id.map(|u| u.to_string()),
        ip: r.ip,
        user_agent: r.user_agent,
        details: r.details,
    }).collect())
}
