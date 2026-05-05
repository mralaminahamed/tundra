# Tundra — API Reference

REST API quick reference for integrators. Covers auth, errors, pagination, all endpoints, and WebSocket events. Full spec: `proto/openapi.yaml`.

---

## Base URL

```
https://panel.example.com/api/v1
```

All endpoints are versioned under `/api/v1`. The version increments only on breaking changes; additive changes (new fields, new endpoints) ship in `v1` indefinitely.

---

## Authentication

### Session (browser/panel)

Session cookie set at login. CSRF header required on state-changing requests:
```
X-CSRF-Token: <token-from-session>
```

### API token (integrations)

Create tokens at: **Settings → API Tokens**

```
Authorization: Bearer tnd_prod_<your-token>
```

Token format: `tnd_<env>_<random>`. Only the SHA-256 hash is stored — tokens cannot be recovered after creation.

---

## Error format

Every error is a JSON object:

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

| HTTP status | Meaning                                       |
|-------------|-----------------------------------------------|
| 400         | Validation error                              |
| 401         | Missing or invalid auth                       |
| 403         | Authorized but not permitted                  |
| 404         | Resource not found                            |
| 409         | State conflict (e.g., deploy already running) |
| 422         | Semantic validation failure                   |
| 429         | Rate limit exceeded                           |
| 5xx         | Server fault                                  |

---

## Pagination

List endpoints use cursor pagination:

```
GET /api/v1/sites?limit=50&cursor=eyJpZCI6Ij...
```

Response:
```json
{
  "data": [...],
  "next_cursor": "eyJpZCI6Ij...",
  "total_estimate": 4218
}
```

`limit` defaults to 25, max 200. `next_cursor` absent = end of results.

---

## Idempotency

State-changing requests accept an optional idempotency key:

```
Idempotency-Key: <unique-uuid>
```

Repeat with the same key within 24 hours returns the cached response unchanged. Required for deploy triggers and billing-adjacent operations.

---

## Servers

### List servers

```
GET /api/v1/servers
```

Response: `{ data: Server[] }`

### Get server

```
GET /api/v1/servers/{id}
```

### Enroll server

```
POST /api/v1/servers
```

Body:
```json
{
  "name": "production-01",
  "hostname": "vps.example.com"
}
```

### Delete server

```
DELETE /api/v1/servers/{id}
```

Requires step-up auth (MFA re-confirmation within the last 5 minutes).

---

## Sites

### List sites

```
GET /api/v1/sites
GET /api/v1/sites?server_id={id}
```

Response: `{ data: Site[] }`

Each `Site` includes:
- `id`, `name`, `primary_domain`, `document_root`, `status`
- `server_id`
- `source_kind`: `"github" | "gitlab" | "blank" | "template" | "tarball" | null`
- `source_config`: `{ branch?: string, template_id?: string } | null`
- `created_at`, `updated_at` (ISO 8601)

### Get site

```
GET /api/v1/sites/{id}
```

### Create site

```
POST /api/v1/sites
```

Body:
```json
{
  "name": "my-site",
  "primary_domain": "example.com",
  "server_id": "01H...",
  "application": {
    "kind": "nodejs",
    "runtime_version": "22",
    "build_command": "npm ci && npm run build",
    "start_command": "node dist/index.js",
    "listen_port": 3000,
    "health_check_path": "/",
    "source_kind": "template",
    "source_config": {
      "branch": "main",
      "template_id": "nextjs"
    }
  }
}
```

`source_kind` values: `"blank"`, `"github"`, `"gitlab"`, `"template"`. When `"template"`, set `source_config.template_id` to the template ID.

### Delete site

```
DELETE /api/v1/sites/{id}
```

---

## Deployments

### List deployments

```
GET /api/v1/sites/{site_id}/deployments
```

### Get deployment

```
GET /api/v1/deployments/{id}
```

### Trigger deployment

```
POST /api/v1/sites/{site_id}/deployments
```

Body:
```json
{
  "branch": "main"
}
```

---

## Templates

### List templates

```
GET /api/v1/templates
```

Returns all built-in templates plus any templates contributed by enabled plugins. Response:

```json
{
  "data": [
    {
      "id": "nextjs",
      "name": "Next.js",
      "description": "React framework with SSR/SSG.",
      "version": "1.0.0",
      "icon": "nextjs",
      "runtime": { "kind": "nodejs", "version": "22" },
      "source": { "kind": "skeleton" },
      "build_command": "npm ci && npm run build",
      "start_command": "node .next/standalone/server.js",
      "listen_port": 3000,
      "tags": ["nodejs", "react", "ssr"],
      "env": {},
      "post_create": []
    }
  ]
}
```

WordPress and WooCommerce templates appear only when the WordPress plugin is enabled.

