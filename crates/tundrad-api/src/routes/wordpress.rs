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
use crate::serde_util::fmt_dt;
use tundrad_repo::PgPool;

// ── DB row types ──────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct InstallationRow {
    id: Uuid,
    site_id: Uuid,
    wp_version: Option<String>,
    wp_path: String,
    db_name: Option<String>,
    db_user: Option<String>,
    db_host: String,
    db_prefix: Option<String>,
    admin_email: Option<String>,
    admin_user: Option<String>,
    site_title: Option<String>,
    site_url: Option<String>,
    multisite: bool,
    state: String,
    error_message: Option<String>,
    created_at: time::OffsetDateTime,
    updated_at: time::OffsetDateTime,
    // joined fields
    php_version: Option<String>,
    ssl_active: bool,
    disk_usage_mb: Option<i64>,
    install_path: Option<String>,
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
    pub wp_version: Option<String>,    // "6.7.2" | "latest" (default)
    pub wp_path: Option<String>,       // subdir within document_root; "/" = root
    pub db_name: Option<String>,
    pub db_user: Option<String>,
    pub db_password: Option<String>,   // used by WP-CLI, never stored
    pub db_host: Option<String>,
    pub db_prefix: Option<String>,     // default "wp_"
    pub admin_user: Option<String>,    // default "admin"
    pub admin_email: Option<String>,
    pub admin_password: Option<String>, // used by WP-CLI, never stored
    pub site_title: Option<String>,
    pub language: Option<String>,      // default "en_US"
    pub multisite: Option<bool>,
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
        "db_user": r.db_user,
        "db_host": r.db_host,
        "db_prefix": r.db_prefix,
        "admin_email": r.admin_email,
        "admin_user": r.admin_user,
        "site_title": r.site_title,
        "site_url": r.site_url,
        "multisite": r.multisite,
        "state": r.state,
        "error_message": r.error_message,
        "created_at": fmt_dt(r.created_at),
        "updated_at": fmt_dt(r.updated_at),
        "php_version": r.php_version,
        "ssl_active": r.ssl_active,
        "disk_usage_mb": r.disk_usage_mb,
        "install_path": r.install_path,
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
        "SELECT i.id, i.site_id, i.wp_version, i.wp_path, i.db_name, i.db_user, i.db_host,
                i.db_prefix, i.admin_email, i.admin_user, i.site_title, i.site_url,
                i.multisite, i.state, i.error_message, i.created_at, i.updated_at,
                a.runtime_version AS php_version,
                COALESCE((
                    SELECT cert_pem != '' AND not_after > now()
                    FROM certificates
                    WHERE site_id = i.site_id AND cert_pem != ''
                    ORDER BY not_after DESC LIMIT 1
                ), false) AS ssl_active,
                i.disk_usage_mb,
                s.document_root || CASE WHEN i.wp_path = '/' THEN '' ELSE i.wp_path END AS install_path
         FROM plugin_wordpress_installations i
         LEFT JOIN applications a ON a.site_id = i.site_id
         LEFT JOIN sites s ON s.id = i.site_id
         ORDER BY i.created_at DESC",
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

    let wp_subpath = body.wp_path.clone().unwrap_or_else(|| "/".to_owned());
    let db_host = body.db_host.clone().unwrap_or_else(|| "localhost".to_owned());
    let db_prefix = body.db_prefix.clone().unwrap_or_else(|| "wp_".to_owned());
    let language = body.language.clone().unwrap_or_else(|| "en_US".to_owned());
    let admin_user = body.admin_user.clone().unwrap_or_else(|| "admin".to_owned());
    let wp_version = body.wp_version.clone().unwrap_or_else(|| "latest".to_owned());
    let multisite = body.multisite.unwrap_or(false);

    // Fetch site document_root + primary_domain for the provisioner
    let (document_root, primary_domain): (String, String) =
        sqlx::query_as("SELECT document_root, primary_domain FROM sites WHERE id = $1")
            .bind(body.site_id)
            .fetch_one(&pool)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "fetch site for provisioner");
                ApiError::internal()
            })?;

    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO plugin_wordpress_installations
             (site_id, wp_path, db_name, db_user, db_host, db_prefix,
              admin_email, admin_user, site_title, language, multisite, installed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id",
    )
    .bind(body.site_id)
    .bind(&wp_subpath)
    .bind(&body.db_name)
    .bind(&body.db_user)
    .bind(&db_host)
    .bind(&db_prefix)
    .bind(&body.admin_email)
    .bind(&admin_user)
    .bind(&body.site_title)
    .bind(&language)
    .bind(multisite)
    .bind(session.operator_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "insert wp installation");
        ApiError::internal()
    })?;

    // Spawn provisioner — runs WP-CLI in background, updates state when done
    tokio::spawn(crate::routes::wp_provisioner::provision(
        pool.clone(),
        crate::routes::wp_provisioner::ProvisionRequest {
            installation_id: id,
            document_root,
            primary_domain,
            wp_subpath,
            wp_version,
            db_name: body.db_name.clone().unwrap_or_else(|| "wordpress".to_owned()),
            db_user: body.db_user.clone().unwrap_or_else(|| "wordpress".to_owned()),
            db_password: body.db_password.clone().unwrap_or_default(),
            db_host,
            db_prefix,
            admin_user,
            admin_email: body.admin_email.clone().unwrap_or_else(|| "admin@example.com".to_owned()),
            admin_password: body.admin_password.clone().unwrap_or_else(|| "admin123".to_owned()),
            site_title: body.site_title.clone().unwrap_or_else(|| "WordPress Site".to_owned()),
            language,
        },
    ));

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "id": id,
            "site_id": body.site_id,
            "state": "provisioning",
            "wp_path": body.wp_path.as_deref().unwrap_or("/"),
        })),
    ))
}

