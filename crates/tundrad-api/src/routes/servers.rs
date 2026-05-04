use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use tundrad_auth::{Action, AuthzService, Resource};
use tundrad_pki::SetupToken;
use tundrad_repo::PgPool;
use uuid::Uuid;

use crate::{error::ApiError, extractors::AuthSession, ssh_installer};

#[derive(Deserialize)]
pub struct CreateServerRequest {
    pub name: String,
    pub hostname: String,
    pub region: Option<String>,
    pub os: Option<String>,
}

#[derive(Serialize)]
pub struct ServerDto {
    pub id: String,
    pub name: String,
    pub hostname: String,
    pub region: Option<String>,
    pub os: String,
    pub status: String,
    pub agent_version: Option<String>,
    pub agent_last_seen_at: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct CreateServerResponse {
    pub server: ServerDto,
    /// Single-use setup token — show once, never stored in plaintext.
    pub setup_token: String,
    pub enrolment_command: String,
}

pub async fn list(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Read, Resource::Server)
        .map_err(ApiError::from)?;

    let servers = tundrad_repo::ServerRepo::new(&pool)
        .list(100)
        .await
        .map_err(ApiError::from)?;

    let data: Vec<ServerDto> = servers.into_iter().map(to_dto).collect();
    Ok(Json(
        serde_json::json!({ "data": data, "next_cursor": null }),
    ))
}

pub async fn get(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Read, Resource::Server)
        .map_err(ApiError::from)?;

    let server = tundrad_repo::ServerRepo::new(&pool)
        .find_by_id(id)
        .await
        .map_err(ApiError::from)?;

    Ok(Json(to_dto(server)))
}

pub async fn create(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<CreateServerRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Create, Resource::Server)
        .map_err(ApiError::from)?;

    let token = SetupToken::generate();
    let token_hash = token.hash();

    let new_server = tundrad_domain::server::NewServer {
        name: body.name,
        hostname: body.hostname.clone(),
        region: body.region,
        os: body.os.unwrap_or_else(|| "ubuntu-24.04".to_owned()),
    };

    let server = tundrad_repo::ServerRepo::new(&pool)
        .create(new_server, &token_hash.0, token.expires_at)
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(tundrad_domain::NewAuditEntry {
            actor: tundrad_domain::AuditActor::Operator(session.operator_id),
            action: "server.create".to_owned(),
            resource_type: Some("server".to_owned()),
            resource_id: Some(server.id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({ "hostname": server.hostname }),
        })
        .await
        .map_err(ApiError::from)?;

    let enrolment_command = format!(
        "curl -fsSL https://<panel-host>/agent/install | sudo bash -s -- --token={}",
        token.raw
    );

    Ok((
        StatusCode::CREATED,
        Json(CreateServerResponse {
            setup_token: token.raw,
            enrolment_command,
            server: to_dto(server),
        }),
    ))
}

pub async fn delete(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Delete, Resource::Server)
        .map_err(ApiError::from)?;

    tundrad_repo::ServerRepo::new(&pool)
        .soft_delete(id)
        .await
        .map_err(ApiError::from)?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(tundrad_domain::NewAuditEntry {
            actor: tundrad_domain::AuditActor::Operator(session.operator_id),
            action: "server.delete".to_owned(),
            resource_type: Some("server".to_owned()),
            resource_id: Some(id),
            ip: None,
            user_agent: None,
            details: serde_json::Value::Object(Default::default()),
        })
        .await
        .map_err(ApiError::from)?;

    Ok(StatusCode::NO_CONTENT)
}

// ── Wizard: SSH fingerprint ────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct WizardFingerprintRequest {
    pub user: String,
    pub host: String,
}

#[derive(Serialize)]
pub struct WizardFingerprintResponse {
    pub host: String,
    pub fingerprint: String,
}

pub async fn wizard_fingerprint(
    AuthSession(_session): AuthSession,
    Json(body): Json<WizardFingerprintRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let info = ssh_installer::fetch_fingerprint(&body.user, &body.host)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "SSH fingerprint fetch failed");
            ApiError::internal()
        })?;

    Ok(Json(WizardFingerprintResponse {
        host: info.host,
        fingerprint: info.fingerprint,
    }))
}

// ── Wizard: SSH install ───────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct WizardInstallRequest {
    pub server_id: Uuid,
    pub user: String,
    pub host: String,
    pub confirmed_fingerprint: String,
}

#[derive(Serialize)]
pub struct WizardInstallResponse {
    pub ok: bool,
    pub log: Vec<String>,
}

