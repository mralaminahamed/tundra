use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractors::AuthSession;
use tundrad_repo::PgPool;

// ── DB row types ──────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct InstallationRow {
    id: Uuid,
    site_id: Uuid,
    wp_version: Option<String>,
    wp_path: String,
    db_name: Option<String>,
    db_host: String,
    admin_email: Option<String>,
    site_title: Option<String>,
    site_url: Option<String>,
    multisite: bool,
    state: String,
    error_message: Option<String>,
    created_at: time::OffsetDateTime,
    updated_at: time::OffsetDateTime,
}

#[derive(sqlx::FromRow)]
struct WpPluginRow {
    id: i64,
    installation_id: Uuid,
    slug: String,
    name: String,
    version: Option<String>,
    author: Option<String>,
    description: Option<String>,
    active: bool,
    update_available: bool,
    new_version: Option<String>,
}

#[derive(sqlx::FromRow)]
struct WpThemeRow {
    id: i64,
    installation_id: Uuid,
    slug: String,
    name: String,
    version: Option<String>,
    author: Option<String>,
    description: Option<String>,
    active: bool,
    update_available: bool,
    new_version: Option<String>,
    screenshot_url: Option<String>,
}

// ── Request bodies ────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct InstallWordPressRequest {
    pub site_id: Uuid,
    pub wp_path: Option<String>,
    pub db_name: Option<String>,
    pub db_user: Option<String>,
    pub db_host: Option<String>,
    pub admin_email: Option<String>,
    pub site_title: Option<String>,
}

#[derive(Deserialize)]
pub struct InstallWpPluginRequest {
    pub slug: String,
    pub version: Option<String>,
    pub activate: Option<bool>,
}

#[derive(Deserialize)]
pub struct InstallWpThemeRequest {
    pub slug: String,
    pub version: Option<String>,
    pub activate: Option<bool>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn installation_json(r: &InstallationRow) -> serde_json::Value {
    serde_json::json!({
        "id": r.id,
        "site_id": r.site_id,
        "wp_version": r.wp_version,
        "wp_path": r.wp_path,
        "db_name": r.db_name,
        "db_host": r.db_host,
        "admin_email": r.admin_email,
        "site_title": r.site_title,
        "site_url": r.site_url,
        "multisite": r.multisite,
        "state": r.state,
        "error_message": r.error_message,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
    })
}

fn wp_plugin_json(r: &WpPluginRow) -> serde_json::Value {
    serde_json::json!({
        "id": r.id,
        "installation_id": r.installation_id,
        "slug": r.slug,
        "name": r.name,
        "version": r.version,
        "author": r.author,
        "description": r.description,
        "active": r.active,
        "update_available": r.update_available,
        "new_version": r.new_version,
    })
}

fn wp_theme_json(r: &WpThemeRow) -> serde_json::Value {
    serde_json::json!({
        "id": r.id,
        "installation_id": r.installation_id,
        "slug": r.slug,
        "name": r.name,
        "version": r.version,
        "author": r.author,
        "description": r.description,
        "active": r.active,
        "update_available": r.update_available,
        "new_version": r.new_version,
        "screenshot_url": r.screenshot_url,
    })
}

// ── Installations ─────────────────────────────────────────────────────────────

pub async fn list_installations(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
) -> Result<impl IntoResponse, ApiError> {
    let rows = sqlx::query_as::<_, InstallationRow>(
        "SELECT id, site_id, wp_version, wp_path, db_name, db_host,
                admin_email, site_title, site_url, multisite, state,
                error_message, created_at, updated_at
         FROM plugin_wordpress_installations
         ORDER BY created_at DESC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "list wp installations");
        ApiError::internal()
    })?;

    let data: Vec<_> = rows.iter().map(installation_json).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn install_wordpress(
    AuthSession(session): AuthSession,
    State(pool): State<PgPool>,
    Json(body): Json<InstallWordPressRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let site_exists: Option<Uuid> =
        sqlx::query_scalar("SELECT id FROM sites WHERE id = $1 AND deleted_at IS NULL")
            .bind(body.site_id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "check site");
                ApiError::internal()
            })?;

    if site_exists.is_none() {
        return Err(ApiError::not_found("site"));
    }

    let existing: Option<Uuid> =
        sqlx::query_scalar("SELECT id FROM plugin_wordpress_installations WHERE site_id = $1")
            .bind(body.site_id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "check existing wp");
                ApiError::internal()
            })?;

    if existing.is_some() {
        return Err(ApiError::bad_request(
            "WordPress already installed on this site",
        ));
    }

    let wp_path = body.wp_path.unwrap_or_else(|| "/var/www/html".to_owned());
    let db_host = body.db_host.unwrap_or_else(|| "localhost".to_owned());

    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO plugin_wordpress_installations
             (site_id, wp_path, db_name, db_host, admin_email, site_title, installed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id",
    )
    .bind(body.site_id)
    .bind(&wp_path)
    .bind(&body.db_name)
    .bind(&db_host)
    .bind(&body.admin_email)
    .bind(&body.site_title)
    .bind(session.operator_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "insert wp installation");
        ApiError::internal()
    })?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "id": id,
            "site_id": body.site_id,
            "state": "provisioning",
            "wp_path": wp_path,
        })),
    ))
}