pub async fn get_installation(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let row = sqlx::query_as::<_, InstallationRow>(
        "SELECT i.id, i.site_id, i.wp_version, i.wp_path, i.db_name, i.db_user, i.db_host,
                i.db_prefix, i.admin_email, i.admin_user, i.site_title, i.site_url,
                i.multisite, i.state, i.error_message, i.created_at, i.updated_at,
                a.runtime_version AS php_version,
                COALESCE((
                    SELECT cert_pem != '' AND not_after > now()
                    FROM certificates
                    WHERE site_id = i.site_id AND cert_pem != ''
                    ORDER BY not_after DESC LIMIT 1
                ), false) AS ssl_active,
                i.disk_usage_mb,
                s.document_root || CASE WHEN i.wp_path = '/' THEN '' ELSE i.wp_path END AS install_path
         FROM plugin_wordpress_installations i
         LEFT JOIN applications a ON a.site_id = i.site_id
         LEFT JOIN sites s ON s.id = i.site_id
         WHERE i.id = $1",
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

#[derive(Deserialize)]
pub struct PatchWpPluginRequest {
    pub active: Option<bool>,
}

pub async fn patch_wp_plugin(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path((id, slug)): Path<(Uuid, String)>,
    Json(body): Json<PatchWpPluginRequest>,
) -> Result<impl IntoResponse, ApiError> {
    if let Some(active) = body.active {
        let affected = sqlx::query(
            "UPDATE plugin_wordpress_plugins
             SET active = $1, last_synced_at = now()
             WHERE installation_id = $2 AND slug = $3",
        )
        .bind(active)
        .bind(id)
        .bind(&slug)
        .execute(&pool)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "patch wp plugin");
            ApiError::internal()
        })?;

        if affected.rows_affected() == 0 {
            return Err(ApiError::not_found("wordpress plugin"));
        }

        // Best-effort: run WP-CLI activate/deactivate in background
        let pool2 = pool.clone();
        let slug2 = slug.clone();
        tokio::spawn(async move {
            let env = match crate::routes::wp_actions::WpEnv::load(&pool2, id).await {
                Ok(e) => e,
                Err(_) => return,
            };
            let cmd = if active { "activate" } else { "deactivate" };
            if let Err(e) = env.run(&["plugin", cmd, &slug2]).await {
                tracing::warn!(installation_id = %id, slug = %slug2, error = %e, "wp plugin {} failed", cmd);
            }
        });
    }
    Ok(StatusCode::NO_CONTENT)
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