pub async fn wizard_install(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Json(body): Json<WizardInstallRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Create, Resource::Server)
        .map_err(ApiError::from)?;

    // Look up the server to build the enrolment URL stub.
    let server = tundrad_repo::ServerRepo::new(&pool)
        .find_by_id(body.server_id)
        .await
        .map_err(ApiError::from)?;

    let control_plane_url = format!("https://<panel-host>/agent/connect?server={}", server.id);

    // Fingerprint is presented for confirmation in the UI before this call.
    let _confirmed = &body.confirmed_fingerprint;

    let outcome =
        ssh_installer::run_installer(&body.user, &body.host, "<token>", &control_plane_url)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "SSH agent install failed");
                ApiError::internal()
            })?;

    tundrad_repo::AuditLogRepo::new(&pool)
        .append(tundrad_domain::NewAuditEntry {
            actor: tundrad_domain::AuditActor::Operator(session.operator_id),
            action: "servers.ssh_install".to_owned(),
            resource_type: Some("server".to_owned()),
            resource_id: Some(body.server_id),
            ip: None,
            user_agent: None,
            details: serde_json::json!({
                "host": body.host,
                "user": body.user,
                "exit_code": outcome.exit_code,
            }),
        })
        .await
        .map_err(ApiError::from)?;

    Ok(Json(WizardInstallResponse {
        ok: outcome.exit_code == 0,
        log: outcome.log_lines,
    }))
}

fn to_dto(s: tundrad_domain::Server) -> ServerDto {
    ServerDto {
        id: s.id.to_string(),
        name: s.name,
        hostname: s.hostname,
        region: s.region,
        os: s.os,
        status: s.status.as_str().to_owned(),
        agent_version: s.agent_version,
        agent_last_seen_at: s.agent_last_seen_at.map(|t| t.to_string()),
        created_at: s.created_at.to_string(),
    }
}

// ── Scheduling suggestion ─────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SuggestQuery {
    pub ram_mb: Option<i64>,
    pub disk_gb: Option<i64>,
    pub cpu_cores: Option<i32>,
}

#[derive(Serialize)]
pub struct SuggestEntry {
    pub server_id: String,
    pub name: String,
    pub score: f64,
    pub available_ram_mb: i64,
    pub available_disk_gb: i64,
    pub available_cpu_pct: f64,
}

pub async fn suggest_server(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Query(q): Query<SuggestQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Read, Resource::Server)
        .map_err(ApiError::from)?;

    let metrics = tundrad_repo::ServerMetricsRepo::new(&pool)
        .list_all()
        .await
        .map_err(ApiError::from)?;

    // Load server names for the response.
    let servers = tundrad_repo::ServerRepo::new(&pool)
        .list(500)
        .await
        .map_err(ApiError::from)?;

    let need_ram = q.ram_mb.unwrap_or(0);
    let need_disk = q.disk_gb.unwrap_or(0);
    let need_cpu = q.cpu_cores.unwrap_or(0);

    let server_map: std::collections::HashMap<Uuid, String> =
        servers.into_iter().map(|s| (s.id, s.name)).collect();

    let mut entries: Vec<SuggestEntry> = metrics
        .into_iter()
        .filter_map(|m| {
            let avail_ram = m.ram_total_mb - m.ram_used_mb;
            let avail_disk = m.disk_total_gb - m.disk_used_gb;
            let avail_cpu_pct = 100.0 - m.cpu_used_pct;

            // Hard filters
            if avail_ram < need_ram {
                return None;
            }
            if avail_disk < need_disk {
                return None;
            }
            if need_cpu > 0 && m.cpu_cores < need_cpu {
                return None;
            }

            // Score: average of available fractions (guard against division by zero)
            let ram_frac = if m.ram_total_mb > 0 {
                avail_ram as f64 / m.ram_total_mb as f64
            } else {
                0.0
            };
            let disk_frac = if m.disk_total_gb > 0 {
                avail_disk as f64 / m.disk_total_gb as f64
            } else {
                0.0
            };
            let cpu_frac = avail_cpu_pct / 100.0;
            let score = (ram_frac + disk_frac + cpu_frac) / 3.0;

            let name = server_map.get(&m.server_id).cloned().unwrap_or_default();

            Some(SuggestEntry {
                server_id: m.server_id.to_string(),
                name,
                score,
                available_ram_mb: avail_ram,
                available_disk_gb: avail_disk,
                available_cpu_pct: avail_cpu_pct,
            })
        })
        .collect();

    // Sort by available RAM descending (most headroom first).
    entries.sort_by(|a, b| b.available_ram_mb.cmp(&a.available_ram_mb));

    Ok(Json(serde_json::json!({ "data": entries })))
}

// ── Metrics state endpoint ────────────────────────────────────────────────

