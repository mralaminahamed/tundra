//! Server-level system management routes:
//!   Firewall rules, package updates, process list, SSH terminal WebSocket.
//!
//! Execution is delegated to the server's tundra-agent via gRPC/SSH.
//! Stubs return realistic shapes so the UI can be built and tested.

use axum::{
    Json,
    extract::{Path, State, Query, ws::{Message, WebSocket, WebSocketUpgrade}},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use tundrad_auth::{Action, AuthzService, Resource};
use tundrad_repo::PgPool;
use uuid::Uuid;

use crate::{error::ApiError, extractors::AuthSession};

async fn require_server_access(pool: &PgPool, session_operator_id: Uuid) -> Result<(), ApiError> {
    let op = tundrad_repo::OperatorRepo::new(pool)
        .find_by_id(session_operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Read, Resource::Server)
        .map_err(ApiError::from)
}

// ─── Firewall ─────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FirewallRule {
    pub id: String,
    pub direction: String,    // "in" | "out"
    pub action: String,       // "allow" | "deny" | "reject"
    pub protocol: String,     // "tcp" | "udp" | "any"
    pub port: Option<String>, // "80", "443", "8080:8090", or null
    pub from_ip: Option<String>,
    pub to_ip: Option<String>,
    pub comment: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateFirewallRuleRequest {
    pub direction: String,
    pub action: String,
    pub protocol: String,
    pub port: Option<String>,
    pub from_ip: Option<String>,
    pub to_ip: Option<String>,
    pub comment: Option<String>,
}

pub async fn list_firewall_rules(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(_server_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    require_server_access(&pool, session.operator_id).await?;

    // Stub: returns sensible default rules
    let rules = vec![
        FirewallRule {
            id: "1".into(), direction: "in".into(), action: "allow".into(),
            protocol: "tcp".into(), port: Some("22".into()),
            from_ip: None, to_ip: None,
            comment: Some("SSH".into()), enabled: true,
        },
        FirewallRule {
            id: "2".into(), direction: "in".into(), action: "allow".into(),
            protocol: "tcp".into(), port: Some("80".into()),
            from_ip: None, to_ip: None,
            comment: Some("HTTP".into()), enabled: true,
        },
        FirewallRule {
            id: "3".into(), direction: "in".into(), action: "allow".into(),
            protocol: "tcp".into(), port: Some("443".into()),
            from_ip: None, to_ip: None,
            comment: Some("HTTPS".into()), enabled: true,
        },
        FirewallRule {
            id: "4".into(), direction: "in".into(), action: "deny".into(),
            protocol: "any".into(), port: None,
            from_ip: None, to_ip: None,
            comment: Some("Default deny".into()), enabled: true,
        },
    ];

    Ok(Json(serde_json::json!({ "data": rules })))
}

pub async fn create_firewall_rule(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(_server_id): Path<Uuid>,
    Json(body): Json<CreateFirewallRuleRequest>,
) -> Result<impl IntoResponse, ApiError> {
    require_server_access(&pool, session.operator_id).await?;

    let rule = FirewallRule {
        id: Uuid::new_v4().to_string(),
        direction: body.direction,
        action: body.action,
        protocol: body.protocol,
        port: body.port,
        from_ip: body.from_ip,
        to_ip: body.to_ip,
        comment: body.comment,
        enabled: true,
    };

    Ok((StatusCode::CREATED, Json(rule)))
}

pub async fn delete_firewall_rule(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path((_server_id, _rule_id)): Path<(Uuid, String)>,
) -> Result<impl IntoResponse, ApiError> {
    require_server_access(&pool, session.operator_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn toggle_firewall_rule(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path((_server_id, _rule_id)): Path<(Uuid, String)>,
    Json(body): Json<serde_json::Value>,
) -> Result<impl IntoResponse, ApiError> {
    require_server_access(&pool, session.operator_id).await?;
    let enabled = body.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
    Ok(Json(serde_json::json!({ "enabled": enabled })))
}

// ─── IP ban ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct BannedIp {
    pub ip: String,
    pub reason: String,
    pub banned_at: String,
    pub ban_count: i64,
    pub expires_at: Option<String>,
}

pub async fn list_banned_ips(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(_server_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    require_server_access(&pool, session.operator_id).await?;
    let bans: Vec<BannedIp> = vec![]; // stub — agent fetches from fail2ban
    Ok(Json(serde_json::json!({ "data": bans })))
}

pub async fn unban_ip(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path((_server_id, _ip)): Path<(Uuid, String)>,
) -> Result<impl IntoResponse, ApiError> {
    require_server_access(&pool, session.operator_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

// ─── Packages / system updates ────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct UpgradablePackage {
    pub name: String,
    pub current_version: String,
    pub new_version: String,
    pub size_kb: Option<i64>,
    pub source: String,  // "security" | "updates" | "backports"
}

pub async fn list_upgradable(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(_server_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    require_server_access(&pool, session.operator_id).await?;
    // Stub — agent runs `apt list --upgradable`
    let pkgs: Vec<UpgradablePackage> = vec![];
    Ok(Json(serde_json::json!({ "data": pkgs, "last_checked": null })))
}

#[derive(Debug, Deserialize)]
pub struct ApplyUpdatesRequest {
    pub packages: Option<Vec<String>>, // None = all
    pub security_only: Option<bool>,
}

pub async fn apply_updates(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(_server_id): Path<Uuid>,
    Json(_body): Json<ApplyUpdatesRequest>,
) -> Result<impl IntoResponse, ApiError> {
    require_server_access(&pool, session.operator_id).await?;
    // Stub — agent runs apt-get upgrade
    Ok(Json(serde_json::json!({
        "job_id": Uuid::new_v4(),
        "status": "queued",
        "message": "Update job queued. Agent will apply shortly."
    })))
}

// ─── Process monitor ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ProcessEntry {
    pub pid: i64,
    pub user: String,
    pub cpu_pct: f64,
    pub mem_pct: f64,
    pub mem_rss_kb: i64,
    pub state: String,  // "R" | "S" | "D" | "Z"
    pub command: String,
    pub started_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ProcessQuery {
    pub limit: Option<i64>,
    pub sort: Option<String>,  // "cpu" | "mem" | "pid"
}

pub async fn list_processes(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(_server_id): Path<Uuid>,
    Query(_q): Query<ProcessQuery>,
) -> Result<impl IntoResponse, ApiError> {
    require_server_access(&pool, session.operator_id).await?;
    // Stub — agent runs `ps aux`
    let procs: Vec<ProcessEntry> = vec![];
    Ok(Json(serde_json::json!({ "data": procs })))
}

pub async fn kill_process(
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path((_server_id, _pid)): Path<(Uuid, i64)>,
    Json(body): Json<serde_json::Value>,
) -> Result<impl IntoResponse, ApiError> {
    let op = tundrad_repo::OperatorRepo::new(&pool)
        .find_by_id(session.operator_id)
        .await
        .map_err(ApiError::from)?;
    AuthzService
        .require(&op.role, Action::Update, Resource::Server)
        .map_err(ApiError::from)?;
    let signal = body.get("signal").and_then(|v| v.as_str()).unwrap_or("TERM");
    Ok(Json(serde_json::json!({ "signal": signal, "status": "sent" })))
}

// ─── SSH terminal WebSocket ───────────────────────────────────────────────────

pub async fn terminal_ws(
    ws: WebSocketUpgrade,
    State(pool): State<PgPool>,
    AuthSession(session): AuthSession,
    Path(_server_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    require_server_access(&pool, session.operator_id).await?;
    Ok(ws.on_upgrade(handle_terminal_ws))
}

async fn handle_terminal_ws(mut socket: WebSocket) {
    // Stub terminal: sends a welcome banner, echoes input back.
    // Real implementation: spawn openssh Session → pty channel, bidirectional pipe.
    let banner = "\r\n\x1b[32mTundra SSH terminal — stub mode\x1b[0m\r\n\
                  \x1b[33mReal SSH execution requires agent connection.\x1b[0m\r\n\
                  Type anything and it will be echoed back.\r\n\r\n$ ";
    let _ = socket.send(Message::Text(banner.to_owned().into())).await;

    while let Some(Ok(msg)) = socket.recv().await {
        match msg {
            Message::Text(data) => {
                // Echo the input back with a fake prompt
                let response = format!("{data}\r\n$ ");
                if socket.send(Message::Text(response.into())).await.is_err() {
                    break;
                }
            }
            Message::Binary(data) => {
                // xterm sends binary resize messages
                let _ = socket.send(Message::Binary(data)).await;
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
}
