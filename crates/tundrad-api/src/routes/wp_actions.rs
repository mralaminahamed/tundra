use axum::{
    Json,
    body::Body,
    extract::{Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
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
        let mut args = base_args.to_vec();
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
        let mut args = base_args.to_vec();
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

// ── Settings tools ─────────────────────────────────────────────────────────────

pub async fn flush_rewrites(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let env = WpEnv::load(&pool, id).await?;
    let msg = env.run(&["rewrite", "flush"]).await.map_err(wp_cli_error)?;
    Ok(Json(serde_json::json!({ "ok": true, "message": msg })))
}

pub async fn regenerate_salts(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let env = WpEnv::load(&pool, id).await?;
    let msg = env.run(&["config", "shuffle-salts"]).await.map_err(wp_cli_error)?;
    Ok(Json(serde_json::json!({ "ok": true, "message": msg })))
}

pub async fn clear_cache(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let env = WpEnv::load(&pool, id).await?;
    let msg = env.run(&["cache", "flush"]).await.map_err(wp_cli_error)?;
    Ok(Json(serde_json::json!({ "ok": true, "message": msg })))
}

pub async fn export_wp_config(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let env = WpEnv::load(&pool, id).await?;
    let config_path = format!("{}/wp-config.php", env.install_path);

    let raw = tokio::fs::read_to_string(&config_path).await.map_err(|_| {
        ApiError::new(StatusCode::NOT_FOUND, "wp_config.not_found", "wp-config.php not found")
    })?;

    // Sanitize: blank out DB_PASSWORD and any secret keys before returning
    let sanitized = raw
        .lines()
        .map(|line| {
            if line.contains("DB_PASSWORD") || line.contains("AUTH_KEY")
                || line.contains("SECURE_AUTH_KEY") || line.contains("LOGGED_IN_KEY")
                || line.contains("NONCE_KEY") || line.contains("AUTH_SALT")
                || line.contains("SECURE_AUTH_SALT") || line.contains("LOGGED_IN_SALT")
                || line.contains("NONCE_SALT")
            {
                "// [redacted]".to_owned()
            } else {
                line.to_owned()
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .header(
            header::CONTENT_DISPOSITION,
            "attachment; filename=\"wp-config.php\"",
        )
        .body(Body::from(sanitized))
        .map_err(|_| ApiError::internal())?;

    Ok(response)
}

// ── Database export ────────────────────────────────────────────────────────────

pub async fn export_wp_db(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let env = WpEnv::load(&pool, id).await?;

    // wp db export - streams SQL to stdout
    let out = Command::new(&env.wp_bin)
        .args(["db", "export", "-", "--path", &env.install_path, "--allow-root"])
        .output()
        .await
        .map_err(|e| wp_cli_error(e.to_string()))?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(wp_cli_error(err.trim().to_owned()));
    }

    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/sql")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"wp-db-{}.sql\"", id),
        )
        .body(Body::from(out.stdout))
        .map_err(|_| ApiError::internal())?;

    Ok(response)
}

// ── Database browser ──────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct DbInfo {
    pub version: String,
    pub version_comment: String,
    pub charset: String,
    pub collation: String,
}

#[derive(Serialize)]
pub struct TableMeta {
    pub name: String,
    pub rows: Option<u64>,
    pub size_bytes: Option<u64>,
    pub engine: Option<String>,
    pub collation: Option<String>,
}

#[derive(Serialize)]
pub struct ColumnInfo {
    pub name: String,
    pub col_type: String,
    pub nullable: bool,
    pub default: Option<String>,
    pub key: String,
    pub extra: String,
    pub comment: String,
}

#[derive(Serialize)]
pub struct IndexInfo {
    pub name: String,
    pub non_unique: bool,
    pub column_name: String,
    pub index_type: String,
}

struct DbCreds {
    host: String,
    user: String,
    name: String,
    password: String,
}

impl DbCreds {
    async fn load(pool: &PgPool, installation_id: Uuid) -> Result<Self, ApiError> {
        let row: Option<(String, String, String)> = sqlx::query_as(
            "SELECT db_host, db_user, db_name FROM plugin_wordpress_installations WHERE id = $1",
        )
        .bind(installation_id)
        .fetch_optional(pool)
        .await
        .map_err(|_| ApiError::internal())?;

        let (host, user, name) = row.ok_or_else(|| ApiError::not_found("wordpress installation"))?;

        // Allow docker/dev override: TUNDRA_WP_MYSQL_HOST replaces 'localhost'
        let host = if host == "localhost" || host == "127.0.0.1" {
            std::env::var("TUNDRA_WP_MYSQL_HOST").unwrap_or(host)
        } else {
            host
        };

        let password = std::env::var("TUNDRA_WP_MYSQL_PASSWORD").unwrap_or_default();

        Ok(Self { host, user, name, password })
    }

    fn mysql_cmd(&self, args: &[&str]) -> Command {
        let mut cmd = Command::new("mysql");
        cmd.env("MYSQL_PWD", &self.password)
            .arg("-h").arg(&self.host)
            .arg("-u").arg(&self.user)
            .arg(&self.name)
            .arg("--batch")
            .arg("--column-names")
            .arg("--skip-ssl")
            .args(args);
        cmd
    }
}

fn parse_mysql_tsv(raw: &str) -> (Vec<String>, Vec<Vec<String>>) {
    let mut lines = raw.lines();
    let headers: Vec<String> = lines.next().unwrap_or("").split('\t').map(|s| s.to_owned()).collect();
    let rows: Vec<Vec<String>> = lines.map(|l| l.split('\t').map(|s| s.to_owned()).collect()).collect();
    (headers, rows)
}

pub async fn get_wp_db_info(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let creds = DbCreds::load(&pool, id).await?;
    let q = "SELECT VERSION(), @@version_comment, @@character_set_database, @@collation_database;";
    let out = creds.mysql_cmd(&["-e", q]).output().await.map_err(|e| wp_cli_error(e.to_string()))?;
    if !out.status.success() {
        return Err(wp_cli_error(String::from_utf8_lossy(&out.stderr).trim().to_owned()));
    }
    let (_, rows) = parse_mysql_tsv(&String::from_utf8_lossy(&out.stdout));
    let row = rows.into_iter().next().unwrap_or_default();
    Ok(Json(DbInfo {
        version:         row.first().cloned().unwrap_or_default(),
        version_comment: row.get(1).cloned().unwrap_or_default(),
        charset:         row.get(2).cloned().unwrap_or_default(),
        collation:       row.get(3).cloned().unwrap_or_default(),
    }))
}

pub async fn get_wp_db_structure(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let creds = DbCreds::load(&pool, id).await?;
    let q = "SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH + INDEX_LENGTH, ENGINE, TABLE_COLLATION \
             FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME;";
    let out = creds.mysql_cmd(&["-e", q]).output().await.map_err(|e| wp_cli_error(e.to_string()))?;
    if !out.status.success() {
        return Err(wp_cli_error(String::from_utf8_lossy(&out.stderr).trim().to_owned()));
    }
    let (_, rows) = parse_mysql_tsv(&String::from_utf8_lossy(&out.stdout));
    let data: Vec<TableMeta> = rows.into_iter().map(|r| TableMeta {
        name:       r.first().cloned().unwrap_or_default(),
        rows:       r.get(1).and_then(|v| if v == "NULL" { None } else { v.parse().ok() }),
        size_bytes: r.get(2).and_then(|v| if v == "NULL" { None } else { v.parse().ok() }),
        engine:     r.get(3).filter(|v| *v != "NULL").cloned(),
        collation:  r.get(4).filter(|v| *v != "NULL").cloned(),
    }).collect();
    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn get_wp_table_columns(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path((id, table)): Path<(Uuid, String)>,
) -> Result<impl IntoResponse, ApiError> {
    if !table.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err(ApiError::bad_request("invalid table name"));
    }
    let creds = DbCreds::load(&pool, id).await?;

    // Columns
    let col_q = format!(
        "SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA, COLUMN_COMMENT \
         FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{}' \
         ORDER BY ORDINAL_POSITION;",
        table
    );
    let col_out = creds.mysql_cmd(&["-e", &col_q]).output().await.map_err(|e| wp_cli_error(e.to_string()))?;
    if !col_out.status.success() {
        return Err(wp_cli_error(String::from_utf8_lossy(&col_out.stderr).trim().to_owned()));
    }
    let (_, col_rows) = parse_mysql_tsv(&String::from_utf8_lossy(&col_out.stdout));
    let columns: Vec<ColumnInfo> = col_rows.into_iter().map(|r| ColumnInfo {
        name:     r.first().cloned().unwrap_or_default(),
        col_type: r.get(1).cloned().unwrap_or_default(),
        nullable: r.get(2).map(|v| v == "YES").unwrap_or(false),
        default:  r.get(3).filter(|v| *v != "NULL").cloned(),
        key:      r.get(4).cloned().unwrap_or_default(),
        extra:    r.get(5).cloned().unwrap_or_default(),
        comment:  r.get(6).cloned().unwrap_or_default(),
    }).collect();

    // Indexes
    let idx_q = format!("SHOW INDEX FROM `{}`;", table);
    let idx_out = creds.mysql_cmd(&["-e", &idx_q]).output().await.map_err(|e| wp_cli_error(e.to_string()))?;
    let indexes: Vec<IndexInfo> = if idx_out.status.success() {
        let (headers, rows) = parse_mysql_tsv(&String::from_utf8_lossy(&idx_out.stdout));
        let non_unique_idx = headers.iter().position(|h| h == "Non_unique").unwrap_or(1);
        let key_name_idx   = headers.iter().position(|h| h == "Key_name").unwrap_or(2);
        let col_name_idx   = headers.iter().position(|h| h == "Column_name").unwrap_or(4);
        let idx_type_idx   = headers.iter().position(|h| h == "Index_type").unwrap_or(10);
        rows.into_iter().map(|r| IndexInfo {
            non_unique:   r.get(non_unique_idx).map(|v| v == "1").unwrap_or(true),
            name:         r.get(key_name_idx).cloned().unwrap_or_default(),
            column_name:  r.get(col_name_idx).cloned().unwrap_or_default(),
            index_type:   r.get(idx_type_idx).cloned().unwrap_or_default(),
        }).collect()
    } else { vec![] };

    Ok(Json(serde_json::json!({ "columns": columns, "indexes": indexes })))
}

pub async fn list_wp_db_tables(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let creds = DbCreds::load(&pool, id).await?;

    let out = creds.mysql_cmd(&["-e", "SHOW TABLES;"])
        .output()
        .await
        .map_err(|e| wp_cli_error(e.to_string()))?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(wp_cli_error(err.trim().to_owned()));
    }

    // Output: first line = "Tables_in_{dbname}", rest = table names
    let tables: Vec<String> = String::from_utf8_lossy(&out.stdout)
        .lines()
        .skip(1) // skip header row
        .map(|l| l.trim().to_owned())
        .filter(|l| !l.is_empty())
        .collect();

    Ok(Json(serde_json::json!({ "data": tables })))
}