// ── State patch ───────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct PatchInstallationRequest {
    pub state: Option<String>,
    pub error_message: Option<String>,
}

pub async fn patch_installation(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<PatchInstallationRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let valid_states = ["provisioning", "active", "error", "removing"];
    if let Some(ref s) = body.state {
        if !valid_states.contains(&s.as_str()) {
            return Err(ApiError::bad_request("invalid state"));
        }
    }

    let affected = sqlx::query(
        "UPDATE plugin_wordpress_installations
         SET state         = COALESCE($1, state),
             error_message = COALESCE($2, error_message),
             updated_at    = now()
         WHERE id = $3",
    )
    .bind(&body.state)
    .bind(&body.error_message)
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "patch wp installation");
        ApiError::internal()
    })?;

    if affected.rows_affected() == 0 {
        return Err(ApiError::not_found("wordpress installation"));
    }
    Ok(StatusCode::NO_CONTENT)
}

// ── Reprovision ───────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ReprovisionRequest {
    pub wp_version: Option<String>,
    pub db_name: Option<String>,
    pub db_user: Option<String>,
    pub db_password: Option<String>,
    pub db_host: Option<String>,
    pub admin_user: Option<String>,
    pub admin_email: Option<String>,
    pub admin_password: Option<String>,
    pub site_title: Option<String>,
}

pub async fn reprovision_installation(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<ReprovisionRequest>,
) -> Result<impl IntoResponse, ApiError> {
    #[derive(sqlx::FromRow)]
    struct Row {
        wp_path: String,
        db_name: Option<String>,
        db_user: Option<String>,
        db_host: String,
        db_prefix: String,
        admin_email: Option<String>,
        admin_user: Option<String>,
        site_title: Option<String>,
        language: String,
        document_root: String,
        primary_domain: String,
    }

    let row = sqlx::query_as::<_, Row>(
        "SELECT i.wp_path, i.db_name, i.db_user, i.db_host,
                COALESCE(i.db_prefix, 'wp_') AS db_prefix,
                i.admin_email, i.admin_user, i.site_title,
                COALESCE(i.language, 'en_US') AS language,
                s.document_root, s.primary_domain
         FROM plugin_wordpress_installations i
         JOIN sites s ON s.id = i.site_id
         WHERE i.id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "fetch install for reprovision");
        ApiError::internal()
    })?
    .ok_or_else(|| ApiError::not_found("wordpress installation"))?;

    // Reset to provisioning
    sqlx::query(
        "UPDATE plugin_wordpress_installations
         SET state = 'provisioning', error_message = NULL, updated_at = now()
         WHERE id = $1",
    )
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "reset state for reprovision");
        ApiError::internal()
    })?;

    tokio::spawn(crate::routes::wp_provisioner::provision(
        pool.clone(),
        crate::routes::wp_provisioner::ProvisionRequest {
            installation_id: id,
            document_root: row.document_root,
            primary_domain: row.primary_domain,
            wp_subpath: row.wp_path,
            wp_version: body.wp_version.unwrap_or_else(|| "latest".to_owned()),
            db_name: body.db_name.or(row.db_name).unwrap_or_else(|| "wordpress".to_owned()),
            db_user: body.db_user.or(row.db_user).unwrap_or_else(|| "wordpress".to_owned()),
            db_password: body.db_password.unwrap_or_default(),
            db_host: body.db_host.unwrap_or(row.db_host),
            db_prefix: row.db_prefix,
            admin_user: body.admin_user.or(row.admin_user).unwrap_or_else(|| "admin".to_owned()),
            admin_email: body.admin_email.or(row.admin_email).unwrap_or_else(|| "admin@example.com".to_owned()),
            admin_password: body.admin_password.unwrap_or_default(),
            site_title: body.site_title.or(row.site_title).unwrap_or_else(|| "WordPress Site".to_owned()),
            language: row.language,
        },
    ));

    Ok((
        StatusCode::ACCEPTED,
        Json(serde_json::json!({ "state": "provisioning" })),
    ))
}