---

## Databases

### List databases

```
GET /api/v1/databases
GET /api/v1/databases?server_id={id}
```

### Create database

```
POST /api/v1/databases
```

Body:
```json
{
  "name": "mydb",
  "kind": "postgresql",
  "server_id": "01H...",
  "user": "myuser"
}
```

`kind`: `"postgresql"`, `"mysql"`, `"mariadb"`, `"valkey"`

---

## Backups

### List backups

```
GET /api/v1/backups?server_id={id}
```

### Trigger backup

```
POST /api/v1/servers/{id}/backups
```

### Restore preview

```
POST /api/v1/backups/{id}/restore-preview
```

Returns a diff of what will change. Confirm by calling the restore endpoint.

### Restore

```
POST /api/v1/backups/{id}/restore
```

Body: `{ "confirmed": true }`

---

## Plugins

### List installed plugins

```
GET /api/v1/plugins
```

Response: `{ data: { plugin_id: string, name: string, state: "enabled" | "disabled", tier: string }[] }`

### List available plugins

```
GET /api/v1/plugins/available
```

Returns the full plugin catalog (installed and not-yet-installed).

### Enable plugin

```
POST /api/v1/plugins/{id}/enable
```

### Disable plugin

```
POST /api/v1/plugins/{id}/disable
```

---

## WordPress (requires WordPress plugin)

### List WordPress installations

```
GET /api/v1/wordpress/installations
```

### Create installation

```
POST /api/v1/wordpress/installations
```

Body:
```json
{
  "site_id": "01H...",
  "admin_user": "admin",
  "admin_email": "admin@example.com",
  "site_title": "My WordPress Site"
}
```

### Get installation

```
GET /api/v1/wordpress/installations/{id}
```

### Remove installation

```
DELETE /api/v1/wordpress/installations/{id}
```

Sets state to `removing`; the agent cleans files on the next reconcile cycle.

### List plugins

```
GET /api/v1/wordpress/installations/{id}/plugins
```

### Install plugin

```
POST /api/v1/wordpress/installations/{id}/plugins
```

Body: `{ "slug": "woocommerce" }`

### Remove plugin

```
DELETE /api/v1/wordpress/installations/{id}/plugins/{slug}
```

### List themes

```
GET /api/v1/wordpress/installations/{id}/themes
```

### Install theme

```
POST /api/v1/wordpress/installations/{id}/themes
```

Body: `{ "slug": "twentytwentyfive", "activate": true }`

### Activate theme

```
POST /api/v1/wordpress/installations/{id}/themes/{slug}/activate
```

### Remove theme

```
DELETE /api/v1/wordpress/installations/{id}/themes/{slug}
```

---

## DNS & Mail

### List domains

```
GET /api/v1/domains
```

### Create DNS record

```
POST /api/v1/domains/{domain}/dns-records
```

Body:
```json
{
  "type": "A",
  "name": "@",
  "content": "203.0.113.1",
  "ttl": 300
}
```

### List mailboxes

```
GET /api/v1/domains/{domain}/mailboxes
```

### Create mailbox

```
POST /api/v1/domains/{domain}/mailboxes
```

Body: `{ "local_part": "alice", "password": "..." }`

---

## MCP tokens (requires MCP plugin)

### List tokens

```
GET /api/v1/mcp/tokens
```

### Create token

```
POST /api/v1/mcp/tokens
```

Body:
```json
{
  "description": "Claude Desktop read-only",
  "scope": "mcp:read",
  "expires_in_days": 30
}
```

### Revoke token

```
DELETE /api/v1/mcp/tokens/{id}
```

---

## WebSocket events

Connect to receive real-time events:

```
wss://panel.example.com/ws/v1/events?token=<session-token>
```

Subscribe to a channel after connecting:
```json
{ "op": "subscribe", "channel": "site:01H...:logs" }
{ "op": "subscribe", "channel": "deployment:01H..." }
{ "op": "subscribe", "channel": "server:01H...:metrics" }
```

Events arrive as:
```json
{ "channel": "deployment:01H...", "event": "deploy.progress", "data": { ... } }
```

See `docs/01-architecture/tundra-api-specification-v1.md` §3 for the full event catalog.

---

## Rate limits

| Principal                    | Default     | Burst |
|------------------------------|-------------|-------|
| Authenticated user (session) | 120 req/min | 200   |
| API token                    | 60 req/min  | 100   |
| MCP session                  | 30 req/min  | 50    |
| Unauthenticated              | 20 req/min  | 30    |

`Retry-After` header is set on 429 responses.

---

## Full spec

`proto/openapi.yaml` — OpenAPI 3.1 spec, the authoritative contract. Implementation divergences from spec are a bug.