#[derive(Deserialize)]
pub struct DbQueryRequest {
    pub sql: String,
    pub write_mode: Option<bool>,
}

pub async fn run_wp_db_query(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<DbQueryRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let write_mode = body.write_mode.unwrap_or(false);
    if write_mode {
        // Block operations that could cause broad irreversible damage
        let lower = body.sql.trim().to_lowercase();
        let first_two: String = body.sql.trim().split_whitespace().take(2)
            .collect::<Vec<_>>().join(" ").to_uppercase();
        let blocked_pairs = ["DROP DATABASE", "DROP SCHEMA", "DROP USER"];
        if blocked_pairs.iter().any(|b| first_two.starts_with(b)) {
            return Err(ApiError::bad_request("This operation is not permitted"));
        }
        let system_schemas = ["information_schema.", "performance_schema.", "' mysql'", "` mysql`", " mysql ", " sys "];
        if system_schemas.iter().any(|s| lower.contains(s)) {
            return Err(ApiError::bad_request("System schema writes are not allowed"));
        }
    } else {
        let first_word = body.sql.trim().split_whitespace().next().unwrap_or("").to_uppercase();
        let allowed = ["SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN"];
        if !allowed.contains(&first_word.as_str()) {
            return Err(ApiError::bad_request("Only SELECT/SHOW/DESCRIBE/EXPLAIN queries are allowed"));
        }
    }

    let creds = DbCreds::load(&pool, id).await?;

    let out = creds.mysql_cmd(&["-e", &body.sql])
        .output()
        .await
        .map_err(|e| wp_cli_error(e.to_string()))?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(wp_cli_error(err.trim().to_owned()));
    }

    // mysql --batch --column-names outputs tab-separated; first row = column names
    let raw = String::from_utf8_lossy(&out.stdout);
    let mut lines = raw.lines();

    let columns: Vec<String> = lines
        .next()
        .unwrap_or("")
        .split('\t')
        .map(|s| s.to_owned())
        .collect();

    let rows: Vec<Vec<String>> = lines
        .map(|line| line.split('\t').map(|s| s.to_owned()).collect())
        .collect();

    let row_count = rows.len();
    Ok(Json(serde_json::json!({
        "columns": columns,
        "rows": rows,
        "row_count": row_count,
    })))
}

