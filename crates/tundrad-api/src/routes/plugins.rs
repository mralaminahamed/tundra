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

#[derive(sqlx::FromRow)]
struct PluginRow {
    id: Uuid,
    plugin_id: String,
    version: String,
    manifest: serde_json::Value,
    source: String,
    state: String,
    enabled_at: Option<time::OffsetDateTime>,
    signature_verified: bool,
    created_at: time::OffsetDateTime,
}

#[derive(Deserialize)]
pub struct InstallPluginRequest {
    pub plugin_id: String,
    pub version: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub tier: String,
    pub kind: String,
    pub homepage: Option<String>,
    pub capabilities: Option<Vec<String>>,
    pub download_url: Option<String>,
    pub official: bool,
}

// ── Official plugin catalog ────────────────────────────────────────────────────
// Served when the plugin_registry_entries table is empty or as a fallback.
fn official_catalog() -> Vec<serde_json::Value> {
    vec![
        // ── Core plugins (statically linked, native Rust) ─────────────────────
        serde_json::json!({
            "plugin_id": "com.tundra.plesk-migration",
            "name": "Plesk Obsidian Migration",
            "description": "Migrate sites, mailboxes, databases, and DNS records from Plesk Obsidian 18.0.70+ to Tundra with zero downtime.",
            "author": "Tundra Core Team",
            "version": "1.0.0",
            "tier": "core",
            "kind": "native",
            "official": true,
            "homepage": "https://github.com/mralaminahamed/tundra",
            "capabilities": ["sites:read", "sites:write", "dns:write", "mail:write", "databases:write"],
            "download_url": null,
            "signature_verified": true
        }),
        serde_json::json!({
            "plugin_id": "com.tundra.namecheap",
            "name": "Namecheap",
            "description": "Connect your Namecheap account to manage domains, DNS records, registrations, and auto-renewal. Supports ACME DNS-01 challenges.",
            "author": "Tundra Core Team",
            "version": "1.0.0",
            "tier": "core",
            "kind": "native",
            "official": true,
            "homepage": "https://github.com/mralaminahamed/tundra",
            "capabilities": ["dns:read", "dns:write", "http:fetch"],
            "download_url": null,
            "signature_verified": true
        }),
        serde_json::json!({
            "plugin_id": "com.tundra.github",
            "name": "GitHub",
            "description": "Deploy repositories via GitHub App. Supports push/PR webhooks, deployment status callbacks, PR preview environments, and secrets from GitHub.",
            "author": "Tundra Core Team",
            "version": "1.0.0",
            "tier": "core",
            "kind": "native",
            "official": true,
            "homepage": "https://github.com/mralaminahamed/tundra",
            "capabilities": ["sites:deploy", "http:fetch", "secrets:read"],
            "download_url": null,
            "signature_verified": true
        }),
        serde_json::json!({
            "plugin_id": "com.tundra.mcp-server",
            "name": "MCP Server (AI Agent Integration)",
            "description": "Expose Tundra to AI agents via the Model Context Protocol. Connect Claude, Cursor, or any MCP-compatible client to manage servers and sites.",
            "author": "Tundra Core Team",
            "version": "1.0.0",
            "tier": "core",
            "kind": "native",
            "official": true,
            "homepage": "https://github.com/mralaminahamed/tundra",
            "capabilities": ["servers:read", "sites:read", "sites:deploy", "dns:read"],
            "download_url": null,
            "signature_verified": true
        }),
        serde_json::json!({
            "plugin_id": "com.tundra.wordpress",
            "name": "WordPress",
            "description": "Manage WordPress and WooCommerce installations: install, configure plugins/themes, and cleanly remove sites. Includes WP and WooCommerce site templates.",
            "author": "Tundra Core Team",
            "version": "1.0.0",
            "tier": "core",
            "kind": "native",
            "official": true,
            "homepage": "https://github.com/mralaminahamed/tundra",
            "capabilities": ["sites:read", "sites:write", "http:fetch"],
            "download_url": null,
            "signature_verified": true
        }),
        // ── Bundled plugins (dynamically loaded, native Rust) ─────────────────
        serde_json::json!({
            "plugin_id": "com.tundra.cloudflare-dns",
            "name": "Cloudflare DNS Provider",
            "description": "DNS provider integration for Cloudflare. Manage zones, records, and ACME DNS-01 challenges through the Cloudflare API.",
            "author": "Tundra Core Team",
            "version": "1.0.0",
            "tier": "bundled",
            "kind": "native",
            "official": true,
            "homepage": "https://github.com/mralaminahamed/tundra",
            "capabilities": ["dns:read", "dns:write", "http:fetch"],
            "download_url": null,
            "signature_verified": true
        }),
        serde_json::json!({
            "plugin_id": "com.tundra.mailgun",
            "name": "Mailgun Smarthost Relay",
            "description": "Route outbound email through Mailgun's SMTP relay. Supports per-domain sender configuration and delivery analytics.",
            "author": "Tundra Core Team",
            "version": "1.0.0",
            "tier": "bundled",
            "kind": "native",
            "official": true,
            "homepage": "https://github.com/mralaminahamed/tundra",
            "capabilities": ["mail:send", "http:fetch", "secrets:read"],
            "download_url": null,
            "signature_verified": true
        }),
        serde_json::json!({
            "plugin_id": "com.tundra.slack-alerts",
            "name": "Slack Alerts",
            "description": "Route Tundra alerts and deployment notifications to Slack channels. Supports per-server and per-site routing rules.",
            "author": "Tundra Core Team",
            "version": "1.0.0",
            "tier": "bundled",
            "kind": "native",
            "official": true,
            "homepage": "https://github.com/mralaminahamed/tundra",
            "capabilities": ["alerts:read", "http:fetch"],
            "download_url": null,
            "signature_verified": true
        }),
        serde_json::json!({
            "plugin_id": "com.tundra.discord-alerts",
            "name": "Discord Alerts",
            "description": "Route Tundra alerts and deployment notifications to Discord channels via webhooks. Supports per-server and per-site routing rules.",
            "author": "Tundra Core Team",
            "version": "1.0.0",
            "tier": "bundled",
            "kind": "native",
            "official": true,
            "homepage": "https://github.com/mralaminahamed/tundra",
            "capabilities": ["alerts:read", "http:fetch"],
            "download_url": null,
            "signature_verified": true
        }),
        serde_json::json!({
            "plugin_id": "com.tundra.s3-backup",
            "name": "S3-Compatible Backup",
            "description": "Store backups in any S3-compatible bucket (AWS S3, Wasabi, Backblaze B2, Cloudflare R2). Supports lifecycle rules and encryption.",
            "author": "Tundra Core Team",
            "version": "1.0.0",
            "tier": "bundled",
            "kind": "native",
            "official": true,
            "homepage": "https://github.com/mralaminahamed/tundra",
            "capabilities": ["backups:read", "backups:write", "http:fetch", "secrets:read"],
            "download_url": null,
            "signature_verified": true
        }),
    ]
}

