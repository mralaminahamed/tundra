use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use uuid::Uuid;

use crate::error::ApiError;
use crate::extractors::AuthSession;
use tundrad_repo::PgPool;

// ── WP-CLI helper ─────────────────────────────────────────────────────────────

pub struct WpEnv {
    pub install_path: String,
    pub wp_bin: String,
}

impl WpEnv {
    pub async fn load(pool: &PgPool, id: Uuid) -> Result<Self, ApiError> {
        let row: Option<(String, String)> = sqlx::query_as(
            "SELECT s.document_root, i.wp_path
             FROM plugin_wordpress_installations i
             JOIN sites s ON s.id = i.site_id
             WHERE i.id = $1",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| {
            tracing::error!(%e, "resolve wp install path");
            ApiError::internal()
        })?;

        let (doc_root, wp_path) = row.ok_or_else(|| ApiError::not_found("wordpress installation"))?;

        let root = doc_root.trim_end_matches('/');
        let sub  = wp_path.trim_matches('/');
        let install_path = if sub.is_empty() {
            root.to_owned()
        } else {
            format!("{}/{}", root, sub)
        };

        let wp_bin = if std::path::Path::new("/usr/local/bin/wp").exists() {
            "/usr/local/bin/wp".to_owned()
        } else {
            "wp".to_owned()
        };

        Ok(Self { install_path, wp_bin })
    }

    pub async fn run(&self, base_args: &[&str]) -> Result<String, String> {
        let mut args: Vec<&str> = base_args.to_vec();
        args.push("--path");
        args.push(&self.install_path);
        args.push("--allow-root");

        let out = Command::new(&self.wp_bin)
            .args(&args)
            .output()
            .await
            .map_err(|e| e.to_string())?;

        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr);
            let stdout = String::from_utf8_lossy(&out.stdout);
            let msg = format!("{} {}", stdout.trim(), stderr.trim()).trim().to_owned();
            return Err(msg);
        }
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_owned())
    }

    pub async fn run_json(&self, base_args: &[&str]) -> Result<serde_json::Value, String> {
        let mut args: Vec<&str> = base_args.to_vec();
        args.push("--format=json");
        args.push("--path");
        args.push(&self.install_path);
        args.push("--allow-root");

        let out = Command::new(&self.wp_bin)
            .args(&args)
            .output()
            .await
            .map_err(|e| e.to_string())?;

        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr);
            return Err(stderr.trim().to_owned());
        }
        let stdout = String::from_utf8_lossy(&out.stdout);
        serde_json::from_str(stdout.trim()).map_err(|_| stdout.trim().to_owned())
    }
}

fn wp_cli_error(msg: String) -> ApiError {
    ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, "wp_cli.error", msg)
}

// ── Plugin actions ─────────────────────────────────────────────────────────────

pub async fn update_wp_plugin(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path((id, slug)): Path<(Uuid, String)>,
) -> Result<impl IntoResponse, ApiError> {
    let env = WpEnv::load(&pool, id).await?;
    env.run(&["plugin", "update", &slug])
        .await
        .map_err(wp_cli_error)?;
    Ok(Json(serde_json::json!({ "updated": true, "slug": slug })))
}

pub async fn update_all_wp_plugins(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let env = WpEnv::load(&pool, id).await?;
    let out = env.run(&["plugin", "update", "--all"])
        .await
        .map_err(wp_cli_error)?;
    Ok(Json(serde_json::json!({ "updated": true, "message": out })))
}

// ── Theme actions ──────────────────────────────────────────────────────────────

pub async fn update_wp_theme(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path((id, slug)): Path<(Uuid, String)>,
) -> Result<impl IntoResponse, ApiError> {
    let env = WpEnv::load(&pool, id).await?;
    env.run(&["theme", "update", &slug])
        .await
        .map_err(wp_cli_error)?;
    Ok(Json(serde_json::json!({ "updated": true, "slug": slug })))
}

// ── User actions ───────────────────────────────────────────────────────────────

pub async fn list_wp_users(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let env = WpEnv::load(&pool, id).await?;
    let result = env
        .run_json(&["user", "list", "--fields=ID,user_login,user_email,display_name,user_registered,roles"])
        .await
        .map_err(wp_cli_error)?;
    Ok(Json(serde_json::json!({ "data": result })))
}

#[derive(Deserialize)]
pub struct CreateWpUserRequest {
    pub login: String,
    pub email: String,
    pub role: String,
    pub password: String,
}

