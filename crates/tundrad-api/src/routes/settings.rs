use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use hmac::{Hmac, KeyInit, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tundrad_auth::{Action, AuthzService, Resource};
use tundrad_crypto::encrypted_field::{decrypt_value, encrypt_value, EncryptedFamily, IntegrationSecretFamily};
use tundrad_repo::PgPool;

use crate::{error::ApiError, extractors::AuthSession};

fn db_err(e: sqlx::Error) -> ApiError {
    ApiError::from(tundrad_repo::RepoError::from(e))
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct GeneralSettings {
    pub platform_name: Option<String>,
    pub default_timezone: Option<String>,
    pub default_locale: Option<String>,
    pub date_format: Option<String>,   // "relative" | "absolute"
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct SmtpSettings {
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub from_email: Option<String>,
    pub from_name: Option<String>,
    pub encryption: Option<String>,   // "tls" | "starttls" | "none"
    pub has_password: bool,           // true if a password is stored (never echoed back)
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct NotificationSettings {
    pub slack_webhook_url: Option<String>,
    pub discord_webhook_url: Option<String>,
    pub alert_email: Option<String>,
    pub notify_on_deploy: Option<bool>,
    pub notify_on_backup: Option<bool>,
    pub notify_on_cert_renewal: Option<bool>,
    pub notify_on_alert: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct SecuritySettings {
    pub session_timeout_minutes: Option<i64>,
    pub require_totp: Option<bool>,
    pub ip_allowlist: Option<Vec<String>>,
    pub acme_email: Option<String>,
    pub acme_directory: Option<String>,  // "letsencrypt" | "letsencrypt_staging" | custom URL
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct BackupSettings {
    pub default_retention_days: Option<i64>,
    pub s3_endpoint: Option<String>,
    pub s3_bucket: Option<String>,
    pub s3_region: Option<String>,
    pub s3_access_key: Option<String>,
    pub has_s3_secret_key: bool,      // never echoed back
    pub default_schedule: Option<String>,  // cron expression
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct BrandingSettings {
    pub company_name: Option<String>,
    pub support_email: Option<String>,
    pub support_url: Option<String>,
    pub logo_url: Option<String>,
    pub favicon_url: Option<String>,
    pub custom_footer: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct DnsSettings {
    pub nameserver1: Option<String>,
    pub nameserver2: Option<String>,
    pub nameserver3: Option<String>,
    pub soa_email: Option<String>,
    pub default_ttl: Option<i64>,       // seconds
    pub default_mx_priority: Option<i64>,
    pub enable_dkim_by_default: Option<bool>,
    pub enable_spf_by_default: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct DefaultsSettings {
    // PHP
    pub php_version: Option<String>,
    pub php_memory_limit_mb: Option<i64>,
    pub php_max_execution_sec: Option<i64>,
    pub php_upload_max_mb: Option<i64>,
    pub php_post_max_mb: Option<i64>,
    // Sites & databases
    pub default_disk_quota_mb: Option<i64>,
    pub default_db_charset: Option<String>,   // utf8mb4
    pub max_sites_per_server: Option<i64>,
    pub max_dbs_per_site: Option<i64>,
    // Stats
    pub stats_retention_days: Option<i64>,
    pub log_retention_days: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct SecurityPolicySettings {
    // Password policy
    pub password_min_length: Option<i64>,
    pub password_require_uppercase: Option<bool>,
    pub password_require_number: Option<bool>,
    pub password_require_special: Option<bool>,
    // Brute-force / lockout
    pub max_login_attempts: Option<i64>,
    pub lockout_duration_minutes: Option<i64>,
    pub lockout_whitelist: Option<Vec<String>>,  // IPs exempt from lockout
    // Registration
    pub allow_operator_self_register: Option<bool>,
    pub require_email_verification: Option<bool>,
    // Maintenance
    pub maintenance_mode: Option<bool>,
    pub maintenance_message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "section", content = "data", rename_all = "snake_case")]
pub enum SettingsDto {
    General(GeneralSettings),
    Smtp(SmtpSettings),
    Notifications(NotificationSettings),
    Security(SecuritySettings),
    Backups(BackupSettings),
    Branding(BrandingSettings),
    Dns(DnsSettings),
    Defaults(DefaultsSettings),
    SecurityPolicy(SecurityPolicySettings),
}

// ─── Patch request bodies ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct PatchGeneralRequest {
    pub platform_name: Option<serde_json::Value>,
    pub default_timezone: Option<String>,
    pub default_locale: Option<String>,
    pub date_format: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PatchSmtpRequest {
    pub host: Option<serde_json::Value>,
    pub port: Option<serde_json::Value>,
    pub username: Option<serde_json::Value>,
    pub password: Option<serde_json::Value>,   // null = clear, string = set
    pub from_email: Option<serde_json::Value>,
    pub from_name: Option<serde_json::Value>,
    pub encryption: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PatchNotificationsRequest {
    pub slack_webhook_url: Option<serde_json::Value>,
    pub discord_webhook_url: Option<serde_json::Value>,
    pub alert_email: Option<serde_json::Value>,
    pub notify_on_deploy: Option<bool>,
    pub notify_on_backup: Option<bool>,
    pub notify_on_cert_renewal: Option<bool>,
    pub notify_on_alert: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct PatchSecurityRequest {
    pub session_timeout_minutes: Option<i64>,
    pub require_totp: Option<bool>,
    pub ip_allowlist: Option<Vec<String>>,
    pub acme_email: Option<serde_json::Value>,
    pub acme_directory: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PatchBackupsRequest {
    pub default_retention_days: Option<i64>,
    pub s3_endpoint: Option<serde_json::Value>,
    pub s3_bucket: Option<serde_json::Value>,
    pub s3_region: Option<serde_json::Value>,
    pub s3_access_key: Option<serde_json::Value>,
    pub s3_secret_key: Option<serde_json::Value>,  // null = clear, string = set
    pub default_schedule: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct PatchBrandingRequest {
    pub company_name: Option<serde_json::Value>,
    pub support_email: Option<serde_json::Value>,
    pub support_url: Option<serde_json::Value>,
    pub logo_url: Option<serde_json::Value>,
    pub favicon_url: Option<serde_json::Value>,
    pub custom_footer: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct PatchDnsRequest {
    pub nameserver1: Option<serde_json::Value>,
    pub nameserver2: Option<serde_json::Value>,
    pub nameserver3: Option<serde_json::Value>,
    pub soa_email: Option<serde_json::Value>,
    pub default_ttl: Option<i64>,
    pub default_mx_priority: Option<i64>,
    pub enable_dkim_by_default: Option<bool>,
    pub enable_spf_by_default: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct PatchDefaultsRequest {
    pub php_version: Option<String>,
    pub php_memory_limit_mb: Option<i64>,
    pub php_max_execution_sec: Option<i64>,
    pub php_upload_max_mb: Option<i64>,
    pub php_post_max_mb: Option<i64>,
    pub default_disk_quota_mb: Option<i64>,
    pub default_db_charset: Option<String>,
    pub max_sites_per_server: Option<i64>,
    pub max_dbs_per_site: Option<i64>,
    pub stats_retention_days: Option<i64>,
    pub log_retention_days: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct PatchSecurityPolicyRequest {
    pub password_min_length: Option<i64>,
    pub password_require_uppercase: Option<bool>,
    pub password_require_number: Option<bool>,
    pub password_require_special: Option<bool>,
    pub max_login_attempts: Option<i64>,
    pub lockout_duration_minutes: Option<i64>,
    pub lockout_whitelist: Option<Vec<String>>,
    pub allow_operator_self_register: Option<bool>,
    pub require_email_verification: Option<bool>,
    pub maintenance_mode: Option<bool>,
    pub maintenance_message: Option<serde_json::Value>,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn nullable_str(v: &Option<serde_json::Value>) -> Option<Option<String>> {
    match v {
        None => None,
        Some(serde_json::Value::Null) => Some(None),
        Some(serde_json::Value::String(s)) => Some(Some(s.clone())),
        _ => None,
    }
}

fn nullable_u16(v: &Option<serde_json::Value>) -> Option<Option<i64>> {
    match v {
        None => None,
        Some(serde_json::Value::Null) => Some(None),
        Some(serde_json::Value::Number(n)) => Some(n.as_i64()),
        _ => None,
    }
}

async fn require_admin(pool: &PgPool, session_operator_id: uuid::Uuid) -> Result<(), ApiError> {
    let op = tundrad_repo::OperatorRepo::new(pool)
        .find_by_id(session_operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Update, Resource::Operator)
        .map_err(ApiError::from)
}

fn encrypt_secret(s: &str) -> Result<Vec<u8>, ApiError> {
    encrypt_value(&s.to_owned(), IntegrationSecretFamily::FAMILY).map_err(|_| ApiError::internal())
}

// ─── GET /api/v1/settings/{section} ──────────────────────────────────────────

pub async fn get_section(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(section): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    require_admin(&pool, session.operator_id).await?;

    let row = sqlx::query!(
        r#"SELECT data, smtp_password, s3_secret_key FROM platform_settings WHERE section = $1"#,
        section
    )
    .fetch_optional(&pool)
    .await
    .map_err(db_err)?
    .ok_or_else(|| ApiError::not_found("settings section not found"))?;

    let dto = match section.as_str() {
        "general" => {
            let s: GeneralSettings = serde_json::from_value(row.data).unwrap_or_default();
            SettingsDto::General(s)
        }
        "smtp" => {
            let mut s: SmtpSettings = serde_json::from_value(row.data).unwrap_or_default();
            s.has_password = row.smtp_password.is_some();
            SettingsDto::Smtp(s)
        }
        "notifications" => {
            let s: NotificationSettings = serde_json::from_value(row.data).unwrap_or_default();
            SettingsDto::Notifications(s)
        }
        "security" => {
            let s: SecuritySettings = serde_json::from_value(row.data).unwrap_or_default();
            SettingsDto::Security(s)
        }
        "backups" => {
            let mut s: BackupSettings = serde_json::from_value(row.data).unwrap_or_default();
            s.has_s3_secret_key = row.s3_secret_key.is_some();
            SettingsDto::Backups(s)
        }
        "branding" => {
            let s: BrandingSettings = serde_json::from_value(row.data).unwrap_or_default();
            SettingsDto::Branding(s)
        }
        "dns" => {
            let s: DnsSettings = serde_json::from_value(row.data).unwrap_or_default();
            SettingsDto::Dns(s)
        }
        "defaults" => {
            let s: DefaultsSettings = serde_json::from_value(row.data).unwrap_or_default();
            SettingsDto::Defaults(s)
        }
        "security_policy" => {
            let s: SecurityPolicySettings = serde_json::from_value(row.data).unwrap_or_default();
            SettingsDto::SecurityPolicy(s)
        }
        _ => return Err(ApiError::not_found("settings section not found")),
    };

    Ok(Json(dto))
}

// ─── PATCH /api/v1/settings/general ──────────────────────────────────────────

pub async fn patch_general(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<PatchGeneralRequest>,
) -> Result<impl IntoResponse, ApiError> {
    require_admin(&pool, session.operator_id).await?;

    let row = sqlx::query!("SELECT data FROM platform_settings WHERE section = 'general'")
        .fetch_one(&pool)
        .await
        .map_err(db_err)?;

    let mut s: GeneralSettings = serde_json::from_value(row.data).unwrap_or_default();

    if let Some(v) = nullable_str(&body.platform_name) { s.platform_name = v; }
    if let Some(v) = body.default_timezone { s.default_timezone = Some(v); }
    if let Some(v) = body.default_locale { s.default_locale = Some(v); }
    if let Some(v) = body.date_format { s.date_format = Some(v); }

    let data = serde_json::to_value(&s).map_err(|_| ApiError::internal())?;
    sqlx::query!(
        "UPDATE platform_settings SET data = $1, updated_at = now() WHERE section = 'general'",
        data
    )
    .execute(&pool)
    .await
    .map_err(db_err)?;

    Ok((StatusCode::OK, Json(SettingsDto::General(s))))
}

// ─── PATCH /api/v1/settings/smtp ─────────────────────────────────────────────

pub async fn patch_smtp(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<PatchSmtpRequest>,
) -> Result<impl IntoResponse, ApiError> {
    require_admin(&pool, session.operator_id).await?;

    let row = sqlx::query!(
        "SELECT data, smtp_password FROM platform_settings WHERE section = 'smtp'"
    )
    .fetch_one(&pool)
    .await
    .map_err(db_err)?;

    let mut s: SmtpSettings = serde_json::from_value(row.data).unwrap_or_default();

    if let Some(v) = nullable_str(&body.host) { s.host = v; }
    if let Some(v) = nullable_u16(&body.port) { s.port = v.map(|n| n as u16); }
    if let Some(v) = nullable_str(&body.username) { s.username = v; }
    if let Some(v) = nullable_str(&body.from_email) { s.from_email = v; }
    if let Some(v) = nullable_str(&body.from_name) { s.from_name = v; }
    if let Some(v) = body.encryption { s.encryption = Some(v); }

    let data = serde_json::to_value(&s).map_err(|_| ApiError::internal())?;

    // Handle password separately — encrypt if setting, clear if null, skip if absent
    let new_password_bytes: Option<Option<Vec<u8>>> = match &body.password {
        None => None,
        Some(serde_json::Value::Null) => Some(None),
        Some(serde_json::Value::String(pw)) => {
            Some(Some(encrypt_secret(pw)?))
        }
        _ => None,
    };

    match new_password_bytes {
        None => {
            // no change to password — update data only
            let has_pw = row.smtp_password.is_some();
            sqlx::query!(
                "UPDATE platform_settings SET data = $1, updated_at = now() WHERE section = 'smtp'",
                data
            )
            .execute(&pool)
            .await
            .map_err(db_err)?;
            s.has_password = has_pw;
        }
        Some(None) => {
            sqlx::query!(
                "UPDATE platform_settings SET data = $1, smtp_password = NULL, updated_at = now() WHERE section = 'smtp'",
                data
            )
            .execute(&pool)
            .await
            .map_err(db_err)?;
            s.has_password = false;
        }
        Some(Some(bytes)) => {
            sqlx::query!(
                "UPDATE platform_settings SET data = $1, smtp_password = $2, updated_at = now() WHERE section = 'smtp'",
                data,
                bytes as Vec<u8>
            )
            .execute(&pool)
            .await
            .map_err(db_err)?;
            s.has_password = true;
        }
    }

    Ok((StatusCode::OK, Json(SettingsDto::Smtp(s))))
}

// ─── PATCH /api/v1/settings/notifications ────────────────────────────────────

pub async fn patch_notifications(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<PatchNotificationsRequest>,
) -> Result<impl IntoResponse, ApiError> {
    require_admin(&pool, session.operator_id).await?;

    let row = sqlx::query!("SELECT data FROM platform_settings WHERE section = 'notifications'")
        .fetch_one(&pool)
        .await
        .map_err(db_err)?;

    let mut s: NotificationSettings = serde_json::from_value(row.data).unwrap_or_default();

    if let Some(v) = nullable_str(&body.slack_webhook_url) { s.slack_webhook_url = v; }
    if let Some(v) = nullable_str(&body.discord_webhook_url) { s.discord_webhook_url = v; }
    if let Some(v) = nullable_str(&body.alert_email) { s.alert_email = v; }
    if let Some(v) = body.notify_on_deploy { s.notify_on_deploy = Some(v); }
    if let Some(v) = body.notify_on_backup { s.notify_on_backup = Some(v); }
    if let Some(v) = body.notify_on_cert_renewal { s.notify_on_cert_renewal = Some(v); }
    if let Some(v) = body.notify_on_alert { s.notify_on_alert = Some(v); }

    let data = serde_json::to_value(&s).map_err(|_| ApiError::internal())?;
    sqlx::query!(
        "UPDATE platform_settings SET data = $1, updated_at = now() WHERE section = 'notifications'",
        data
    )
    .execute(&pool)
    .await
    .map_err(db_err)?;

    Ok((StatusCode::OK, Json(SettingsDto::Notifications(s))))
}

// ─── PATCH /api/v1/settings/security ─────────────────────────────────────────

pub async fn patch_security_settings(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<PatchSecurityRequest>,
) -> Result<impl IntoResponse, ApiError> {
    require_admin(&pool, session.operator_id).await?;

    let row = sqlx::query!("SELECT data FROM platform_settings WHERE section = 'security'")
        .fetch_one(&pool)
        .await
        .map_err(db_err)?;

    let mut s: SecuritySettings = serde_json::from_value(row.data).unwrap_or_default();

    if let Some(v) = body.session_timeout_minutes { s.session_timeout_minutes = Some(v); }
    if let Some(v) = body.require_totp { s.require_totp = Some(v); }
    if let Some(v) = body.ip_allowlist { s.ip_allowlist = Some(v); }
    if let Some(v) = nullable_str(&body.acme_email) { s.acme_email = v; }
    if let Some(v) = body.acme_directory { s.acme_directory = Some(v); }

    let data = serde_json::to_value(&s).map_err(|_| ApiError::internal())?;
    sqlx::query!(
        "UPDATE platform_settings SET data = $1, updated_at = now() WHERE section = 'security'",
        data
    )
    .execute(&pool)
    .await
    .map_err(db_err)?;

    Ok((StatusCode::OK, Json(SettingsDto::Security(s))))
}

// ─── PATCH /api/v1/settings/backups ──────────────────────────────────────────

pub async fn patch_backups(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<PatchBackupsRequest>,
) -> Result<impl IntoResponse, ApiError> {
    require_admin(&pool, session.operator_id).await?;

    let row = sqlx::query!(
        "SELECT data, s3_secret_key FROM platform_settings WHERE section = 'backups'"
    )
    .fetch_one(&pool)
    .await
    .map_err(db_err)?;

    let mut s: BackupSettings = serde_json::from_value(row.data).unwrap_or_default();

    if let Some(v) = body.default_retention_days { s.default_retention_days = Some(v); }
    if let Some(v) = nullable_str(&body.s3_endpoint) { s.s3_endpoint = v; }
    if let Some(v) = nullable_str(&body.s3_bucket) { s.s3_bucket = v; }
    if let Some(v) = nullable_str(&body.s3_region) { s.s3_region = v; }
    if let Some(v) = nullable_str(&body.s3_access_key) { s.s3_access_key = v; }
    if let Some(v) = nullable_str(&body.default_schedule) { s.default_schedule = v; }

    let data = serde_json::to_value(&s).map_err(|_| ApiError::internal())?;

    let new_secret_bytes: Option<Option<Vec<u8>>> = match &body.s3_secret_key {
        None => None,
        Some(serde_json::Value::Null) => Some(None),
        Some(serde_json::Value::String(sk)) => {
            Some(Some(encrypt_secret(sk)?))
        }
        _ => None,
    };

    match new_secret_bytes {
        None => {
            let has_sk = row.s3_secret_key.is_some();
            sqlx::query!(
                "UPDATE platform_settings SET data = $1, updated_at = now() WHERE section = 'backups'",
                data
            )
            .execute(&pool)
            .await
            .map_err(db_err)?;
            s.has_s3_secret_key = has_sk;
        }
        Some(None) => {
            sqlx::query!(
                "UPDATE platform_settings SET data = $1, s3_secret_key = NULL, updated_at = now() WHERE section = 'backups'",
                data
            )
            .execute(&pool)
            .await
            .map_err(db_err)?;
            s.has_s3_secret_key = false;
        }
        Some(Some(bytes)) => {
            sqlx::query!(
                "UPDATE platform_settings SET data = $1, s3_secret_key = $2, updated_at = now() WHERE section = 'backups'",
                data,
                bytes as Vec<u8>
            )
            .execute(&pool)
            .await
            .map_err(db_err)?;
            s.has_s3_secret_key = true;
        }
    }

    Ok((StatusCode::OK, Json(SettingsDto::Backups(s))))
}

// ─── PATCH /api/v1/settings/branding ─────────────────────────────────────────

pub async fn patch_branding(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<PatchBrandingRequest>,
) -> Result<impl IntoResponse, ApiError> {
    require_admin(&pool, session.operator_id).await?;
    let row = sqlx::query!("SELECT data FROM platform_settings WHERE section = 'branding'")
        .fetch_one(&pool).await.map_err(db_err)?;
    let mut s: BrandingSettings = serde_json::from_value(row.data).unwrap_or_default();
    if let Some(v) = nullable_str(&body.company_name)  { s.company_name  = v; }
    if let Some(v) = nullable_str(&body.support_email) { s.support_email = v; }
    if let Some(v) = nullable_str(&body.support_url)   { s.support_url   = v; }
    if let Some(v) = nullable_str(&body.logo_url)      { s.logo_url      = v; }
    if let Some(v) = nullable_str(&body.favicon_url)   { s.favicon_url   = v; }
    if let Some(v) = nullable_str(&body.custom_footer) { s.custom_footer = v; }
    let data = serde_json::to_value(&s).map_err(|_| ApiError::internal())?;
    sqlx::query!("UPDATE platform_settings SET data = $1, updated_at = now() WHERE section = 'branding'", data)
        .execute(&pool).await.map_err(db_err)?;
    Ok((StatusCode::OK, Json(SettingsDto::Branding(s))))
}

// ─── PATCH /api/v1/settings/dns ──────────────────────────────────────────────

pub async fn patch_dns(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<PatchDnsRequest>,
) -> Result<impl IntoResponse, ApiError> {
    require_admin(&pool, session.operator_id).await?;
    let row = sqlx::query!("SELECT data FROM platform_settings WHERE section = 'dns'")
        .fetch_one(&pool).await.map_err(db_err)?;
    let mut s: DnsSettings = serde_json::from_value(row.data).unwrap_or_default();
    if let Some(v) = nullable_str(&body.nameserver1)   { s.nameserver1 = v; }
    if let Some(v) = nullable_str(&body.nameserver2)   { s.nameserver2 = v; }
    if let Some(v) = nullable_str(&body.nameserver3)   { s.nameserver3 = v; }
    if let Some(v) = nullable_str(&body.soa_email)     { s.soa_email   = v; }
    if let Some(v) = body.default_ttl                  { s.default_ttl           = Some(v); }
    if let Some(v) = body.default_mx_priority          { s.default_mx_priority   = Some(v); }
    if let Some(v) = body.enable_dkim_by_default       { s.enable_dkim_by_default = Some(v); }
    if let Some(v) = body.enable_spf_by_default        { s.enable_spf_by_default  = Some(v); }
    let data = serde_json::to_value(&s).map_err(|_| ApiError::internal())?;
    sqlx::query!("UPDATE platform_settings SET data = $1, updated_at = now() WHERE section = 'dns'", data)
        .execute(&pool).await.map_err(db_err)?;
    Ok((StatusCode::OK, Json(SettingsDto::Dns(s))))
}

// ─── PATCH /api/v1/settings/defaults ─────────────────────────────────────────

pub async fn patch_defaults(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<PatchDefaultsRequest>,
) -> Result<impl IntoResponse, ApiError> {
    require_admin(&pool, session.operator_id).await?;
    let row = sqlx::query!("SELECT data FROM platform_settings WHERE section = 'defaults'")
        .fetch_one(&pool).await.map_err(db_err)?;
    let mut s: DefaultsSettings = serde_json::from_value(row.data).unwrap_or_default();
    if let Some(v) = body.php_version             { s.php_version             = Some(v); }
    if let Some(v) = body.php_memory_limit_mb     { s.php_memory_limit_mb     = Some(v); }
    if let Some(v) = body.php_max_execution_sec   { s.php_max_execution_sec   = Some(v); }
    if let Some(v) = body.php_upload_max_mb       { s.php_upload_max_mb       = Some(v); }
    if let Some(v) = body.php_post_max_mb         { s.php_post_max_mb         = Some(v); }
    if let Some(v) = body.default_disk_quota_mb   { s.default_disk_quota_mb   = Some(v); }
    if let Some(v) = body.default_db_charset      { s.default_db_charset      = Some(v); }
    if let Some(v) = body.max_sites_per_server    { s.max_sites_per_server    = Some(v); }
    if let Some(v) = body.max_dbs_per_site        { s.max_dbs_per_site        = Some(v); }
    if let Some(v) = body.stats_retention_days    { s.stats_retention_days    = Some(v); }
    if let Some(v) = body.log_retention_days      { s.log_retention_days      = Some(v); }
    let data = serde_json::to_value(&s).map_err(|_| ApiError::internal())?;
    sqlx::query!("UPDATE platform_settings SET data = $1, updated_at = now() WHERE section = 'defaults'", data)
        .execute(&pool).await.map_err(db_err)?;
    Ok((StatusCode::OK, Json(SettingsDto::Defaults(s))))
}

// ─── PATCH /api/v1/settings/security_policy ──────────────────────────────────

pub async fn patch_security_policy(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<PatchSecurityPolicyRequest>,
) -> Result<impl IntoResponse, ApiError> {
    require_admin(&pool, session.operator_id).await?;
    let row = sqlx::query!("SELECT data FROM platform_settings WHERE section = 'security_policy'")
        .fetch_one(&pool).await.map_err(db_err)?;
    let mut s: SecurityPolicySettings = serde_json::from_value(row.data).unwrap_or_default();
    if let Some(v) = body.password_min_length           { s.password_min_length           = Some(v); }
    if let Some(v) = body.password_require_uppercase    { s.password_require_uppercase    = Some(v); }
    if let Some(v) = body.password_require_number       { s.password_require_number       = Some(v); }
    if let Some(v) = body.password_require_special      { s.password_require_special      = Some(v); }
    if let Some(v) = body.max_login_attempts            { s.max_login_attempts            = Some(v); }
    if let Some(v) = body.lockout_duration_minutes      { s.lockout_duration_minutes      = Some(v); }
    if let Some(v) = body.lockout_whitelist             { s.lockout_whitelist             = Some(v); }
    if let Some(v) = body.allow_operator_self_register  { s.allow_operator_self_register  = Some(v); }
    if let Some(v) = body.require_email_verification    { s.require_email_verification    = Some(v); }
    if let Some(v) = body.maintenance_mode              { s.maintenance_mode              = Some(v); }
    if let Some(v) = nullable_str(&body.maintenance_message) { s.maintenance_message = v; }
    let data = serde_json::to_value(&s).map_err(|_| ApiError::internal())?;
    sqlx::query!("UPDATE platform_settings SET data = $1, updated_at = now() WHERE section = 'security_policy'", data)
        .execute(&pool).await.map_err(db_err)?;
    Ok((StatusCode::OK, Json(SettingsDto::SecurityPolicy(s))))
}

// ─── POST /api/v1/settings/smtp/test ─────────────────────────────────────────

#[derive(Serialize)]
pub struct TestResult {
    ok: bool,
    message: String,
}

pub async fn test_smtp(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
) -> Result<impl IntoResponse, ApiError> {
    require_admin(&pool, session.operator_id).await?;

    let row = sqlx::query!("SELECT data FROM platform_settings WHERE section = 'smtp'")
        .fetch_one(&pool)
        .await
        .map_err(db_err)?;

    let s: SmtpSettings = serde_json::from_value(row.data).unwrap_or_default();

    let host = match s.host.as_deref().filter(|h| !h.is_empty()) {
        Some(h) => h.to_owned(),
        None => {
            return Ok(Json(TestResult {
                ok: false,
                message: "No SMTP host configured.".into(),
            }))
        }
    };
    let port = s.port.unwrap_or(587);

    // TCP connectivity test with 5-second timeout
    let addr = format!("{host}:{port}");
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tokio::net::TcpStream::connect(&addr),
    )
    .await;

    let (ok, message) = match result {
        Ok(Ok(_)) => (true, format!("Connected to {addr} — SMTP server is reachable.")),
        Ok(Err(e)) => (false, format!("Connection to {addr} failed: {e}")),
        Err(_) => (false, format!("Connection to {addr} timed out after 5 s.")),
    };

    Ok(Json(TestResult { ok, message }))
}

// ─── POST /api/v1/settings/storage/test ──────────────────────────────────────

type HmacSha256 = Hmac<Sha256>;

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

pub async fn test_storage(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
) -> Result<impl IntoResponse, ApiError> {
    require_admin(&pool, session.operator_id).await?;

    let row = sqlx::query!(
        "SELECT data, s3_secret_key FROM platform_settings WHERE section = 'backups'"
    )
    .fetch_one(&pool)
    .await
    .map_err(db_err)?;

    let s: BackupSettings = serde_json::from_value(row.data).unwrap_or_default();

    let bucket = match s.s3_bucket.as_deref().filter(|b| !b.is_empty()) {
        Some(b) => b.to_owned(),
        None => {
            return Ok(Json(TestResult {
                ok: false,
                message: "No S3 bucket configured.".into(),
            }))
        }
    };

    let access_key = match s.s3_access_key.as_deref().filter(|k| !k.is_empty()) {
        Some(k) => k.to_owned(),
        None => {
            return Ok(Json(TestResult {
                ok: false,
                message: "No S3 access key configured.".into(),
            }))
        }
    };

    let secret_key_bytes = match row.s3_secret_key {
        Some(b) => b,
        None => {
            return Ok(Json(TestResult {
                ok: false,
                message: "No S3 secret key configured.".into(),
            }))
        }
    };

    let secret_key: String = decrypt_value(&secret_key_bytes, IntegrationSecretFamily::FAMILY)
        .map_err(|_| ApiError::internal())?;

    let region = s.s3_region.as_deref().unwrap_or("us-east-1").to_owned();

    // Build endpoint URL
    let base_url = if let Some(ep) = s.s3_endpoint.as_deref().filter(|e| !e.is_empty()) {
        format!("{}/{}", ep.trim_end_matches('/'), bucket)
    } else {
        format!("https://{bucket}.s3.{region}.amazonaws.com")
    };

    // Perform a signed HEAD request on the bucket (ListBucket with max-keys=0)
    let url = format!("{base_url}?max-keys=0");
    let now = time::OffsetDateTime::now_utc();
    let date_str = format!(
        "{:04}{:02}{:02}",
        now.year(),
        now.month() as u8,
        now.day()
    );
    let datetime_str = format!(
        "{date_str}T{:02}{:02}{:02}Z",
        now.hour(),
        now.minute(),
        now.second()
    );

    let payload_hash = sha256_hex(b"");
    // Extract host from URL (strip scheme and path)
    let host = {
        let without_scheme = url.trim_start_matches("https://").trim_start_matches("http://");
        let host_part = without_scheme.split('/').next().unwrap_or("");
        host_part.split('?').next().unwrap_or("").to_owned()
    };

    let canonical_request = format!(
        "GET\n/{bucket}\nmax-keys=0\nhost:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{datetime_str}\n\nhost;x-amz-content-sha256;x-amz-date\n{payload_hash}"
    );

    let scope = format!("{date_str}/{region}/s3/aws4_request");
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{datetime_str}\n{scope}\n{}",
        sha256_hex(canonical_request.as_bytes())
    );

    let signing_key = {
        let k1 = hmac_sha256(format!("AWS4{secret_key}").as_bytes(), date_str.as_bytes());
        let k2 = hmac_sha256(&k1, region.as_bytes());
        let k3 = hmac_sha256(&k2, b"s3");
        hmac_sha256(&k3, b"aws4_request")
    };
    let signature = hex::encode(hmac_sha256(&signing_key, string_to_sign.as_bytes()));

    let auth = format!(
        "AWS4-HMAC-SHA256 Credential={access_key}/{scope},SignedHeaders=host;x-amz-content-sha256;x-amz-date,Signature={signature}"
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .use_rustls_tls()
        .build()
        .map_err(|_| ApiError::internal())?;

    let resp = client
        .get(&url)
        .header("host", &host)
        .header("x-amz-date", &datetime_str)
        .header("x-amz-content-sha256", &payload_hash)
        .header("authorization", &auth)
        .send()
        .await;

    let (ok, message) = match resp {
        Err(e) => (false, format!("Connection failed: {e}")),
        Ok(r) => {
            let status = r.status().as_u16();
            match status {
                200 | 204 => (true, format!("Connected to bucket '{bucket}' — credentials valid.")),
                403 => (false, format!("Bucket '{bucket}' exists but credentials were rejected (403).")),
                404 => (false, format!("Bucket '{bucket}' not found (404).")),
                _ => (false, format!("Unexpected response: HTTP {status}.")),
            }
        }
    };

    Ok(Json(TestResult { ok, message }))
}