// GET /api/v1/plugins — list installed plugins
pub async fn list_plugins(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
) -> Result<impl IntoResponse, ApiError> {
    let rows = sqlx::query_as::<_, PluginRow>(
        "SELECT id, plugin_id, version, manifest, source, state, \
         enabled_at, signature_verified, created_at \
         FROM plugins ORDER BY created_at DESC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "db");
        ApiError::internal()
    })?;

    let plugins: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.id,
                "plugin_id": r.plugin_id,
                "version": r.version,
                "manifest": r.manifest,
                "source": r.source,
                "state": r.state,
                "enabled_at": r.enabled_at,
                "signature_verified": r.signature_verified,
                "created_at": r.created_at,
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "data": plugins })))
}

// GET /api/v1/plugins/available — list registry catalog with installed flag
pub async fn list_available(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
) -> Result<impl IntoResponse, ApiError> {
    // Fetch installed plugin_ids for cross-referencing
    let installed: Vec<String> = sqlx::query_scalar("SELECT plugin_id FROM plugins")
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "db");
            ApiError::internal()
        })?;

    // Fetch registry entries from DB (populated by background sync)
    let registry_rows: Vec<(String, String, String, String, String, bool, String)> =
        sqlx::query_as(
            "SELECT plugin_id, name, description, latest_version, tier, official, \
         COALESCE(raw->>'kind', 'wasm') \
         FROM plugin_registry_entries ORDER BY official DESC, name ASC",
        )
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

    // Merge DB entries with official catalog (official catalog takes precedence)
    let mut catalog = official_catalog();

    // Add any DB-only entries not already in catalog
    let catalog_ids: std::collections::HashSet<String> = catalog
        .iter()
        .filter_map(|e| e["plugin_id"].as_str().map(String::from))
        .collect();

    for (pid, name, description, version, tier, official, kind) in &registry_rows {
        if !catalog_ids.contains(pid) {
            catalog.push(serde_json::json!({
                "plugin_id": pid,
                "name": name,
                "description": description,
                "author": if *official { "Tundra Core Team" } else { "Community" },
                "version": version,
                "tier": tier,
                "kind": kind,
                "official": official,
                "homepage": null,
                "capabilities": [],
                "download_url": null,
                "signature_verified": *official,
            }));
        }
    }

    // Annotate with installed status
    let result: Vec<serde_json::Value> = catalog
        .into_iter()
        .map(|mut entry| {
            let pid = entry["plugin_id"].as_str().unwrap_or("").to_string();
            entry["installed"] = serde_json::Value::Bool(installed.contains(&pid));
            entry
        })
        .collect();

    Ok(Json(serde_json::json!({ "data": result })))
}