// ── Backups ────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateBackupRequest {
    pub note: Option<String>,
}

pub async fn list_wp_backups(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    #[derive(sqlx::FromRow)]
    struct BackupRow {
        id: Uuid,
        backup_type: String,
        status: String,
        note: Option<String>,
        size_bytes: Option<i64>,
        created_at: time::OffsetDateTime,
    }

    let rows = sqlx::query_as::<_, BackupRow>(
        "SELECT id, type AS backup_type, status, note, size_bytes, created_at
         FROM plugin_wordpress_backups
         WHERE installation_id = $1
         ORDER BY created_at DESC
         LIMIT 50",
    )
    .bind(id)
    .fetch_all(&pool)
    .await
    .map_err(|e| { tracing::error!(%e); ApiError::internal() })?;

    let data: Vec<_> = rows.iter().map(|r| serde_json::json!({
        "id": r.id,
        "type": r.backup_type,
        "status": r.status,
        "note": r.note,
        "size_bytes": r.size_bytes,
        "created_at": crate::serde_util::fmt_dt(r.created_at),
    })).collect();

    Ok(Json(serde_json::json!({ "data": data })))
}

pub async fn create_wp_backup(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateBackupRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let backup_id: Uuid = sqlx::query_scalar(
        "INSERT INTO plugin_wordpress_backups (installation_id, note, status)
         VALUES ($1, $2, 'running') RETURNING id",
    )
    .bind(id)
    .bind(&body.note)
    .fetch_one(&pool)
    .await
    .map_err(|e| { tracing::error!(%e); ApiError::internal() })?;

    let pool2 = pool.clone();
    tokio::spawn(async move {
        let env = match WpEnv::load(&pool2, id).await {
            Ok(e)  => e,
            Err(_) => return,
        };

        // Backup dir OUTSIDE webroot to prevent HTTP access to SQL dumps
        let backup_dir = format!("/tmp/tundra/wp-backups/{}", id);
        let _ = tokio::fs::create_dir_all(&backup_dir).await;
        let file_path = format!("{}/{}.sql", backup_dir, backup_id);

        match env.run(&["db", "export", &file_path]).await {
            Ok(_) => {
                let size = tokio::fs::metadata(&file_path).await
                    .map(|m| m.len() as i64).ok();
                let _ = sqlx::query(
                    "UPDATE plugin_wordpress_backups
                     SET status = 'complete', file_path = $1, size_bytes = $2, updated_at = now()
                     WHERE id = $3",
                )
                .bind(&file_path)
                .bind(size)
                .bind(backup_id)
                .execute(&pool2)
                .await;
            }
            Err(e) => {
                let _ = sqlx::query(
                    "UPDATE plugin_wordpress_backups
                     SET status = 'failed', error = $1, updated_at = now()
                     WHERE id = $2",
                )
                .bind(&e)
                .bind(backup_id)
                .execute(&pool2)
                .await;
            }
        }
    });

    Ok((StatusCode::ACCEPTED, Json(serde_json::json!({
        "id": backup_id,
        "status": "running",
    }))))
}