pub async fn get_installation(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let row = sqlx::query_as::<_, InstallationRow>(
        "SELECT id, site_id, wp_version, wp_path, db_name, db_host,
                admin_email, site_title, site_url, multisite, state,
                error_message, created_at, updated_at
         FROM plugin_wordpress_installations WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "get wp installation");
        ApiError::internal()
    })?;

    match row {
        Some(r) => Ok(Json(installation_json(&r)).into_response()),
        None => Err(ApiError::not_found("wordpress installation")),
    }
}

pub async fn remove_installation(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let affected = sqlx::query(
        "UPDATE plugin_wordpress_installations
         SET state = 'removing', updated_at = now()
         WHERE id = $1 AND state != 'removing'",
    )
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "remove wp installation");
        ApiError::internal()
    })?;

    if affected.rows_affected() == 0 {
        return Err(ApiError::not_found("wordpress installation"));
    }
    Ok(StatusCode::NO_CONTENT)
}

// ── WP Plugins ────────────────────────────────────────────────────────────────

pub async fn list_wp_plugins(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let rows = sqlx::query_as::<_, WpPluginRow>(
        "SELECT id, installation_id, slug, name, version, author, description,
                active, update_available, new_version
         FROM plugin_wordpress_plugins
         WHERE installation_id = $1
         ORDER BY name ASC",
    )
    .bind(id)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "list wp plugins");
        ApiError::internal()
    })?;

    let data: Vec<_> = rows.iter().map(wp_plugin_json).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn install_wp_plugin(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<InstallWpPluginRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let row_id: i64 = sqlx::query_scalar(
        "INSERT INTO plugin_wordpress_plugins
             (installation_id, slug, name, version, active)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (installation_id, slug) DO UPDATE
             SET version = EXCLUDED.version,
                 active  = EXCLUDED.active,
                 last_synced_at = now()
         RETURNING id",
    )
    .bind(id)
    .bind(&body.slug)
    .bind(&body.slug)
    .bind(&body.version)
    .bind(body.activate.unwrap_or(false))
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "install wp plugin");
        ApiError::internal()
    })?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "id": row_id,
            "installation_id": id,
            "slug": body.slug,
            "state": "installing",
        })),
    ))
}

pub async fn remove_wp_plugin(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path((id, slug)): Path<(Uuid, String)>,
) -> Result<impl IntoResponse, ApiError> {
    let affected = sqlx::query(
        "DELETE FROM plugin_wordpress_plugins WHERE installation_id = $1 AND slug = $2",
    )
    .bind(id)
    .bind(&slug)
    .execute(&pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "remove wp plugin");
        ApiError::internal()
    })?;

    if affected.rows_affected() == 0 {
        return Err(ApiError::not_found("wordpress plugin"));
    }
    Ok(StatusCode::NO_CONTENT)
}

// ── WP Themes ─────────────────────────────────────────────────────────────────

pub async fn list_wp_themes(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let rows = sqlx::query_as::<_, WpThemeRow>(
        "SELECT id, installation_id, slug, name, version, author, description,
                active, update_available, new_version, screenshot_url
         FROM plugin_wordpress_themes
         WHERE installation_id = $1
         ORDER BY active DESC, name ASC",
    )
    .bind(id)
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "list wp themes");
        ApiError::internal()
    })?;

    let data: Vec<_> = rows.iter().map(wp_theme_json).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn install_wp_theme(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<InstallWpThemeRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let activate = body.activate.unwrap_or(false);

    if activate {
        sqlx::query("UPDATE plugin_wordpress_themes SET active = false WHERE installation_id = $1")
            .bind(id)
            .execute(&pool)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "deactivate wp themes");
                ApiError::internal()
            })?;
    }

    let row_id: i64 = sqlx::query_scalar(
        "INSERT INTO plugin_wordpress_themes
             (installation_id, slug, name, version, active)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (installation_id, slug) DO UPDATE
             SET version = EXCLUDED.version,
                 active  = EXCLUDED.active,
                 last_synced_at = now()
         RETURNING id",
    )
    .bind(id)
    .bind(&body.slug)
    .bind(&body.slug)
    .bind(&body.version)
    .bind(activate)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "install wp theme");
        ApiError::internal()
    })?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "id": row_id,
            "installation_id": id,
            "slug": body.slug,
            "active": activate,
        })),
    ))
}

pub async fn remove_wp_theme(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path((id, slug)): Path<(Uuid, String)>,
) -> Result<impl IntoResponse, ApiError> {
    let affected =
        sqlx::query("DELETE FROM plugin_wordpress_themes WHERE installation_id = $1 AND slug = $2")
            .bind(id)
            .bind(&slug)
            .execute(&pool)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "remove wp theme");
                ApiError::internal()
            })?;

    if affected.rows_affected() == 0 {
        return Err(ApiError::not_found("wordpress theme"));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn activate_wp_theme(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path((id, slug)): Path<(Uuid, String)>,
) -> Result<impl IntoResponse, ApiError> {
    sqlx::query("UPDATE plugin_wordpress_themes SET active = false WHERE installation_id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "deactivate wp themes");
            ApiError::internal()
        })?;

    let affected = sqlx::query(
        "UPDATE plugin_wordpress_themes SET active = true, last_synced_at = now()
         WHERE installation_id = $1 AND slug = $2",
    )
    .bind(id)
    .bind(&slug)
    .execute(&pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "activate wp theme");
        ApiError::internal()
    })?;

    if affected.rows_affected() == 0 {
        return Err(ApiError::not_found("wordpress theme"));
    }
    Ok(StatusCode::NO_CONTENT)
}