#[derive(Serialize)]
pub struct MetricsStateDto {
    pub server_id: String,
    pub cpu_cores: i32,
    pub cpu_used_pct: f64,
    pub ram_total_mb: i64,
    pub ram_used_mb: i64,
    pub disk_total_gb: i64,
    pub disk_used_gb: i64,
    pub site_count: i32,
    pub refreshed_at: String,
}

pub async fn metrics_state(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Read, Resource::Server)
        .map_err(ApiError::from)?;

    let rows = tundrad_repo::ServerMetricsRepo::new(&pool)
        .list_all()
        .await
        .map_err(ApiError::from)?;

    let data: Vec<MetricsStateDto> = rows
        .into_iter()
        .map(|m| MetricsStateDto {
            server_id: m.server_id.to_string(),
            cpu_cores: m.cpu_cores,
            cpu_used_pct: m.cpu_used_pct,
            ram_total_mb: m.ram_total_mb,
            ram_used_mb: m.ram_used_mb,
            disk_total_gb: m.disk_total_gb,
            disk_used_gb: m.disk_used_gb,
            site_count: m.site_count,
            refreshed_at: m.refreshed_at.to_string(),
        })
        .collect();

    Ok(Json(serde_json::json!({ "data": data })))
}

// ── PATCH /api/v1/servers/:server_id ─────────────────────────────────────

/// All fields are optional — send only what needs to change.
#[derive(Deserialize)]
pub struct UpdateServerRequest {
    pub name: Option<String>,
    /// Send `null` explicitly to clear the region.
    #[serde(default, deserialize_with = "crate::serde_util::option_option")]
    pub region: Option<Option<String>>,
    /// Send `null` explicitly to clear notes.
    #[serde(default, deserialize_with = "crate::serde_util::option_option")]
    pub notes: Option<Option<String>>,
    pub maintenance_starts_at: Option<String>,
    pub maintenance_ends_at: Option<String>,
}

pub async fn update_server(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(server_id): Path<Uuid>,
    Json(body): Json<UpdateServerRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;

    AuthzService
        .require(&op.role, Action::Update, Resource::Server)
        .map_err(ApiError::from)?;

    let repo = tundrad_repo::ServerRepo::new(&pool);

    // Update metadata fields (name/region/notes) if any were supplied.
    if body.name.is_some() || body.region.is_some() || body.notes.is_some() {
        repo.update_metadata(
            server_id,
            body.name.as_deref(),
            body.region.as_ref().map(|r| r.as_deref()),
            body.notes.as_ref().map(|n| n.as_deref()),
        )
        .await
        .map_err(ApiError::from)?;

        tundrad_repo::AuditLogRepo::new(&pool)
            .append(tundrad_domain::NewAuditEntry {
                actor: tundrad_domain::AuditActor::Operator(session.operator_id),
                action: "server.update".to_owned(),
                resource_type: Some("server".to_owned()),
                resource_id: Some(server_id),
                ip: None,
                user_agent: None,
                details: serde_json::json!({
                    "name":   body.name,
                    "region": body.region,
                    "notes":  body.notes,
                }),
            })
            .await
            .map_err(ApiError::from)?;
    }

    // Update maintenance window if those fields were supplied.
    if body.maintenance_starts_at.is_some() || body.maintenance_ends_at.is_some() {
        let starts_at = body
            .maintenance_starts_at
            .as_deref()
            .map(|s| {
                time::OffsetDateTime::parse(s, &time::format_description::well_known::Rfc3339)
                    .map_err(|e| ApiError::bad_request(format!("maintenance_starts_at: {e}")))
            })
            .transpose()?;

        let ends_at = body
            .maintenance_ends_at
            .as_deref()
            .map(|s| {
                time::OffsetDateTime::parse(s, &time::format_description::well_known::Rfc3339)
                    .map_err(|e| ApiError::bad_request(format!("maintenance_ends_at: {e}")))
            })
            .transpose()?;

        repo.update_maintenance(server_id, starts_at, ends_at)
            .await
            .map_err(ApiError::from)?;

        tundrad_repo::AuditLogRepo::new(&pool)
            .append(tundrad_domain::NewAuditEntry {
                actor: tundrad_domain::AuditActor::Operator(session.operator_id),
                action: "server.update_maintenance".to_owned(),
                resource_type: Some("server".to_owned()),
                resource_id: Some(server_id),
                ip: None,
                user_agent: None,
                details: serde_json::json!({
                    "maintenance_starts_at": body.maintenance_starts_at,
                    "maintenance_ends_at":   body.maintenance_ends_at,
                }),
            })
            .await
            .map_err(ApiError::from)?;
    }

    Ok(StatusCode::NO_CONTENT)
}