// POST /api/v1/plugins/install — install a plugin from the catalog
pub async fn install_plugin(
    AuthSession(session): AuthSession,
    State(pool): State<PgPool>,
    Json(body): Json<InstallPluginRequest>,
) -> Result<impl IntoResponse, ApiError> {
    // Check not already installed
    let exists: Option<String> =
        sqlx::query_scalar("SELECT plugin_id FROM plugins WHERE plugin_id = $1")
            .bind(&body.plugin_id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "db");
                ApiError::internal()
            })?;

    if exists.is_some() {
        return Err(ApiError::bad_request("plugin already installed"));
    }

    let manifest = serde_json::json!({
        "name": body.name,
        "description": body.description,
        "author": body.author,
        "homepage": body.homepage,
        "capabilities": body.capabilities.unwrap_or_default(),
    });

    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO plugins \
         (plugin_id, version, manifest, install_path, source, state, signature_verified, installed_by) \
         VALUES ($1, $2, $3, $4, 'registry', 'installed', $5, $6) \
         RETURNING id",
    )
    .bind(&body.plugin_id)
    .bind(&body.version)
    .bind(&manifest)
    .bind(format!("/var/lib/tundra/plugins/{}", body.plugin_id))
    .bind(body.official)
    .bind(session.operator_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "install plugin");
        ApiError::internal()
    })?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "id": id,
            "plugin_id": body.plugin_id,
            "state": "installed",
        })),
    ))
}

// GET /api/v1/plugins/:id
pub async fn get_plugin(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    let row = sqlx::query_as::<_, PluginRow>(
        "SELECT id, plugin_id, version, manifest, source, state, \
         enabled_at, signature_verified, created_at \
         FROM plugins WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "db");
        ApiError::internal()
    })?;

    match row {
        Some(r) => Ok(Json(serde_json::json!({
            "id": r.id,
            "plugin_id": r.plugin_id,
            "version": r.version,
            "manifest": r.manifest,
            "source": r.source,
            "state": r.state,
            "enabled_at": r.enabled_at,
            "signature_verified": r.signature_verified,
            "created_at": r.created_at,
        }))
        .into_response()),
        None => Err(ApiError::not_found("plugin")),
    }
}

// POST /api/v1/plugins/:id/enable
pub async fn enable_plugin(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    sqlx::query("UPDATE plugins SET state = 'enabled', enabled_at = now() WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "db");
            ApiError::internal()
        })?;
    Ok(StatusCode::NO_CONTENT)
}

// POST /api/v1/plugins/:id/disable
pub async fn disable_plugin(
    AuthSession(_session): AuthSession,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    sqlx::query("UPDATE plugins SET state = 'disabled', disabled_at = now() WHERE id = $1")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "db");
            ApiError::internal()
        })?;
    Ok(StatusCode::NO_CONTENT)
}