pub async fn create_wp_user_handler(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateWpUserRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let env = WpEnv::load(&pool, id).await?;
    let role_arg  = format!("--role={}", body.role);
    let pass_arg  = format!("--user_pass={}", body.password);
    let out = env
        .run(&["user", "create", &body.login, &body.email, &role_arg, &pass_arg, "--porcelain"])
        .await
        .map_err(wp_cli_error)?;
    let user_id: u64 = out.trim().parse().unwrap_or(0);
    Ok((StatusCode::CREATED, Json(serde_json::json!({ "id": user_id }))))
}

pub async fn delete_wp_user_handler(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path((id, user_id)): Path<(Uuid, String)>,
) -> Result<impl IntoResponse, ApiError> {
    let env = WpEnv::load(&pool, id).await?;
    env.run(&["user", "delete", &user_id, "--yes"])
        .await
        .map_err(wp_cli_error)?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub struct SetPasswordRequest {
    pub password: String,
}

pub async fn set_wp_user_password(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path((id, user_id)): Path<(Uuid, String)>,
    Json(body): Json<SetPasswordRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let env = WpEnv::load(&pool, id).await?;
    let pass_arg = format!("--user_pass={}", body.password);
    env.run(&["user", "update", &user_id, &pass_arg])
        .await
        .map_err(wp_cli_error)?;
    Ok(StatusCode::NO_CONTENT)
}

// ── Database actions ───────────────────────────────────────────────────────────

pub async fn optimize_wp_db(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let env = WpEnv::load(&pool, id).await?;
    let msg = env.run(&["db", "optimize"]).await.map_err(wp_cli_error)?;
    Ok(Json(serde_json::json!({ "message": msg })))
}

pub async fn repair_wp_db(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let env = WpEnv::load(&pool, id).await?;
    let msg = env.run(&["db", "repair"]).await.map_err(wp_cli_error)?;
    Ok(Json(serde_json::json!({ "message": msg })))
}

#[derive(Deserialize)]
pub struct SearchReplaceRequest {
    pub from: String,
    pub to: String,
    pub dry_run: Option<bool>,
}

pub async fn search_replace_wp_db(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<SearchReplaceRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let env = WpEnv::load(&pool, id).await?;
    let mut args = vec![
        "search-replace",
        &body.from,
        &body.to,
        "--precise",
        "--recurse-objects",
        "--skip-columns=guid",
    ];
    if body.dry_run.unwrap_or(false) {
        args.push("--dry-run");
    }
    let msg = env.run(&args).await.map_err(wp_cli_error)?;
    Ok(Json(serde_json::json!({ "message": msg })))
}

// ── Settings ───────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct WpSettingsRequest {
    pub maintenance_mode:  Option<bool>,
    pub debug_mode:        Option<bool>,
    pub search_indexing:   Option<bool>,
    pub wp_cron:           Option<bool>,   // true = WP cron enabled
    pub core_auto_update:  Option<String>, // "disabled" | "minor" | "all"
    pub plugin_auto_update: Option<bool>,
    pub theme_auto_update:  Option<bool>,
    pub force_https:        Option<bool>,
}

