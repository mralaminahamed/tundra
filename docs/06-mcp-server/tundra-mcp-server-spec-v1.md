# Tundra — MCP Server Specification

> The Model Context Protocol server bundled with Tundra. Architecture, transport behaviour, complete tool catalog with JSON Schemas, scope and session model, schema, audit, and security.

---

**Author:** Al Amin Ahamed
**GitHub:** [@mralaminahamed](https://github.com/mralaminahamed)
**X:** [@mralaminahamed](https://x.com/mralaminahamed)

**Document Version:** v1.0
**Document Date:** May 2026
**Status:** Implementation-Ready Specification
**Plugin ID:** `com.tundra.mcp-server`
**Audience:** Engineering — Plugin author, reviewers, integrators implementing AI-agent flows against Tundra

**Supersedes / extracts from:** `tundra-additional-core-plugins-v1.md` §4. The MCP coverage previously bundled with the additional-plugins document has been moved here in full and expanded; the additional-plugins document now references this one.

---

## 1. Purpose

The MCP server exposes Tundra's capabilities to AI agents that speak the **Model Context Protocol** — Claude Desktop, Claude Code, Cursor, Zed, and any cloud agent that supports the MCP 2025-03-26 Streamable HTTP transport. It does so without granting AI agents any privilege the operator hasn't explicitly delegated, and without bypassing any of the controls (RBAC, audit, validation, rate limits) that apply to operator-mediated actions on the panel.

This document is the engineering reference: the architecture, the wire-level behaviour, the complete tool/resource/prompt catalog with JSON Schemas, the scope and session model, the schema, the audit pipeline, and the security and performance posture.

Two companion documents accompany this one:

- **`tundra-mcp-server-operator-v1.md`** — operator-facing guide for running Tundra MCP day-to-day.
- **`tundra-mcp-server-cookbook-v1.md`** — worked integration examples for Claude Desktop, Claude Code, Cursor, Zed, plus end-to-end "deploy via Claude" walkthroughs.

---

## 2. Identity & Lifecycle

### 2.1 Plugin manifest

```toml
id                 = "com.tundra.mcp-server"
name               = "MCP Server (AI Agent Integration)"
version            = "1.0.0"
author             = "Al Amin Ahamed"
license            = "Apache-2.0"
tier               = "core"
kind               = "native"
official           = true
tundra_min_version = "1.0.0"
description        = """
Expose Tundra capabilities to AI agents via the Model Context Protocol.
Supports both local stdio (for Claude Desktop, Claude Code, Cursor, Zed)
and remote Streamable HTTP (for cloud agents). Per-token role-based scopes
and per-session write toggles let operators control exactly what AI agents
can see and do.
"""
```

### 2.2 Lifecycle

The MCP server is a **first-party core plugin**. It ships with Tundra, is signed by the Tundra release key, and is installed but **disabled** on a fresh Tundra install. No AI agent has access until the operator explicitly enables the plugin and creates a token.

States: `installed` → `enabled` → (`degraded` | `disabled`).

Enabling the plugin adds two routes (`POST /mcp`, `GET /mcp`) to the panel router, registers a CLI subcommand (`tundra mcp ...`), and surfaces the **Settings → AI Agents (MCP)** page in the panel UI. Disabling removes the routes, terminates active sessions, and hides the UI page (tokens persist; they're inert until re-enabled).

### 2.3 Versioning

The plugin tracks two version dimensions:

- **MCP protocol version.** The wire protocol is identified by date string (`2025-03-26`). The server advertises one as `protocolVersion` in the `initialize` response. v1.0 of the plugin implements `2025-03-26`. Older clients that send `2024-11-05` are accepted with a deprecation warning surfaced to the operator's audit log.
- **Plugin version.** Plugin SemVer; bumped per release. Independent of Tundra's own version. Plugin manifest declares `tundra_min_version` for compatibility checks.

A future protocol version (`2025-XX-XX` etc.) will be supported behind a feature flag, with a transition window where both are speakable.

---

## 3. Architecture

### 3.1 Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│  AI agents                                                          │
│  Claude Desktop  Claude Code  Cursor  Zed  cloud agents             │
└────────────────┬────────────────────────────┬───────────────────────┘
                 │                            │
       stdio (subprocess)              HTTPS (Bearer mcp:* token)
                 │                            │
                 ▼                            ▼
┌──────────────────────────────┐  ┌──────────────────────────────────┐
│  tundra mcp serve --stdio    │  │  POST /mcp     GET /mcp (SSE)    │
│  one-shot subprocess of      │  │  inside tundrad, served by the   │
│  the agent host              │  │  MCP plugin route handler        │
└──────────────┬───────────────┘  └──────────────┬───────────────────┘
               │                                 │
               └──────────────┬──────────────────┘
                              ▼
              ┌─────────────────────────────┐
              │  MCP server core            │
              │  ─ session manager          │
              │  ─ scope/mode resolver      │
              │  ─ tool registry            │
              │  ─ resource registry        │
              │  ─ prompt registry          │
              │  ─ rate limiter             │
              │  ─ audit emitter            │
              └──────────────┬──────────────┘
                             │
                             ▼
              ┌─────────────────────────────┐
              │  Internal Tundra API client │
              │  (in-process, same crate)   │
              └──────────────┬──────────────┘
                             │
                             ▼
              ┌─────────────────────────────┐
              │  Tundra REST + gRPC + DB    │
              │  (RBAC, audit, validation)  │
              └─────────────────────────────┘
```

The MCP layer is a **translator**, not a privileged shortcut. Every tool invocation lowers to a normal Tundra API call inside the same process. This means RBAC, validation, rate limits, audit, and idempotency all apply identically whether the action originated from a panel button click, a CLI command, or an MCP tool call.

### 3.2 Why in-process

The decision to embed the MCP server inside `tundrad` rather than running it as a separate process is deliberate:

- **One source of truth for authorization.** Every tool invocation hits the same `Authz::require(actor, action, resource)` check that handler functions use.
- **Atomic audit.** Tool invocation, action, and audit row land in the same transaction. There is no window where an action succeeded but its audit row didn't.
- **No serialization overhead.** Tool calls reach the API surface via direct function call.
- **Tighter rate limiting.** The same rate limiter governs panel API calls and MCP tool calls, so a runaway agent can't starve operator activity.

The stdio transport is the exception: `tundra mcp serve --stdio` is a subprocess that connects back to `tundrad` over the standard HTTPS API. It exists for desktop AI agents that launch MCP servers as child processes and assume they can speak directly to that process. From the AI agent's perspective the stdio server *is* the MCP server; from Tundra's perspective it's an authenticated API client that translates JSON-RPC into REST calls.

### 3.3 Code layout

```
crates/
├── tundrad-plugin-mcp/
│   ├── src/
│   │   ├── lib.rs                  # plugin entry point
│   │   ├── server/
│   │   │   ├── mod.rs              # MCP protocol state machine
│   │   │   ├── http.rs             # Streamable HTTP transport
│   │   │   ├── stdio.rs            # stdio transport (CLI side)
│   │   │   └── jsonrpc.rs          # JSON-RPC framing + types
│   │   ├── session.rs              # session lifecycle + state
│   │   ├── scope.rs                # token + session scope resolution
│   │   ├── tools/                  # one file per tool family
│   │   │   ├── read.rs
│   │   │   ├── write_safe.rs
│   │   │   ├── write.rs
│   │   │   └── admin.rs
│   │   ├── resources.rs            # tundra:// URI resolver
│   │   ├── prompts.rs              # prompt catalog
│   │   ├── audit.rs                # audit emitter
│   │   ├── ratelimit.rs            # per-session token-bucket
│   │   └── schema.rs               # JSON Schema generation from API DTOs
│   ├── tests/
│   │   ├── transport_http.rs
│   │   ├── transport_stdio.rs
│   │   ├── tools_read.rs
│   │   ├── tools_write.rs
│   │   ├── scope_enforcement.rs
│   │   └── session_lifecycle.rs
│   └── Cargo.toml
```

The CLI subprocess for stdio is in `crates/tundra-cli/src/mcp/`; it imports `tundrad-plugin-mcp` for the protocol types and tool descriptors but uses a thin HTTPS client to actually execute the work.

---

## 4. Transports

The plugin supports two transports concurrently. Both speak MCP `2025-03-26`.

### 4.1 Local stdio

**Trigger.** `tundra mcp serve --stdio [--readonly]` launched as a subprocess by an MCP-aware host (Claude Desktop, Claude Code, Cursor, Zed).

**Wire format.** Newline-delimited JSON-RPC 2.0 over stdin/stdout. stderr carries server-side log output (which the host typically surfaces in a debug pane).

**Authentication.** The `TUNDRA_API_TOKEN` environment variable carries an MCP token (see §5). The token is read once at startup; if missing, the server emits a `failed-precondition` error and exits.

**Connection model.** One stdio process per host invocation. The host launches the subprocess, sends `initialize`, exchanges JSON-RPC messages, sends `shutdown`, and closes stdin. The subprocess exits.

**Lifecycle on the panel side.** The subprocess connects back to `tundrad` over HTTPS using the supplied token, opens a session row in `plugin_mcp_sessions` with `transport='stdio'`, and tears it down on stdin EOF or `shutdown` notification.

### 4.2 Remote Streamable HTTP

**Endpoints.**

```
POST   /mcp                  Bearer mcp:* token, application/json body, JSON-RPC request
GET    /mcp                  Bearer mcp:* token, opens a Server-Sent Events stream
DELETE /mcp/sessions/:id     Bearer mcp:* token, closes the named session
```

**Wire format.** JSON-RPC 2.0 carried in the POST body for client-to-server messages. Server-to-client messages (notifications and streaming responses) flow over the SSE channel opened by GET. This is the **MCP 2025-03-26 Streamable HTTP transport** — single endpoint, both POST and GET, with SSE upgrade for server-to-client. The deprecated SSE-only transport from 2024-11-05 is **not** offered.

**Authentication.** `Authorization: Bearer <token>` on every POST and on the initial GET. Tokens are MCP-scoped (`mcp:*`); see §5.

**Session correlation.** Every request after `initialize` carries a `Mcp-Session-Id` header (echoed by the server in the `initialize` response). The session ID is the `plugin_mcp_sessions.public_id` UUIDv7; the session row carries `transport='http'`, the remote IP, and the client's `clientInfo`.

**DNS rebinding protection.** Per MCP guidance, the server validates the `Origin` header on every HTTP connection. Origins not on the configured allowlist (default: same as the panel's `public_url`) are rejected with `403 origin-not-allowed`. Single-server installs that bind only to `127.0.0.1` add `http://127.0.0.1` and `http://localhost` to the allowlist automatically.

**Streaming long operations.** Tools that produce streamed output (deploy progress, log tailing, metric series) write their output as SSE events on the GET stream. The agent correlates streamed events to the originating tool call by the `request_id` field, which mirrors the original JSON-RPC request `id`.

**Rate limit headers.** The HTTP transport returns `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` on every response, with a 429 response when the per-session window is exhausted.

### 4.3 OAuth 2.1 (planned, v1.1)

The MCP 2025-XX-XX authorization spec (OAuth 2.1 device-flow with PKCE) is **planned for v1.1**. v1.0 ships with bearer tokens only because:

1. Bearer tokens are operator-controlled at the moment of issue (scope, TTL, IP, max-uses).
2. OAuth 2.1 device flow without operator-side per-token controls would expand the trust surface beyond what's currently auditable.

The roadmap enables OAuth 2.1 alongside bearer tokens once the per-token controls have been mapped onto OAuth scopes; it doesn't replace bearer tokens.

---

## 5. Scope & Session Model

The control surface for AI access is two-layered: the **token scope** sets a ceiling, the **session mode** sets the actual exposure within that ceiling.

### 5.1 Token scopes

Tokens are minted by the operator with explicit scope. MCP scopes are distinct from the general Tundra API token scopes; an MCP token cannot authenticate against `/api/v1/*`, and a generic API token cannot authenticate against `/mcp` or stdio.

| Scope            | Grants                                                                                                                                              |
|------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
| `mcp:read`       | Read-only: list resources, read logs, view metrics, browse audit log                                                                                |
| `mcp:write:safe` | Read + safe writes: restart a service, clear a cache, retry a failed job. **No site/server/database creation, no deletion, no credential changes.** |
| `mcp:write`      | Read + safe writes + mutations: create sites, deploy code, modify environment variables, trigger backups                                            |
| `mcp:admin`      | All of the above plus operator-level mutations: invite operators, change permissions, modify global configuration                                   |

Tokens are mintable only by an operator with the `Owner` or `Admin` role, and the token's scope cannot exceed the issuing operator's role's permissions. (An `Admin` cannot mint an `mcp:admin` token because some `mcp:admin` operations require `Owner` role at the panel.)

### 5.2 Session modes

Even with an `mcp:write` token, the operator chooses **at session start** whether write operations are exposed. The choice is made per session, not per token, so a single token can be used in different modes by different agent instances.

For **stdio**, the mode is set at subprocess launch: `tundra mcp serve --stdio` (write mode) vs `tundra mcp serve --stdio --readonly` (read mode).

For **HTTP**, the mode is sent on `initialize` as a header: `X-Tundra-Mode: read` or `X-Tundra-Mode: write`. Default is `read`. Mode changes mid-session require closing and reopening the session.

The session mode determines which tools are advertised in the `tools/list` response. An agent in a `read`-mode session **cannot see** the write tools — they're not in the advertised catalog. This is stronger than refusing the calls: the agent isn't aware they exist, and won't construct calls to them.

### 5.3 Effective tool set

```
effective_tools(token, session) =
  intersect(
    tools_for(token.scopes),
    tools_for(session.mode_ceiling)
  )
```

| Token scope      | Session `read` | Session `write`                 |
|------------------|----------------|---------------------------------|
| `mcp:read`       | read tools     | read tools                      |
| `mcp:write:safe` | read tools     | read + safe-write tools         |
| `mcp:write`      | read tools     | read + safe-write + write tools |
| `mcp:admin`      | read tools     | all tools                       |

A read-mode session always surfaces only read tools, regardless of token scope.

### 5.4 Mid-session mode change (HTTP)

On HTTP, an operator can downgrade a session from write to read mid-flight from the panel's MCP page. The server emits `notifications/tools/list_changed`; the agent re-queries `tools/list` and sees the smaller catalog. Upgrading from read to write is **not allowed** mid-session; the operator must instruct the agent to start a new session.

### 5.5 Token controls

Each token has, beyond its scope:

- **`expires_at`** — required, max 90 days from issue.
- **`max_uses`** — optional invocation cap; the session start is one use, each tool call is another.
- **`restrict_ip`** — optional CIDR; HTTP connections from outside the CIDR are rejected.
- **`allowed_clients`** — optional allowlist of `clientInfo.name` values (`["claude-desktop", "cursor"]`); useful for clamping a token to one specific tool.

---

## 6. Initialization Handshake

### 6.1 `initialize` request

```jsonc
// → POST /mcp (or stdio stdin)
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-03-26",
    "capabilities": {
      "roots": { "listChanged": true },
      "sampling": {}
    },
    "clientInfo": {
      "name": "claude-desktop",
      "version": "1.4.2"
    }
  }
}
```

### 6.2 `initialize` response

```jsonc
// ← server response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-03-26",
    "serverInfo": {
      "name": "tundra-mcp",
      "version": "1.0.0",
      "vendor": "Tundra (Al Amin Ahamed)"
    },
    "capabilities": {
      "tools":     { "listChanged": true },
      "resources": { "listChanged": true, "subscribe": true },
      "prompts":   { "listChanged": false },
      "logging":   {}
    },
    "instructions": "This is the Tundra MCP server. Tools are scoped by the API token's MCP scopes and the session mode. List tools with tools/list; resources with resources/list. The full catalog is documented at https://mralaminahamed.github.io/tundra/mcp/."
  }
}
```

The `instructions` string is shown to the user by some agents and is intentionally short. The full catalog with JSON Schemas is fetched via `tools/list` (see §7).

### 6.3 `notifications/initialized`

After receiving the `initialize` response, the client sends `notifications/initialized` (no `id`). Once the server processes it, the session row is committed with `started_at = now()` and tool calls become legal.

---

## 7. Tool Catalog

Tools are grouped by required scope. Each tool's input schema is JSON Schema generated from the corresponding internal API DTO — there is no manually-maintained schema layer that can drift from the API.

This section enumerates every v1.0 tool with a representative schema. The full machine-readable catalog is the live `tools/list` response from a connected server; this document is the human reference.

### 7.1 Read tools (token scope: `mcp:read` or higher; session mode: any)

#### `list_servers`

Returns all Tundra-managed servers with status, hostname, and capabilities summary.

**Input schema.**

```json
{
  "type": "object",
  "properties": {
    "status_filter": {
      "type": "string",
      "enum": ["any", "active", "degraded", "offline"],
      "default": "any"
    }
  },
  "additionalProperties": false
}
```

**Output schema (truncated).**

```json
{
  "type": "object",
  "properties": {
    "servers": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id":        { "type": "string", "format": "uuid" },
          "hostname":  { "type": "string" },
          "status":    { "type": "string" },
          "agent_last_seen_at": { "type": "string", "format": "date-time" },
          "capabilities": { "type": "object" }
        },
        "required": ["id", "hostname", "status"]
      }
    }
  }
}
```

#### `list_sites`

Filterable by server, application type, status. Returns site IDs, primary domains, and current release info.

**Input schema.**

```json
{
  "type": "object",
  "properties": {
    "server_id":        { "type": "string", "format": "uuid" },
    "application_type": { "type": "string", "enum": ["static", "php", "laravel", "nodejs", "python", "go", "rust", "ruby", "docker"] },
    "status":           { "type": "string", "enum": ["active", "provisioning", "suspended", "failed"] },
    "limit":            { "type": "integer", "minimum": 1, "maximum": 200, "default": 50 },
    "cursor":           { "type": "string" }
  },
  "additionalProperties": false
}
```

#### `get_site`

Full site detail including domain, application, recent deployments, environment variable **keys** (values never returned), TLS expiry, health.

**Input.** `site_id` (UUID) — required.

#### `tail_logs`

Stream the last N lines of a site's combined application + nginx logs. Output is delivered as SSE on the HTTP transport, and as a sequence of progress notifications on stdio.

**Input.**

```json
{
  "type": "object",
  "properties": {
    "site_id":    { "type": "string", "format": "uuid" },
    "lines":      { "type": "integer", "minimum": 1, "maximum": 5000, "default": 200 },
    "follow":     { "type": "boolean", "default": false },
    "level":      { "type": "string", "enum": ["debug", "info", "warn", "error"] }
  },
  "required": ["site_id"]
}
```

#### `get_metrics`

Per-server or per-site metrics for a time window.

**Input.**

```json
{
  "type": "object",
  "properties": {
    "scope":    { "type": "string", "enum": ["server", "site"] },
    "scope_id": { "type": "string", "format": "uuid" },
    "metric":   { "type": "string", "enum": ["cpu_pct", "mem_pct", "disk_pct", "net_in_bps", "net_out_bps", "rps", "latency_p95_ms"] },
    "since":    { "type": "string", "format": "date-time" },
    "until":    { "type": "string", "format": "date-time" },
    "step_s":   { "type": "integer", "minimum": 10, "maximum": 3600, "default": 60 }
  },
  "required": ["scope", "scope_id", "metric"]
}
```

#### `list_databases`

All Tundra-managed databases with connection details. Credentials are **never** returned; the schema returns the host, port, database name, and a hint about which application owns the database.

#### `list_certificates`

All certificates with subject, SAN, issuer, `not_after`, auto-renew flag.

#### `get_audit_log`

Recent entries from the Tundra `audit_log` table with filtering on actor, resource, action, time range.

**Input.**

```json
{
  "type": "object",
  "properties": {
    "actor_id":      { "type": "string", "format": "uuid" },
    "actor_kind":    { "type": "string", "enum": ["operator", "mcp", "plugin", "system"] },
    "resource":      { "type": "string", "description": "Filter by resource path, e.g. 'site:01H...' for a specific site" },
    "action":        { "type": "string", "description": "Action prefix, e.g. 'site.deploy.*'" },
    "since":         { "type": "string", "format": "date-time" },
    "until":         { "type": "string", "format": "date-time" },
    "limit":         { "type": "integer", "minimum": 1, "maximum": 500, "default": 100 }
  },
  "additionalProperties": false
}
```

#### `get_deployment_status`

Status of a specific deployment, with the build log if requested.

#### `search`

Full-text search across sites, domains, deployments, and audit log entries (subject to RBAC scope of the issuing operator).

### 7.2 Safe-write tools (token scope: `mcp:write:safe` or higher; session mode: `write`)

#### `restart_service`

Restart a managed service on a server (PHP-FPM pool, daemon, etc.).

**Input.**

```json
{
  "type": "object",
  "properties": {
    "server_id":   { "type": "string", "format": "uuid" },
    "service":     { "type": "string", "description": "Service name as known to the agent" },
    "graceful":    { "type": "boolean", "default": true }
  },
  "required": ["server_id", "service"]
}
```

#### `clear_cache`

Clear application cache for a site.

#### `retry_failed_job`

Retry a failed background job by job ID.

#### `renew_certificate`

Trigger ACME renewal for a certificate.

#### `run_health_check`

Trigger an immediate health check on a site; returns the health probe result.

### 7.3 Write tools (token scope: `mcp:write` or higher; session mode: `write`)

#### `create_site`

Create a new site.

**Input.**

```json
{
  "type": "object",
  "properties": {
    "server_id":         { "type": "string", "format": "uuid" },
    "domain":            { "type": "string", "format": "hostname" },
    "application_type":  { "type": "string", "enum": ["static", "php", "laravel", "nodejs", "python", "go", "rust", "ruby", "docker"] },
    "runtime_version":   { "type": "string" },
    "repository_url":    { "type": "string", "format": "uri" },
    "repository_branch": { "type": "string", "default": "main" },
    "build_command":     { "type": "string" },
    "start_command":     { "type": "string" },
    "auto_deploy":       { "type": "boolean", "default": false }
  },
  "required": ["server_id", "domain", "application_type", "runtime_version"]
}
```

#### `deploy_site`

Trigger a deployment.

**Input.**

```json
{
  "type": "object",
  "properties": {
    "site_id": { "type": "string", "format": "uuid" },
    "ref":     { "type": "string", "description": "Git ref (branch, tag, commit SHA). Defaults to repository's main branch." },
    "wait":    { "type": "boolean", "default": false, "description": "If true, the tool blocks until the deploy reaches a terminal state and streams progress." }
  },
  "required": ["site_id"]
}
```

When `wait=true` on the HTTP transport, deploy progress (build log, stage transitions, final status) is streamed as SSE events on the GET stream.

#### `set_environment_variable`

Add or update an environment variable for a site.

**Input.**

```json
{
  "type": "object",
  "properties": {
    "site_id":   { "type": "string", "format": "uuid" },
    "key":       { "type": "string", "pattern": "^[A-Z_][A-Z0-9_]*$", "minLength": 1, "maxLength": 256 },
    "value":     { "type": "string", "maxLength": 32768 },
    "is_secret": { "type": "boolean", "default": true }
  },
  "required": ["site_id", "key", "value"]
}
```

The value is encrypted at rest with AES-256-GCM under the master-key-derived data key. The MCP tool invocation log stores the value as `<redacted:N-bytes>` regardless of `is_secret`.

#### `delete_environment_variable`

Remove an environment variable.

#### `create_database`

Create a managed database on a database server.

#### `run_backup`

Run a backup job by job ID.

#### `restore_backup`

Restore a snapshot. Subject to confirmation: the tool returns a preview by default and only commits when called with `confirm=true` and the explicit `confirmation_token` returned by the preview.

**Input.**

```json
{
  "type": "object",
  "properties": {
    "snapshot_id":         { "type": "string", "format": "uuid" },
    "target_kind":         { "type": "string", "enum": ["original", "alternative"] },
    "target_path":         { "type": "string" },
    "confirm":             { "type": "boolean", "default": false },
    "confirmation_token":  { "type": "string" }
  },
  "required": ["snapshot_id", "target_kind"]
}
```

#### `update_dns_record`

Modify a DNS record.

### 7.4 Admin tools (token scope: `mcp:admin`; session mode: `write`)

Admin tools are subject to the **step-up authentication** requirement defined in `tundra-security-audit-v1.md` §6: the issuing operator must have completed full authentication within the last 5 minutes. If they haven't, the tool returns `unauthenticated:step-up-required` with the URL to perform step-up; the agent is expected to surface that URL to the operator.

#### `delete_site`

Delete a site. Destructive; requires `confirm=true` and a `confirmation_token` returned by a preceding `dry_run`.

#### `delete_database`

Delete a database. Same destructive guard.

#### `invite_operator`

Send an operator invitation.

**Input.**

```json
{
  "type": "object",
  "properties": {
    "email":      { "type": "string", "format": "email" },
    "role":       { "type": "string", "enum": ["admin", "operator", "readonly"] },
    "expires_in": { "type": "string", "default": "7d", "description": "Invitation TTL in human-friendly form (e.g. '7d', '24h')" }
  },
  "required": ["email", "role"]
}
```

Note: `mcp:admin` scope cannot mint another `Owner`; that's reserved to the Owner role itself, accessible only from the panel.

#### `update_operator_role`

Change an operator's role.

#### `revoke_session`

Forcibly end an operator session.

### 7.5 Tool result envelope

Every tool response shares a standard shape on top of MCP's content blocks:

```jsonc
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Site `acceptance.example.com` deployed successfully. Release id `rls_01H...`. Build duration 41s."
      },
      {
        "type": "resource",
        "resource": {
          "uri": "tundra://sites/01H8XK0SITE.../deployments/01H8YN0DEP.../log",
          "name": "Build log",
          "mimeType": "text/plain"
        }
      }
    ],
    "isError": false,
    "_meta": {
      "tundra": {
        "request_id":   "req_01H8YN...",
        "audit_id":     "aud_01H8YN...",
        "scope_used":   "mcp:write",
        "duration_ms":  41284,
        "rate_limit": { "remaining": 58, "reset_in_s": 42 }
      }
    }
  }
}
```

The `_meta.tundra` envelope is the contract between the plugin and Tundra-aware tooling. Generic MCP clients ignore it; specialized agents and the `tundra mcp` CLI surface it.

---

## 8. Resources Catalog

Resources are read-only context the agent can attach to a conversation. They're addressed by `tundra://` URIs.

| URI pattern | Content |
|-------------|---------|
| `tundra://sites/{site_id}/logs/recent` | Last 1000 lines of combined application logs |
| `tundra://sites/{site_id}/deployments/{deployment_id}/log` | Build/deploy log for a specific deployment |
| `tundra://servers/{server_id}/metrics/last-hour` | CSV of per-minute metrics |
| `tundra://audit-log/recent` | Last 200 audit log entries |
| `tundra://sites/{site_id}/config` | Generated Nginx config + systemd unit (read-only view) |
| `tundra://databases/{database_id}/schema` | Tables, columns, indexes — no data |
| `tundra://docs/{slug}` | A page of the Tundra operator documentation set |

`resources/list` returns the full set scoped to what the token + session can see. `resources/read` returns the content; large resources are returned as paginated text or as a series of `text/streamed` events depending on size.

`resources/subscribe` is supported for log resources: the server emits `notifications/resources/updated` as new lines arrive, and the agent re-reads to get the new content.

---

## 9. Prompts Catalog

Pre-baked operator-friendly prompts the AI agent can offer:

| Prompt | Inputs | What it does |
|--------|--------|--------------|
| `diagnose-failed-deploy` | `site_id`, `deployment_id` | Pulls the deploy log, recent commits, last successful deploy. Frames a diagnosis prompt for the model. |
| `audit-recent-changes` | `since`, optional `actor` | Pulls audit log entries, formats them for review. |
| `suggest-cost-optimization` | `server_id` | Pulls metrics, identifies underutilized resources, frames a recommendation prompt. |
| `incident-response-runbook` | `site_id`, `severity` | Frames a structured incident response prompt with relevant context attached. |
| `security-review-site` | `site_id` | Inventories headers, TLS config, env-var keys, plugin grants; frames a review prompt. |
| `pre-upgrade-readiness` | none | Checks pending migrations, recent backup status, free disk, alert rules; frames a go/no-go prompt. |

Prompts use MCP's `prompts/get` to assemble a structured input pack (text + attached resources) which the host application renders for the user. They're an optimization for common operator intents — the same outcome is reachable by manual tool composition.

---

## 10. Capabilities Manifest

The plugin's manifest (`Cargo.toml`-adjacent `plugin.toml`) declares the host capabilities it requires. The Wasm sandbox model from `tundra-plugin-architecture-plan-v1.md` §5 applies; this plugin is `kind = "native"` (compiled into `tundrad`) so the sandbox is a logical grant rather than a Wasmtime boundary, but the capability declaration is identical.

```toml
[[capabilities]]
kind   = "net"
hosts  = []                        # MCP server is a server, not a client; no outbound for v1
max_rpm = 0

[[capabilities]]
kind  = "secret"
names = []                         # No long-lived secrets; tokens managed via the plugin's own table

[[capabilities]]
kind   = "db-read"
tables = [
  "servers", "sites", "applications", "deployments", "releases",
  "databases", "db_users", "domains", "dns_zones", "dns_records",
  "mail_domains", "mailboxes", "certificates", "scheduled_tasks",
  "audit_log", "operators",
  "plugin_mcp_tokens", "plugin_mcp_sessions",
]

[[capabilities]]
kind   = "db-write"
tables = [
  # MCP server only writes its own state. All panel mutations are dispatched
  # through the standard Tundra API (so RBAC, audit, validation all run).
  "plugin_mcp_tokens",
  "plugin_mcp_sessions",
  "plugin_mcp_tool_invocations",
]

[[capabilities]]
kind   = "events-subscribe"
events = ["*"]                     # Stream events to active MCP sessions for real-time observability

[[capabilities]]
kind   = "events-publish"
events = [
  "mcp.session.opened",
  "mcp.session.closed",
  "mcp.tool.invoked",
  "mcp.tool.denied",
  "mcp.write-mode-toggled",
]

[[capabilities]]
kind            = "background-jobs"
max_concurrent  = 32               # tail_logs, metrics streaming

[[capabilities]]
kind  = "http-public-route"
paths = ["/mcp"]                   # GET + POST per Streamable HTTP spec
```

The MCP server **does not write directly to panel domain tables.** Every mutation flows through the standard Tundra API client in-process. The MCP layer is a translator, not a privileged shortcut.

---

## 11. Plugin-Owned Schema

The schema is namespaced under `plugin_mcp_*` per the plugin schema convention.

```sql
CREATE TABLE plugin_mcp_tokens (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id       UUID NOT NULL DEFAULT uuidv7() UNIQUE,
    operator_id     BIGINT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    token_hash      BYTEA NOT NULL UNIQUE,           -- SHA-256 of the token; the plaintext is shown only on create
    token_prefix    TEXT NOT NULL,                   -- 'ttok_readonly_abc123' first 16 chars for display
    scopes          TEXT[] NOT NULL,                 -- subset of mcp:read, mcp:write:safe, mcp:write, mcp:admin
    restrict_ip     CIDR,
    allowed_clients TEXT[],
    max_uses        INT,                             -- NULL = unlimited
    use_count       INT NOT NULL DEFAULT 0,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    revoke_reason   TEXT,
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcp_tokens_operator
    ON plugin_mcp_tokens(operator_id)
    WHERE revoked_at IS NULL;
CREATE INDEX idx_mcp_tokens_expiry
    ON plugin_mcp_tokens(expires_at)
    WHERE revoked_at IS NULL;

CREATE TABLE plugin_mcp_sessions (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id       UUID NOT NULL DEFAULT uuidv7() UNIQUE,
    token_id        BIGINT NOT NULL REFERENCES plugin_mcp_tokens(id) ON DELETE CASCADE,
    transport       TEXT NOT NULL CHECK (transport IN ('stdio','http')),
    mode            TEXT NOT NULL CHECK (mode IN ('read','write')),
    client_name     TEXT,                             -- from initialize: 'claude-desktop', 'cursor', etc.
    client_version  TEXT,
    protocol_version TEXT NOT NULL,                   -- '2025-03-26'
    remote_ip       INET,                             -- for http transport
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at        TIMESTAMPTZ,
    end_reason      TEXT
);

CREATE INDEX idx_mcp_sessions_active
    ON plugin_mcp_sessions(token_id, ended_at)
    WHERE ended_at IS NULL;
CREATE INDEX idx_mcp_sessions_started
    ON plugin_mcp_sessions(started_at DESC);

CREATE TABLE plugin_mcp_tool_invocations (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id       UUID NOT NULL DEFAULT uuidv7() UNIQUE,
    session_id      BIGINT NOT NULL REFERENCES plugin_mcp_sessions(id) ON DELETE CASCADE,
    tool_name       TEXT NOT NULL,
    arguments       JSONB NOT NULL,                   -- secrets redacted before insert
    outcome         TEXT NOT NULL                     -- 'success','error','denied','blocked','rate-limited'
                    CHECK (outcome IN ('success','error','denied','blocked','rate-limited','timeout')),
    error_code      TEXT,
    error_summary   TEXT,
    duration_ms     INT,
    audit_log_id    BIGINT REFERENCES audit_log(id) ON DELETE SET NULL,
                                                      -- the row in the global audit_log this invocation produced
    invoked_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcp_invocations_session
    ON plugin_mcp_tool_invocations(session_id, invoked_at DESC);
CREATE INDEX idx_mcp_invocations_tool
    ON plugin_mcp_tool_invocations(tool_name, invoked_at DESC);
CREATE INDEX idx_mcp_invocations_outcome
    ON plugin_mcp_tool_invocations(outcome, invoked_at DESC)
    WHERE outcome IN ('error','denied','blocked','timeout');
```

### 11.1 Retention

- `plugin_mcp_tokens` — hard-deleted on revoke + expire, after a 30-day grace period for forensic lookup.
- `plugin_mcp_sessions` — kept for 90 days; partition (or pruned by job).
- `plugin_mcp_tool_invocations` — kept for 90 days online + archived to Parquet for 7 years (mirrors `audit_log` retention from `tundra-security-audit-v1.md` §4.5).

---

## 12. Audit

Every MCP-mediated action lands in two places: the plugin's `plugin_mcp_tool_invocations` (with its arguments and outcome) and the global `audit_log` (with `actor_kind = 'mcp'`).

The two are linked: `plugin_mcp_tool_invocations.audit_log_id` references the row in `audit_log` that the action produced (NULL if the action didn't reach the API surface, e.g., a denied call).

This means a Tundra operator reviewing the audit log sees AI-mediated changes alongside human-mediated changes, with the additional context of which session and which token was responsible. The audit trail is consistent whether the action came from a panel button click, a CLI command, or an MCP tool call.

### 12.1 Argument redaction

Arguments are stored after redaction. Field names matching the redaction allowlist (`password`, `token`, `secret`, `private_key`, `recovery_code`, `value` when paired with `is_secret=true`) are replaced with `<redacted:N-bytes>` before insert. The redaction pipeline is shared with the panel API's audit emitter (see `tundra-security-audit-v1.md` §4.5).

### 12.2 Events emitted

The plugin emits these events (subscribed to by the panel UI for live updates):

- `mcp.session.opened` — payload: session id, transport, client name, mode.
- `mcp.session.closed` — payload: session id, end reason, duration, tools used.
- `mcp.tool.invoked` — payload: invocation id, tool name, outcome, duration.
- `mcp.tool.denied` — payload: invocation id, tool name, denial reason.
- `mcp.write-mode-toggled` — payload: session id, old mode, new mode.

---

## 13. Security Posture

The MCP server inherits the controls in `tundra-security-audit-v1.md` and adds a few of its own.

### 13.1 Inherited controls

- **TLS 1.3 only** for the HTTP transport, including the same cipher restrictions as the panel.
- **Audit chain hashing** — every audit row produced via MCP is part of the same chain as panel-originated rows.
- **RBAC enforcement** — every tool call hits `Authz::require` before the API surface runs.
- **Step-up authentication** for admin tools, identical to the panel's step-up requirement.
- **Rate limiting** — per-session token bucket plus the global per-token limit.

### 13.2 MCP-specific controls

- **Origin header validation** for HTTP — DNS rebinding protection. Configured allowlist; defaults to the panel's `public_url`.
- **Tool catalog gating** — read-mode sessions don't see write tools advertised. Stronger than refusing the call: the agent never knows the tool exists.
- **Token scope ceiling** — token scopes cap session capabilities, no exception, no mid-session escalation.
- **Confirmation gate for destructive operations** — `delete_site`, `delete_database`, `restore_backup` all require a two-step preview-then-confirm dance with a server-issued `confirmation_token`. The token is single-use, expires in 5 minutes, and is bound to the previewed parameters.
- **Argument redaction in invocation log** — the `arguments` jsonb column is post-redaction; the original values are never persisted.

### 13.3 Threat model — MCP-specific entries

Adding to the STRIDE analysis from `tundra-security-audit-v1.md` §4:

| Threat                                             | Vector                                     | Control                                                                                                                                                       |
|----------------------------------------------------|--------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **S** — agent claims a clientInfo it isn't         | Hostile MCP client lies in `initialize`    | `clientInfo.name` is recorded but **not trusted for authorization**. Token scope and session mode determine capability; clientInfo is for audit display only. |
| **T** — replay of a captured tool call             | Network attacker replays a POST            | TLS 1.3; `Mcp-Session-Id` is bound to the session row and the source IP for HTTP; replay across sessions fails.                                               |
| **R** — operator denies issuing a destructive call | Compromised agent claims operator approved | Confirmation tokens are server-issued, single-use, bound to the previewed parameters; the audit log records both preview and confirm.                         |
| **I** — secret leaks in tool output                | Agent reads a value via `get_site`         | `get_site` returns env var **keys** only, never values. Other read tools follow the same rule.                                                                |
| **D** — agent runs the rate limiter dry            | Buggy or hostile agent                     | Per-session rate limit (default 60 RPM); 429 response includes `Retry-After`; sustained breach revokes the session.                                           |
| **E** — read-only agent gets write access          | Bug in the scope resolver                  | Single resolver function; integration tests assert the matrix in §5.3 for every tool; in-process call still hits panel `Authz::require`.                      |

### 13.4 Operator responsibilities

Documented in the operator companion (`tundra-mcp-server-operator-v1.md`), but the operator commitments at the level of this spec:

- Tokens are minted by the operator, with explicit scope. There is no auto-minting.
- Tokens are revocable from the panel; revocation kills active sessions within ~10 seconds.
- The operator is responsible for choosing the session mode at start; the default is `read`.
- The operator is responsible for reviewing the MCP audit page periodically.

---

## 14. Performance Targets

| Metric                                           | Target                                                        |
|--------------------------------------------------|---------------------------------------------------------------|
| `initialize` round-trip                          | < 50 ms                                                       |
| `tools/list` round-trip                          | < 30 ms (response is cached per (token, mode) pair)           |
| Read-tool p95 latency                            | < 100 ms (forwards to the same panel API the operator hits)   |
| Write-tool p95 latency                           | < 250 ms (excluding asynchronous work — deploys remain async) |
| SSE first-byte for streaming tools               | < 200 ms                                                      |
| Concurrent sessions per `tundrad` instance       | 1000                                                          |
| Steady-state RSS overhead with 100 idle sessions | < 50 MiB                                                      |

Validated by the load tests in `tundra-test-plan-v1.md` §9.2.

---

## 15. CLI Surface

The plugin contributes a `tundra mcp` CLI subcommand:

```
tundra mcp serve [--stdio] [--readonly]
    Run the MCP server. With --stdio, runs as a subprocess for desktop AI hosts.
    Without --stdio, prints the HTTP endpoint URL (the actual server runs in tundrad).

tundra mcp status
    Show plugin enabled/disabled state, active session count, recent invocation summary.

tundra mcp tokens list [--operator <id>] [--include-revoked]
tundra mcp tokens create --name <name> --scopes <scope[,scope]> [--ttl <duration>]
                         [--max-uses <n>] [--restrict-ip <cidr>]
                         [--allowed-clients <name[,name]>]
tundra mcp tokens revoke <token-public-id> [--reason <text>]
tundra mcp tokens show <token-public-id>

tundra mcp sessions list [--active] [--token <public-id>]
tundra mcp sessions show <session-public-id>
tundra mcp sessions close <session-public-id>

tundra mcp audit [--since <duration>] [--tool <name>] [--outcome <kind>]
                 [--session <public-id>] [--limit <n>]
```

---

## 16. UI Surface

The plugin contributes the **Settings → AI Agents (MCP)** page, with sections:

```
┌─────────────────────────────────────────────────────────────────────┐
│ AI Agents (MCP)                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ Status:        Active (HTTP endpoint live, stdio per CLI invocation)│
│ HTTP endpoint: https://panel.example.com/mcp                        │
│ Protocol:      MCP 2025-03-26                                       │
│                                                                     │
│ Connect Claude Desktop:                                             │
│   [ Show MCP config ▼ ]   copies a ready-to-paste JSON snippet      │
│                                                                     │
│ Connect Cursor / Zed / Claude Code:                                 │
│   [ Show install command ▼ ]   the equivalent for each editor       │
│                                                                     │
│ ── Tokens ───────────────────────────────────────────────────────── │
│  Name              Scope            Expires         Last used       │
│  claude-readonly   mcp:read         2026-06-01      2 minutes ago   │
│  deploy-bot        mcp:write        2026-05-15      1 hour ago      │
│  [+ Create token]                                                   │
│                                                                     │
│ ── Active sessions ─────────────────────────────────────────────── │
│  Client            Mode    Started     Tools used    Token          │
│  claude-desktop    read    11:42       42            claude-...     │
│  cursor            write   11:40       7             deploy-bot     │
│                                                                     │
│ ── Recent tool invocations ─────────────────────────────────────── │
│  11:43 list_sites          [success]                                │
│  11:42 tail_logs("api")    [success]                                │
│  11:41 deploy_site("api")  [success]   by deploy-bot                │
│ [ Full audit log → ]                                                │
└─────────────────────────────────────────────────────────────────────┘
```

The page surfaces a single source of truth for AI access. Every session, every tool call, every denied request is visible in real time. The operator never has to ssh into the server to figure out which AI agents are connected.

---

## 17. Configuration

Plugin-level configuration in `tundrad.toml`:

```toml
[plugins."com.tundra.mcp-server"]
enabled                           = true

# Transport
http_origin_allowlist             = []     # populated from public_url if empty
stdio_max_concurrent_subprocesses = 4      # safety cap

# Sessions
session_idle_timeout_secs         = 1800
session_absolute_lifetime_secs    = 86400

# Rate limits
rate_limit_per_session_rpm        = 60
rate_limit_per_token_rpm          = 600

# Streaming
streaming_max_concurrent_tails    = 32
streaming_buffer_size             = 4096

# Tools
disable_tools                     = []     # admin can hide tools from the catalog
require_step_up_for_admin_tools   = true   # mirrors panel default

# Audit
invocation_retention_days         = 90
session_retention_days            = 90
```

---

## 18. Test Surface

Hooks into the test plan (`tundra-test-plan-v1.md`):

- **Unit** — JSON Schema generation per tool, scope-resolution matrix, redaction pipeline.
- **Integration** — full `initialize`/`tools/list`/`tools/call` round-trips against an in-process `tundrad` for both transports.
- **E2E** — at least one Playwright spec that exercises the operator UI for token creation, plus a Node-based MCP client harness that exercises the HTTP transport from outside the test process.
- **Security regression** — a test per fixed issue, in `tests/security/mcp_*`.
- **Fuzzing** — `cargo fuzz` target on the JSON-RPC framer and the schema validator.

---

## 19. Roadmap

| Item                                                                | Target |
|---------------------------------------------------------------------|--------|
| OAuth 2.1 device flow                                               | v1.1   |
| Per-tool granular scopes (e.g. `mcp:write:deploys`)                 | v1.2   |
| Outbound MCP client (Tundra as an MCP client to other servers)      | v2.0   |
| Plugin-contributed tools (tools registered by other Tundra plugins) | v1.3   |
| Tool input/output schema versioning with migration helpers          | v1.3   |
| Replay protection nonces beyond the session-id binding              | v1.2   |

---

## 20. Document Control

| Version | Date     | Author         | Changes                                                                                                                                                                                                                                                                                                                                                                                                                  |
|---------|----------|----------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| v1.0    | May 2026 | Al Amin Ahamed | Initial dedicated specification. Extracted from `tundra-additional-core-plugins-v1.md` §4 and expanded with full transport behaviour, complete tool catalog with JSON Schemas, scope/session matrix, plugin-owned schema, audit pipeline, MCP-specific threat model, performance targets, CLI/UI/config surfaces, test surface, roadmap. The additional-plugins document now references this one as the source of truth. |

**Companion Documents:**

- `tundra-mcp-server-operator-v1.md` — operator-facing usage guide
- `tundra-mcp-server-cookbook-v1.md` — Claude Desktop / Cursor / Zed configs and end-to-end walkthroughs
- `tundra-additional-core-plugins-v1.md` — Namecheap, GitHub plugins; the MCP §4 there now defers to this document
- `tundra-plugin-architecture-plan-v1.md` — the Wasm sandbox + capability framework this plugin targets
- `tundra-api-specification-v1.md` — the surface the MCP layer translates to
- `tundra-security-audit-v1.md` — the threat-model reference for the security posture
- `tundra-database-schema-v1.md` — the schema the `plugin_mcp_*` tables join
- `tundra-test-plan-v1.md` — the test surface this plugin extends
- `tundra-technical-implementation-plan-v3.md` — overall architecture context