pub async fn download_wp_backup(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path((id, backup_id)): Path<(Uuid, Uuid)>,
) -> Result<impl IntoResponse, ApiError> {
    let file_path: Option<String> = sqlx::query_scalar(
        "SELECT file_path FROM plugin_wordpress_backups
         WHERE id = $1 AND installation_id = $2 AND status = 'complete'",
    )
    .bind(backup_id)
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| ApiError::internal())?;

    let file_path = file_path.ok_or_else(|| ApiError::not_found("backup"))?;

    let bytes = tokio::fs::read(&file_path).await.map_err(|_| {
        ApiError::new(StatusCode::NOT_FOUND, "backup.file_missing", "backup file not found on disk")
    })?;

    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/sql")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"backup-{}.sql\"", backup_id),
        )
        .body(Body::from(bytes))
        .map_err(|_| ApiError::internal())?;

    Ok(response)
}

pub async fn restore_wp_backup(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path((id, backup_id)): Path<(Uuid, Uuid)>,
) -> Result<impl IntoResponse, ApiError> {
    let file_path: Option<String> = sqlx::query_scalar(
        "SELECT file_path FROM plugin_wordpress_backups
         WHERE id = $1 AND installation_id = $2 AND status = 'complete'",
    )
    .bind(backup_id)
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| ApiError::internal())?;

    let file_path = file_path.ok_or_else(|| ApiError::not_found("backup"))?;

    let env = WpEnv::load(&pool, id).await?;
    env.run(&["db", "import", &file_path])
        .await
        .map_err(wp_cli_error)?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn delete_wp_backup(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path((id, backup_id)): Path<(Uuid, Uuid)>,
) -> Result<impl IntoResponse, ApiError> {
    let file_path: Option<String> = sqlx::query_scalar(
        "SELECT file_path FROM plugin_wordpress_backups
         WHERE id = $1 AND installation_id = $2",
    )
    .bind(backup_id)
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| ApiError::internal())?;

    if let Some(ref path) = file_path {
        let _ = tokio::fs::remove_file(path).await;
    }

    sqlx::query("DELETE FROM plugin_wordpress_backups WHERE id = $1 AND installation_id = $2")
        .bind(backup_id)
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|_| ApiError::internal())?;

    Ok(StatusCode::NO_CONTENT)
}