pub async fn patch_wp_settings(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<WpSettingsRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let env = WpEnv::load(&pool, id).await?;
    let mut applied: Vec<String> = Vec::new();
    let mut errors:  Vec<String> = Vec::new();

    macro_rules! apply {
        ($label:expr, $args:expr) => {
            match env.run($args).await {
                Ok(_)  => applied.push($label.to_owned()),
                Err(e) => errors.push(format!("{}: {}", $label, e)),
            }
        };
    }

    if let Some(v) = body.maintenance_mode {
        let state = if v { "enable" } else { "disable" };
        apply!("maintenance_mode", &["maintenance-mode", state]);
    }
    if let Some(v) = body.debug_mode {
        let val = if v { "true" } else { "false" };
        apply!("debug_mode", &["config", "set", "WP_DEBUG", val, "--raw"]);
    }
    if let Some(v) = body.search_indexing {
        let val = if v { "1" } else { "0" };
        apply!("search_indexing", &["option", "update", "blog_public", val]);
    }
    if let Some(v) = body.wp_cron {
        // wp_cron=true means WP cron enabled, so DISABLE_WP_CRON=false
        let val = if v { "false" } else { "true" };
        apply!("wp_cron", &["config", "set", "DISABLE_WP_CRON", val, "--raw"]);
    }
    if let Some(ref v) = body.core_auto_update {
        let (val, raw) = match v.as_str() {
            "disabled" => ("false", true),
            "minor"    => ("minor", false),
            _          => ("true",  true),
        };
        if raw {
            apply!("core_auto_update", &["config", "set", "WP_AUTO_UPDATE_CORE", val, "--raw"]);
        } else {
            apply!("core_auto_update", &["config", "set", "WP_AUTO_UPDATE_CORE", val]);
        }
    }
    if let Some(v) = body.plugin_auto_update {
        let state = if v { "enable" } else { "disable" };
        apply!("plugin_auto_update", &["plugin", "auto-updates", state, "--all"]);
    }
    if let Some(v) = body.theme_auto_update {
        let state = if v { "enable" } else { "disable" };
        apply!("theme_auto_update", &["theme", "auto-updates", state, "--all"]);
    }
    if let Some(true) = body.force_https {
        // Read current siteurl, switch to https
        if let Ok(url) = env.run(&["option", "get", "siteurl"]).await {
            let https_url = if url.starts_with("http://") {
                url.replacen("http://", "https://", 1)
            } else {
                url.clone()
            };
            apply!("force_https_siteurl", &["option", "update", "siteurl", &https_url]);
            let home = url.replacen("http://", "https://", 1);
            apply!("force_https_home", &["option", "update", "home", &home]);
        }
    }

    Ok(Json(serde_json::json!({ "applied": applied, "errors": errors })))
}

// ── Security scans ─────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct ScanResult {
    pub scan_type: String,
    pub ok: bool,
    pub result: serde_json::Value,
}

pub async fn wp_security_scan(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path((id, scan_type)): Path<(Uuid, String)>,
) -> Result<impl IntoResponse, ApiError> {
    let env = WpEnv::load(&pool, id).await?;

    let (ok, result) = match scan_type.as_str() {
        "integrity" => {
            match env.run(&["core", "verify-checksums"]).await {
                Ok(msg)  => (true,  serde_json::json!({ "message": msg })),
                Err(msg) => (false, serde_json::json!({ "message": msg })),
            }
        }
        "users" => {
            match env.run_json(&["user", "list", "--role=administrator",
                "--fields=ID,user_login,user_email"]).await {
                Ok(data) => (true,  data),
                Err(msg) => (false, serde_json::json!({ "message": msg })),
            }
        }
        _ => return Err(ApiError::bad_request("unknown scan type")),
    };

    Ok(Json(serde_json::json!({
        "scan_type": scan_type,
        "ok": ok,
        "result": result,
    })))
}

// ── Core operations ────────────────────────────────────────────────────────────

pub async fn reset_wp_core(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    // Mark as provisioning
    sqlx::query(
        "UPDATE plugin_wordpress_installations
         SET state = 'provisioning', error_message = NULL, updated_at = now()
         WHERE id = $1",
    )
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|e| {
        tracing::error!(%e, "reset core: update state");
        ApiError::internal()
    })?;

    let pool2 = pool.clone();
    tokio::spawn(async move {
        let env = match WpEnv::load(&pool2, id).await {
            Ok(e)  => e,
            Err(_) => return,
        };
        match env.run(&["core", "download", "--force", "--skip-content"]).await {
            Ok(_) => {
                let _ = sqlx::query(
                    "UPDATE plugin_wordpress_installations
                     SET state = 'active', updated_at = now()
                     WHERE id = $1",
                )
                .bind(id)
                .execute(&pool2)
                .await;
                tracing::info!(installation_id = %id, "wp core reset complete");
            }
            Err(e) => {
                let _ = sqlx::query(
                    "UPDATE plugin_wordpress_installations
                     SET state = 'error', error_message = $1, updated_at = now()
                     WHERE id = $2",
                )
                .bind(&e)
                .bind(id)
                .execute(&pool2)
                .await;
                tracing::error!(installation_id = %id, error = %e, "wp core reset failed");
            }
        }
    });

    Ok((StatusCode::ACCEPTED, Json(serde_json::json!({ "state": "provisioning" }))))
}

pub async fn verify_wp_core(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let env = WpEnv::load(&pool, id).await?;
    match env.run(&["core", "verify-checksums"]).await {
        Ok(msg)  => Ok(Json(serde_json::json!({ "ok": true,  "message": msg }))),
        Err(msg) => Ok(Json(serde_json::json!({ "ok": false, "message": msg }))),
    }
}
