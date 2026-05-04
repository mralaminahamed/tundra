# Tundra — API Specification

> The complete API surface for the Tundra control plane and agent fleet.
> REST for the panel UI and operator integrations. gRPC for `tundrad` ↔ `tundra-agent`. WebSocket for live events.

---

**Author:** Al Amin Ahamed
**GitHub:** [@mralaminahamed](https://github.com/mralaminahamed)
**X:** [@mralaminahamed](https://x.com/mralaminahamed)

**Document Version:** v1.0
**Document Date:** May 2026
**Companion to:** `tundra-technical-implementation-plan-v2.md`, `tundra-database-schema-v1.md`
**Status:** Implementation-Ready Specification
**Audience:** Engineering — Backend developers, integrators, plugin authors

---

## 1. Overview

Tundra exposes three distinct API surfaces, each chosen for the channel's characteristics:

1. **REST (HTTPS, JSON)** — the panel UI's API and the integration surface for external automation. Documented as OpenAPI 3.1. Stable, versioned, public-friendly.
2. **gRPC (HTTP/2, protobuf, mTLS)** — the control-plane ↔ agent fleet protocol. Bidirectional streaming, strongly-typed, internal-only.
3. **WebSocket (HTTPS upgrade)** — the live-event channel from `tundrad` to the panel UI. One persistent connection per operator session, multiplexed for site logs, deploy progress, server metrics, alerts.

A fourth surface — **MCP (Model Context Protocol)** — is exposed by the optional `com.tundra.mcp-server` core plugin and documented in `tundra-additional-core-plugins-v1.md` §4. This document references it but does not duplicate the spec.

### 1.1 API Versioning Policy

The REST and WebSocket APIs are **path-versioned**: `/api/v1/...` and `/ws/v1/events`. The version increments only on **breaking changes**:

- Removing an endpoint, field, or enum value.
- Changing the type of a field.
- Tightening validation in a way that previously-accepted requests fail.

Additive changes (new endpoints, new optional fields, new enum values added with a documented unknown-tolerance rule) ship in `v1` indefinitely. Tundra's expectation is that `v1` will be supported for the lifetime of the v1.x line, with `v2` arriving only when a meaningful set of breaking changes has accumulated.

The gRPC API uses **protobuf field numbers and reserved ranges** to maintain wire compatibility. Client and server tolerate unknown fields. A breaking change to gRPC requires bumping the package version (`tundra.agent.v1` → `tundra.agent.v2`) and supporting both during a transition window.

### 1.2 Authentication & Authorization

| Surface            | Auth                                                                                               |
|--------------------|----------------------------------------------------------------------------------------------------|
| REST (panel)       | Session cookie (HttpOnly, SameSite=Strict) + CSRF header on state-changing requests                |
| REST (integration) | Bearer token (`Authorization: Bearer tundra_pat_<...>`) issued from the Settings → API Tokens page |
| gRPC               | mTLS — client cert issued by Tundra's internal CA; agent identity in the cert subject              |
| WebSocket          | Session token presented as query param at upgrade; one connection per session                      |
| MCP (stdio)        | Process-level — the local user already authenticated to the host                                   |
| MCP (HTTP)         | Bearer token with scope `mcp:*`                                                                    |

Every request resolves to a **principal** (operator, plugin, MCP session, system) and a **scope** (global, server, site). RBAC is evaluated by Tundra's policy layer before any handler runs; handlers do not re-check authorization.

### 1.3 Idempotency

State-changing requests accept an optional `Idempotency-Key` header. The server records the key in Valkey (DB 0, TTL 24h) along with a hash of the request body and the resulting status + body. A repeat with the same key returns the cached response unchanged. Required for: deploy triggers, billing-adjacent operations, anything externally-retried by webhook.

### 1.4 Error Format

Every REST error response is a JSON object with this shape:

```json
{
  "error": {
    "code": "site.not_found",
    "message": "No site with id `01H8XK...` exists.",
    "request_id": "req_01H8YZ...",
    "details": {
      "site_id": "01H8XK..."
    }
  }
}
```

The `code` is a **stable** dot-separated identifier used for client-side error handling. Codes never change; if a new error is meaningfully distinct, it gets a new code rather than reusing an existing one. The `message` is human-readable English; localization is the client's responsibility.

The HTTP status maps as follows: `400` for validation errors, `401` for missing/invalid auth, `403` for authorized-but-not-permitted, `404` for missing resources, `409` for state conflicts (deploy already running), `422` for semantic validation failures, `429` for rate limits, `5xx` for server faults. The `code` carries the precise meaning; the HTTP status is the broad bucket.

### 1.5 Pagination

List endpoints use **cursor pagination** keyed on the resource's primary key:

```
GET /api/v1/sites?limit=50&cursor=eyJpZCI6IjAxSDhYS...

{
  "data": [ ... ],
  "next_cursor": "eyJpZCI6IjAxSDhZTi...",
  "total_estimate": 4218
}
```

`limit` defaults to 25 and caps at 200. `total_estimate` is best-effort (PostgreSQL `pg_class.reltuples` for unfiltered queries, or absent for filtered/searched queries). Clients build "load more" UIs against `next_cursor`; the absence of `next_cursor` means the end. Page-number pagination is not supported.

### 1.6 Rate Limits

REST endpoints are rate-limited per principal:

| Principal             | Default                                  | Burst |
|-----------------------|------------------------------------------|-------|
| Operator session      | 600/min                                  | 60    |
| Personal access token | 1200/min                                 | 120   |
| Plugin                | configured per capability                | 1×    |
| MCP session           | 60/min for write tools, 600/min for read | 30    |

Limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are returned on every response. `429` responses include `Retry-After` in seconds.

---

## 2. REST API Surface

The full OpenAPI 3.1 document is published at `/api/v1/openapi.yaml` and rendered at `/api/v1/docs/`. The panel UI generates its TypeScript types from this same source via `pnpm openapi-typescript`. This section gives the canonical resource map and a few representative endpoint specs.

### 2.1 Resource Map

| Resource            | Path prefix                                           | Operations                                                             |
|---------------------|-------------------------------------------------------|------------------------------------------------------------------------|
| Auth                | `/api/v1/auth/*`                                      | login, logout, refresh, totp-setup, passkey-register/verify            |
| Operators           | `/api/v1/operators`                                   | list, get, create, update, delete, invite                              |
| API tokens          | `/api/v1/operators/me/tokens`                         | list, create, revoke                                                   |
| Servers             | `/api/v1/servers`                                     | list, get, create (init), update, delete, action: reboot/disable       |
| Services            | `/api/v1/servers/:id/services`                        | list, get, action: start/stop/restart                                  |
| Packages            | `/api/v1/servers/:id/packages`                        | list, action: update/install/remove                                    |
| Firewall rules      | `/api/v1/servers/:id/firewall`                        | list, create, update, delete, action: apply                            |
| Sites               | `/api/v1/sites`                                       | list, get, create, update, delete, action: archive/restore/suspend     |
| Applications        | `/api/v1/sites/:id/application`                       | get, update                                                            |
| Deployments         | `/api/v1/sites/:id/deployments`                       | list, get, create (trigger), get-logs, action: cancel/promote/rollback |
| Env vars            | `/api/v1/sites/:id/env-vars`                          | list, create, update, delete                                           |
| Scheduled tasks     | `/api/v1/sites/:id/scheduled-tasks`                   | list, create, update, delete, action: run-now                          |
| Site aliases        | `/api/v1/sites/:id/aliases`                           | list, create, delete                                                   |
| Domains             | `/api/v1/domains`                                     | list, get, create (register/import), update, delete                    |
| DNS records         | `/api/v1/domains/:id/dns-records`                     | list, create, update, delete, batch-update                             |
| Database servers    | `/api/v1/database-servers`                            | list, get, create, update, delete                                      |
| Databases           | `/api/v1/databases`                                   | list, get, create, delete                                              |
| DB users            | `/api/v1/db-users`                                    | list, create, update, delete, action: grant/revoke                     |
| Mail domains        | `/api/v1/mail/domains`                                | list, get, create, delete, action: regenerate-dkim                     |
| Mailboxes           | `/api/v1/mail/mailboxes`                              | list, get, create, update, delete, action: reset-password              |
| Aliases             | `/api/v1/mail/aliases`                                | list, create, update, delete                                           |
| Mail queue          | `/api/v1/mail/queue`                                  | list, action: hold/release/delete                                      |
| Backup targets      | `/api/v1/backups/targets`                             | list, get, create, update, delete, action: test                        |
| Backup jobs         | `/api/v1/backups/jobs`                                | list, get, create, update, delete, action: run-now                     |
| Backup snapshots    | `/api/v1/backups/snapshots`                           | list, get, action: restore                                             |
| Plugins             | `/api/v1/plugins`                                     | list, get, action: install/uninstall/enable/disable/update             |
| Plugin capabilities | `/api/v1/plugins/:id/capabilities`                    | list, action: grant/revoke                                             |
| Plugin settings     | `/api/v1/plugins/:id/settings`                        | get, update                                                            |
| Migrations          | `/api/v1/migrations`                                  | list, get, create, action: stage/sync/cutover/rollback                 |
| Certificates        | `/api/v1/certificates`                                | list, get, create (request), action: renew/revoke                      |
| Settings            | `/api/v1/settings`                                    | get, update (per group)                                                |
| Audit log           | `/api/v1/audit-log`                                   | list (read-only)                                                       |
| Health              | `/api/v1/health`, `/api/v1/healthz`, `/api/v1/readyz` | get                                                                    |

### 2.2 Representative Endpoint — `POST /api/v1/sites`

Creates a new site. The "create site" wizard in the panel UI submits to this endpoint; integration consumers use it directly.

**Request:**

```http
POST /api/v1/sites HTTP/2
Authorization: Bearer tundra_pat_01H8XK...
Content-Type: application/json
Idempotency-Key: e3f4-...-9c7a

{
  "name": "Example Production",
  "primary_domain": "example.com",
  "server_id": "01H8XK0AAAAA",
  "application": {
    "kind": "laravel",
    "runtime_version": "8.4",
    "build_command": "composer install --no-dev && npm ci && npm run build",
    "start_command": null,
    "process_count": 1,
    "health_check_path": "/up",
    "source_kind": "github",
    "source_config": {
      "repository": "owner/repo",
      "branch": "main",
      "github_app_installation_id": 12345
    }
  },
  "tls": {
    "enabled": true,
    "issuer": "letsencrypt"
  },
  "aliases": ["www.example.com"]
}
```

**Response (201 Created):**

```json
{
  "data": {
    "id": "01H8XK0SITE000000000000001",
    "name": "Example Production",
    "primary_domain": "example.com",
    "server_id": "01H8XK0AAAAA",
    "status": "provisioning",
    "document_root": "/srv/sites/01H8XK0SITE000000000000001/current",
    "base_path": "/",
    "application": {
      "id": "01H8XK0APP0000000000000001",
      "kind": "laravel",
      "runtime_version": "8.4",
      "current_release_id": null
    },
    "aliases": [
      { "id": "01H8XK0ALI0000000000000001", "domain": "www.example.com" }
    ],
    "created_at": "2026-05-02T12:00:00Z",
    "updated_at": "2026-05-02T12:00:00Z"
  },
  "deployment": {
    "id": "01H8XK0DEP0000000000000001",
    "status": "queued",
    "log_stream": "wss://panel.example.com/ws/v1/events?subscribe=deployment:01H8XK0DEP0000000000000001"
  }
}
```

**Errors:**

| Status | Code                              | Meaning                                                                                                                                        |
|--------|-----------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| 400    | `validation.required_field`       | A required field is missing. `details.field` names it.                                                                                         |
| 400    | `validation.invalid_format`       | A field has the wrong format. `details.field` and `details.expected` describe what's wrong.                                                    |
| 403    | `policy.forbidden`                | Caller lacks `sites.create` permission, or the chosen server is outside their scope.                                                           |
| 404    | `server.not_found`                | `server_id` does not resolve.                                                                                                                  |
| 409    | `domain.already_in_use`           | `primary_domain` is bound to another site. `details.existing_site_id` identifies the conflict.                                                 |
| 422    | `application.unsupported_runtime` | The runtime version isn't installed on the chosen server. `details.available_versions` lists what is.                                          |
| 503    | `agent.unreachable`               | The chosen server's agent hasn't checked in within the heartbeat window; the request is rejected rather than queued, to avoid silent failures. |

Note the design choice: the response includes the **first deployment**, queued. Site creation kicks off an initial deploy automatically. The client subscribes to `deployment.log_stream` for live progress and renders the result when `deploy.succeeded` arrives.

### 2.3 Representative Endpoint — `GET /api/v1/sites/:id`

```http
GET /api/v1/sites/01H8XK0SITE000000000000001 HTTP/2
Authorization: Bearer tundra_pat_01H8XK...
```

**Response (200):**

```json
{
  "data": {
    "id": "01H8XK0SITE000000000000001",
    "name": "Example Production",
    "primary_domain": "example.com",
    "server": {
      "id": "01H8XK0AAAAA",
      "name": "vps-fra-01",
      "region": "eu-central",
      "status": "active"
    },
    "status": "active",
    "document_root": "/srv/sites/01H8XK0SITE000000000000001/current",
    "base_path": "/",
    "application": {
      "id": "01H8XK0APP0000000000000001",
      "kind": "laravel",
      "runtime_version": "8.4",
      "current_release": {
        "id": "01H8XK0REL0000000000000007",
        "deployed_at": "2026-05-02T11:43:00Z",
        "deployment_id": "01H8XK0DEP0000000000000007",
        "source_ref": "a4b3c2d...",
        "source_message": "fix: handle empty cart"
      }
    },
    "tls": {
      "issuer": "letsencrypt-r10",
      "common_name": "example.com",
      "san": ["example.com", "www.example.com"],
      "not_after": "2026-08-02T11:00:00Z",
      "auto_renew": true
    },
    "aliases": [
      { "id": "01H8XK0ALI0000000000000001", "domain": "www.example.com", "tls_status": "active" }
    ],
    "health": {
      "status": "healthy",
      "last_check_at": "2026-05-02T12:14:00Z",
      "consecutive_successes": 1287
    },
    "created_at": "2026-05-02T12:00:00Z",
    "updated_at": "2026-05-02T11:43:05Z"
  }
}
```

The shape is **deeply hydrated** by default for resource-detail endpoints; the panel UI renders the entire site detail page from a single response. List endpoints return a leaner shape with just IDs and the most-frequently-displayed fields. Sparse-fieldsets via `?fields=...` are not supported in v1; if they're needed, they'll arrive as a future additive change.

### 2.4 Representative Endpoint — `POST /api/v1/sites/:id/deployments`

Triggers a deploy.

**Request:**

```http
POST /api/v1/sites/01H8XK0SITE000000000000001/deployments HTTP/2
Authorization: Bearer tundra_pat_01H8XK...
Content-Type: application/json
Idempotency-Key: deploy-2026-05-02-build-7

{
  "trigger": "manual",
  "source_ref": "main",
  "skip_build_cache": false,
  "force": false
}
```

The `trigger` is `manual` for operator-initiated, `webhook` for VCS-triggered, `rollback` for rollback to a previous release, `schedule` for cron-driven. The `force` flag bypasses the "already deploying" guard — used by rollback paths only.

**Response (202 Accepted):**

```json
{
  "data": {
    "id": "01H8XK0DEP0000000000000008",
    "site_id": "01H8XK0SITE000000000000001",
    "application_id": "01H8XK0APP0000000000000001",
    "status": "queued",
    "triggered_by": "manual",
    "triggered_by_id": "01H8XK0OP00000000000000001",
    "source_ref": "main",
    "created_at": "2026-05-02T12:15:00Z",
    "log_stream": "wss://panel.example.com/ws/v1/events?subscribe=deployment:01H8XK0DEP0000000000000008"
  }
}
```

Note the `202` — the deploy is queued, not complete. The caller follows the `log_stream` over WebSocket for progress, or polls `GET /api/v1/sites/:id/deployments/:deployment_id` for status.

### 2.5 Representative Endpoint — `GET /api/v1/audit-log`

Read-only access to the audit trail.

**Request:**

```http
GET /api/v1/audit-log?actor_id=01H8XK0OP00000000000000001&action=site.* HTTP/2
Authorization: Bearer tundra_pat_01H8XK...
```

Filters: `actor_type`, `actor_id`, `resource_type`, `resource_id`, `action` (with prefix matching via trailing `*`), `since`, `until`.

**Response (200):**

```json
{
  "data": [
    {
      "id": "01H8XK0LOG000000000000007",
      "occurred_at": "2026-05-02T12:15:00Z",
      "actor": { "type": "operator", "id": "01H8XK0OP00000000000000001", "name": "Al Amin" },
      "action": "site.deploy_triggered",
      "resource": { "type": "site", "id": "01H8XK0SITE000000000000001" },
      "ip": "203.0.113.7",
      "user_agent": "Mozilla/5.0 ...",
      "details": {
        "deployment_id": "01H8XK0DEP0000000000000008",
        "trigger": "manual",
        "source_ref": "main"
      }
    }
  ],
  "next_cursor": null
}
```

Audit log entries are **never** mutated — there is no PATCH or DELETE on this resource. Even if a row is privacy-sensitive, the redaction is performed by replacing `details` content with a redaction marker via a separate redaction pipeline that itself is audited.

### 2.6 OpenAPI Generation

Tundra's REST API is hand-defined in `proto/openapi.yaml` and rendered at `/api/v1/openapi.yaml`. The Rust handlers carry **no derived OpenAPI** — the spec is the source of truth, the Rust code conforms to it, and a contract test in CI fails the build if any endpoint diverges from the spec (verified by replaying the spec's example requests against a running test instance and asserting response-schema conformance).

This direction (spec-first) was chosen deliberately: it keeps the API description independent of the implementation language, makes type generation for clients (TypeScript, Python, Go) trivial, and forces every new endpoint to be designed before it is implemented.

---

## 3. gRPC Surface — Control Plane ↔ Agent

The internal API between `tundrad` and `tundra-agent` runs over gRPC with mTLS. It is **not** a public surface — it has no HTTP analog, no operator-visible documentation, and is versioned independently of the REST API.

### 3.1 Service Map

```protobuf
// proto/tundra/agent/v1/agent.proto
syntax = "proto3";
package tundra.agent.v1;

service Agent {
  // Lifecycle
  rpc Heartbeat(HeartbeatRequest) returns (HeartbeatResponse);
  rpc UpdateAgent(UpdateAgentRequest) returns (UpdateAgentResponse);

  // Server-side operations (control plane → agent)
  rpc ApplyServerConfig(ApplyServerConfigRequest) returns (ApplyServerConfigResponse);
  rpc ManageService(ManageServiceRequest) returns (ManageServiceResponse);
  rpc UpdatePackages(UpdatePackagesRequest) returns (stream UpdatePackagesProgress);
  rpc ApplyFirewall(ApplyFirewallRequest) returns (ApplyFirewallResponse);

  // Site lifecycle
  rpc ProvisionSite(ProvisionSiteRequest) returns (stream ProvisionSiteProgress);
  rpc DeploySite(DeploySiteRequest) returns (stream DeploySiteProgress);
  rpc PromoteRelease(PromoteReleaseRequest) returns (PromoteReleaseResponse);
  rpc RollbackSite(RollbackSiteRequest) returns (RollbackSiteResponse);
  rpc DeleteSite(DeleteSiteRequest) returns (DeleteSiteResponse);

  // Database operations
  rpc CreateDatabase(CreateDatabaseRequest) returns (CreateDatabaseResponse);
  rpc CreateDbUser(CreateDbUserRequest) returns (CreateDbUserResponse);
  rpc GrantPrivileges(GrantPrivilegesRequest) returns (GrantPrivilegesResponse);

  // Mail operations
  rpc CreateMailbox(CreateMailboxRequest) returns (CreateMailboxResponse);
  rpc UpdateMailbox(UpdateMailboxRequest) returns (UpdateMailboxResponse);
  rpc RegenerateDkim(RegenerateDkimRequest) returns (RegenerateDkimResponse);

  // Backup operations
  rpc RunBackupJob(RunBackupJobRequest) returns (stream RunBackupJobProgress);
  rpc RestoreBackup(RestoreBackupRequest) returns (stream RestoreBackupProgress);

  // Live data — bidirectional
  rpc StreamMetrics(stream MetricsSample) returns (stream MetricsAck);
  rpc StreamLogs(StreamLogsRequest) returns (stream LogLine);
  rpc StreamEvents(EventStreamRequest) returns (stream Event);

  // Diagnostics
  rpc GetDiagnostics(GetDiagnosticsRequest) returns (GetDiagnosticsResponse);
  rpc ExecuteCommand(ExecuteCommandRequest) returns (stream ExecuteCommandOutput);
}
```

Bidirectional streaming RPCs (`StreamMetrics`, `StreamLogs`) keep the agent's outbound channel open continuously — metrics flow from agent to `tundrad` over `StreamMetrics`, while `tundrad` ack's batches in the reverse direction with watermarks for at-least-once delivery semantics.

### 3.2 Representative Message — `DeploySiteRequest`

```protobuf
message DeploySiteRequest {
  string deployment_id = 1;          // UUIDv7
  string site_id = 2;
  string application_id = 3;

  ApplicationConfig application = 4;
  SourceArchive source = 5;
  EnvVars env_vars = 6;
  ResourceLimits limits = 7;

  bool skip_build_cache = 10;
  bool force = 11;
  bool dry_run = 12;
}

message ApplicationConfig {
  string kind = 1;                   // 'laravel', 'nodejs', etc.
  string runtime_version = 2;
  string build_command = 3;
  string start_command = 4;
  uint32 process_count = 5;
  string health_check_path = 6;
  string document_root = 7;
}

message SourceArchive {
  oneof source {
    GitSource git = 1;
    TarballSource tarball = 2;
  }
}

message GitSource {
  string repository_url = 1;          // resolved by control plane (includes auth via short-lived token)
  string ref = 2;                     // commit SHA preferred; branch acceptable for fresh deploys
  bool shallow = 3;                   // true unless full history needed for build
}

message DeploySiteProgress {
  oneof progress {
    DeployStarted started = 1;
    DeployStage stage = 2;
    DeployLog log = 3;
    DeployFinished finished = 4;
    DeployFailed failed = 5;
  }
}
```

The progress stream emits `DeployStage` markers for the lifecycle phases (`fetching`, `building`, `assembling`, `health_checking`, `promoting`), interleaved with `DeployLog` lines, and concludes with exactly one of `DeployFinished` or `DeployFailed`. The control plane mirrors these into the WebSocket event stream so the panel UI sees them in real time.

### 3.3 Authentication & Identity

Every gRPC call carries the agent's mTLS client cert. The cert subject CN is the server UUID (e.g., `01H8XK0AAAAA`). `tundrad` extracts this on each connection and uses it to authorize per-call: an agent for `server_id=A` may not call `DeploySite` for a `site_id` whose `server_id` is `B`.

The cert chain is rooted at Tundra's internal CA (stored in `/var/lib/tundra/data/ca/`). Cert rotation is automatic on a 60-day cadence; the agent renews 30 days before expiry by calling `Heartbeat` with a CSR included.

### 3.4 Error Format

gRPC errors use the standard `google.rpc.Status` envelope with Tundra-specific `details` proto messages:

```protobuf
message TundraErrorDetail {
  string code = 1;                    // 'site.deploy.build_failed'
  map<string, string> context = 2;    // { "exit_code": "1", "stage": "build" }
}
```

Status codes follow gRPC conventions: `INVALID_ARGUMENT` for validation, `NOT_FOUND` for missing resources, `FAILED_PRECONDITION` for state issues, `INTERNAL` for server faults.

### 3.5 Backwards Compatibility

The gRPC API uses **proto3 with explicit field presence** (the `optional` keyword on every nullable field). New fields are always added with new field numbers; deprecated fields are kept in the schema with a `deprecated = true` annotation. The agent and daemon are released in lockstep most of the time, but the protocol tolerates skew in either direction within one minor version.

A breaking change to the protocol bumps the package: `tundra.agent.v1` becomes `tundra.agent.v2`. During the transition, `tundrad` advertises both, and the agent picks the newer one it understands. Old agents continue speaking v1 against an old service alias on `tundrad` until they're upgraded.

---

## 4. WebSocket Surface — Live Events

The WebSocket channel multiplexes every real-time event for a single operator session over one connection.

### 4.1 Connection

```
GET /ws/v1/events?token=<session-token> HTTP/2
Upgrade: websocket
```

The `token` is the same JWT used for REST authentication. After upgrade, the server immediately sends a `welcome` frame containing the operator's id and the connection's session id (used for client-side reconnect logic).

### 4.2 Subscription Model

After connecting, the client subscribes to channels by sending JSON frames. The server responds with `subscribed` or `error`.

```json
// client → server
{ "subscribe": ["site:01H8XK0SITE000000000000001:logs"] }

// server → client
{ "subscribed": ["site:01H8XK0SITE000000000000001:logs"] }
```

Channel naming: `<resource>:<id>:<topic>`. Topics include `logs`, `events`, `metrics`. Wildcard subscriptions (e.g., `site:*:events`) are gated by the operator's RBAC scope — global subscriptions require a global role.

### 4.3 Event Frame Shape

Every event from the server carries this envelope:

```json
{
  "event_id": "evt_01H8XK0EVT0000000000000001",
  "channel": "site:01H8XK0SITE000000000000001:logs",
  "type": "log.line",
  "occurred_at": "2026-05-02T12:15:03.142Z",
  "data": {
    "level": "info",
    "line": "Started build...",
    "deployment_id": "01H8XK0DEP0000000000000008"
  }
}
```

The `event_id` is monotonic per session and used for client-side deduplication on reconnect (see §4.5). The `type` is the discriminator that the client switches on.

### 4.4 Event Catalog

The complete v1 event type set:

| Type                          | Channel                               | Payload                                  |
|-------------------------------|---------------------------------------|------------------------------------------|
| `welcome`                     | (initial frame)                       | operator info, server time               |
| `subscribed` / `unsubscribed` | (client-server response)              | channel list                             |
| `deploy.queued`               | `site:<id>:events`                    | deployment_id, trigger                   |
| `deploy.started`              | `site:<id>:events`, `deployment:<id>` | deployment_id                            |
| `deploy.stage`                | `deployment:<id>`                     | stage name (`fetching`, `building`, ...) |
| `deploy.log`                  | `deployment:<id>`                     | log line                                 |
| `deploy.succeeded`            | `site:<id>:events`, `deployment:<id>` | release_id, duration_ms                  |
| `deploy.failed`               | `site:<id>:events`, `deployment:<id>` | error code + message                     |
| `site.health.changed`         | `site:<id>:events`                    | new status                               |
| `site.tls.renewed`            | `site:<id>:events`                    | not_after timestamp                      |
| `server.metrics`              | `server:<id>:metrics`                 | cpu, mem, disk samples                   |
| `server.status.changed`       | `server:<id>:events`                  | new status                               |
| `log.line`                    | `site:<id>:logs`, `server:<id>:logs`  | level, line, source, ts                  |
| `alert.fired`                 | `alerts`                              | alert_id, severity, summary              |
| `alert.resolved`              | `alerts`                              | alert_id                                 |
| `migration.progress`          | `migration:<id>`                      | stage, progress percent                  |

New event types may be added freely (additive change). Clients tolerate unknown types by ignoring them.

### 4.5 Reconnection

On disconnect, the client reconnects with `?last_event_id=<id>`. The server replays all events from that point, up to a 5-minute window backed by Valkey. If `last_event_id` is too old, the server sends a `replay.gap` event and the client must re-fetch state via REST. This is the pattern the panel UI uses for graceful refresh after laptop sleep.

### 4.6 Backpressure

If a slow client falls behind (more than 256 buffered messages), the server drops oldest first and emits `backpressure` so the client knows to refetch. This protects `tundrad` from a misbehaving consumer's connection holding memory unbounded.

---

## 5. MCP Surface (Reference)

The MCP API is exposed by the optional `com.tundra.mcp-server` plugin and fully documented in `tundra-additional-core-plugins-v1.md` §4. Briefly:

- **stdio** transport for desktop AI agents (Claude Desktop, Cursor, Zed) — the MCP server is launched as a subprocess of the agent host.
- **HTTP Streamable** transport for web/cloud agents — bearer-token-authenticated, scope-limited.
- Four scopes: `mcp:read`, `mcp:write:safe`, `mcp:write`, `mcp:admin`.
- Per-session write toggle in addition to the token's scope ceiling.
- All tool invocations flow through the standard REST API client internally, so they preserve RBAC, audit, and validation.

The MCP server does not introduce a fourth API style; it adapts the existing REST surface for AI consumption, with an MCP-native tool catalog and prompt set.

---

## 6. Plugin API (Reference)

Plugins consume Tundra's host APIs (DB read/write, KV, HTTP, FS, secrets, events, jobs, locks) via the WIT-defined interface in `tundra-plugin-architecture-plan-v1.md` §5. This is not a network API — it's a function-call surface from inside the plugin sandbox to the host.

Plugins can also **expose** REST endpoints under `/api/v1/plugins/:plugin_id/...`. These are routed to the plugin's `http_handler` interface and subject to the plugin's declared HTTP capabilities. The plugin's URL scope is namespaced; a plugin cannot register a route outside `/api/v1/plugins/:plugin_id/`.

---

## 7. Design Principles

A few explicit principles that shape every endpoint in this spec:

**The REST shape is hand-curated, not generated from the database schema.** Endpoints model the domain operations the panel actually performs, not the database tables. A site is one resource even though it spans `sites`, `applications`, `releases`, `certificates` internally. This keeps the API stable as the schema evolves and avoids exposing internals as a public contract.

**Reads are cheap; writes are deliberate.** GET endpoints are idempotent, cacheable for short windows, and return rich denormalized shapes. POST/PATCH/DELETE endpoints are narrow, validated, audited, and idempotency-keyed. The asymmetry is intentional — the panel UI reads heavily and writes occasionally.

**Long-running work returns 202 + a stream.** Anything that takes more than ~500ms returns `202 Accepted` with the resource id and a WebSocket subscription URL. Synchronous "wait until done" REST endpoints are an anti-pattern that puts latency budgets in the wrong place; we don't ship them.

**Errors are rich enough to recover from.** Every error has a stable code, a context object, and an optional `request_id` that can be searched in `audit_log`. Errors that are recoverable (race, retryable failure) say so explicitly via the code.

**The protocol does not leak the implementation.** No SQL error messages, no Rust panic strings, no internal hostnames in API responses. A dedicated error-mapping layer in `tundrad-api` translates internal failures into the public error vocabulary.

**Compatibility is permanent within v1.** Once an endpoint ships, its request and response shape is frozen for the lifetime of v1. Improvements happen as additive changes; deprecations as documented warnings; breaking changes only at major version boundaries.

---

## 8. Document Control

| Version | Date     | Author         | Changes                                                                                                                                                                                                                                            |
|---------|----------|----------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| v1.0    | May 2026 | Al Amin Ahamed | Initial complete API specification. REST surface mapped end-to-end with representative endpoint specs, gRPC service map for control-plane↔agent, WebSocket event catalog, MCP and Plugin APIs cross-referenced. OpenAPI 3.1 spec-first discipline. |

**Companion Documents:**

- `tundra-technical-implementation-plan-v2.md` — primary architecture
- `tundra-database-schema-v1.md` — the schema this API serves
- `tundra-frontend-ui-spec-v1.md` — the principal REST consumer
- `tundra-plugin-architecture-plan-v1.md` — the plugin host API surface
- `tundra-additional-core-plugins-v1.md` — the MCP server contract
- `tundra-security-audit-v1.md` — threat model on this API surface