// ── Backup schedule ────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct BackupScheduleRequest {
    pub frequency: String, // "disabled" | "daily" | "weekly" | "monthly"
    pub retention: i32,
}

pub async fn get_backup_schedule(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let row: Option<(String, i32)> = sqlx::query_as(
        "SELECT frequency, retention FROM plugin_wordpress_backup_schedules WHERE installation_id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|_| ApiError::internal())?;

    let (frequency, retention) = row.unwrap_or_else(|| ("disabled".to_owned(), 7));
    Ok(Json(serde_json::json!({ "frequency": frequency, "retention": retention })))
}

pub async fn save_backup_schedule(
    AuthSession(_s): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<BackupScheduleRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let valid = ["disabled", "daily", "weekly", "monthly"];
    if !valid.contains(&body.frequency.as_str()) {
        return Err(ApiError::bad_request("invalid frequency"));
    }

    sqlx::query(
        "INSERT INTO plugin_wordpress_backup_schedules (installation_id, frequency, retention)
         VALUES ($1, $2, $3)
         ON CONFLICT (installation_id) DO UPDATE
             SET frequency = EXCLUDED.frequency,
                 retention = EXCLUDED.retention,
                 updated_at = now()",
    )
    .bind(id)
    .bind(&body.frequency)
    .bind(body.retention)
    .execute(&pool)
    .await
    .map_err(|_| ApiError::internal())?;

    Ok(Json(serde_json::json!({ "frequency": body.frequency, "retention": body.retention })))
}
