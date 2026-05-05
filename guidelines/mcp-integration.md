# Tundra — MCP Integration

Integration guide: connect AI agents (Claude Desktop, Claude Code, Cursor, Zed) to your Tundra panel via the Model Context Protocol.

---

## What the MCP server does

The MCP server lets an AI agent call Tundra's management API using natural language:

- "Show me the failing deploys on the production server."
- "Tail the logs on the API site for the last 5 minutes."
- "Deploy the latest commit on main to api.example.com."
- "What TLS certificates expire in the next 30 days?"

It's a plugin that ships with Tundra but is **disabled on a fresh install**. Until you enable it, no AI agent can connect.

---

## Enable the plugin

**Panel:** Plugins → AI Agents (MCP) → Enable

Or via CLI:
```bash
tundra plugin enable com.tundra.mcp-server
```

Once enabled, the MCP endpoint is live at `https://<your-panel-host>/mcp`. The stdio mode is available via `tundra mcp serve --stdio`.

Nothing changes for end users until you mint a token.

---

## Mint a token

Every AI agent needs a token. Tokens have an explicit scope, an expiry, and optional restrictions. You mint them; they don't auto-issue.

**Panel:** Settings → AI Agents (MCP) → New Token

**CLI:**
```bash
tundra mcp token create \
  --scope mcp:read \
  --expires-in 30d \
  --description "Claude Desktop read-only"
```

The token is shown once. Copy it. Store it securely — Tundra stores only the SHA-256 hash.

### Scopes

| Scope | What the agent can do |
|-------|-----------------------|
| `mcp:read` | List and read — sites, servers, deployments, logs, metrics, audit log. Cannot change anything. |
| `mcp:write:safe` | Read + low-impact reversible writes: restart service, clear cache, retry job, renew TLS cert, force health check. |
| `mcp:write` | Read + all mutations: create sites, trigger deploys, modify env vars, run backups. |
| `mcp:admin` | Full access including user management, token issuance, plugin management. |

Start with `mcp:read`. Upgrade scope only when you've seen how the agent behaves.

### Revoke a token

```bash
tundra mcp token revoke <token-id>
```

Or via panel: Settings → AI Agents (MCP) → (token) → Revoke.

---

## Claude Desktop

### Config file location

| OS      | Path                                                              |
|---------|-------------------------------------------------------------------|
| macOS   | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux   | `~/.config/Claude/claude_desktop_config.json`                     |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json`                     |

Quit Claude Desktop fully before editing.

### Read-only setup

```json
{
  "mcpServers": {
    "tundra": {
      "command": "tundra",
      "args": ["mcp", "serve", "--stdio", "--readonly"],
      "env": {
        "TUNDRA_API_TOKEN": "your-token-here",
        "TUNDRA_PANEL_URL": "https://panel.example.com"
      }
    }
  }
}
```

After saving, open a new Claude Desktop conversation. The **Tools** indicator at the bottom should show "1 server connected."

### Write-capable setup

Remove `--readonly` to start sessions in write mode:

```json
{
  "mcpServers": {
    "tundra": {
      "command": "tundra",
      "args": ["mcp", "serve", "--stdio"],
      "env": {
        "TUNDRA_API_TOKEN": "your-write-token-here",
        "TUNDRA_PANEL_URL": "https://panel.example.com"
      }
    }
  }
}
```

### Two configs side by side

You can register Tundra under different names with different tokens — useful for keeping a daily-use read-only context and a separate deploy context:

```json
{
  "mcpServers": {
    "tundra-readonly": {
      "command": "tundra",
      "args": ["mcp", "serve", "--stdio", "--readonly"],
      "env": {
        "TUNDRA_API_TOKEN": "ttok_readonly_...",
        "TUNDRA_PANEL_URL": "https://panel.example.com"
      }
    },
    "tundra-deploy": {
      "command": "tundra",
      "args": ["mcp", "serve", "--stdio"],
      "env": {
        "TUNDRA_API_TOKEN": "ttok_write_...",
        "TUNDRA_PANEL_URL": "https://panel.example.com"
      }
    }
  }
}
```

---

## Claude Code

Claude Code speaks MCP natively via `claude mcp add`.

```bash
claude mcp add tundra \
  --command tundra \
  --args "mcp,serve,--stdio" \
  --env TUNDRA_API_TOKEN=your-token-here \
  --env TUNDRA_PANEL_URL=https://panel.example.com
```

For read-only:
```bash
claude mcp add tundra-readonly \
  --command tundra \
  --args "mcp,serve,--stdio,--readonly" \
  --env TUNDRA_API_TOKEN=your-readonly-token \
  --env TUNDRA_PANEL_URL=https://panel.example.com
```

Verify the server is registered:
```bash
claude mcp list
```

Claude Code will call Tundra tools automatically when you ask about your servers, sites, or deployments in any session where the MCP server is active.

---

## Cursor

Add to `.cursor/mcp.json` in your project, or to the global Cursor MCP config:

```json
{
  "mcpServers": {
    "tundra": {
      "command": "tundra",
      "args": ["mcp", "serve", "--stdio"],
      "env": {
        "TUNDRA_API_TOKEN": "your-token-here",
        "TUNDRA_PANEL_URL": "https://panel.example.com"
      }
    }
  }
}
```

---

## HTTP transport (for remote agents)

If the AI agent runs on a different machine than the `tundra` CLI:

```
https://panel.example.com/mcp
```

Pass the token as a Bearer header:
```
Authorization: Bearer your-token-here
```

HTTP transport supports full streaming via Server-Sent Events. Use it for agents that can't run a local subprocess (hosted AI platforms, custom automation).

---

## Session modes

Even with a write-capable token, the session mode determines what the agent can actually do:

| Mode    | What's available                                   |
|---------|----------------------------------------------------|
| `read`  | Read-only tools only, regardless of token scope    |
| `write` | Read + write tools up to the token's scope ceiling |

The double-gating is intentional: a daily-use assistant can carry a `mcp:write` token but start in `read` mode, switching to `write` only when you explicitly ask it to make changes.

Token = who may do what. Session = what's active right now.

---

## Available tools (read scope)

| Tool                    | What it does                                      |
|-------------------------|---------------------------------------------------|
| `list_servers`          | List all managed servers                          |
| `get_server`            | Server details + current status                   |
| `list_sites`            | List sites, optionally filtered by server         |
| `get_site`              | Site details including application config         |
| `list_deployments`      | Deployment history for a site                     |
| `get_deployment_status` | Status + progress of a specific deployment        |
| `tail_logs`             | Stream recent site or server logs                 |
| `list_databases`        | List databases on a server                        |
| `list_backups`          | List available backups                            |
| `get_metrics`           | Server or site metrics (CPU, RAM, disk, requests) |
| `list_certificates`     | TLS certificate status and expiry                 |
| `list_alerts`           | Active and recent alert events                    |
| `get_audit_log`         | Recent audit log entries                          |
| `list_plugins`          | Installed plugins and their state                 |

Additional write tools become available with `mcp:write:safe` and `mcp:write` scopes. See `docs/06-mcp-server/tundra-mcp-server-spec-v1.md` for the full tool catalog.

---

## Example conversations

**Diagnostics:**
> "Why did the last deploy on api.example.com fail?"

The agent calls `list_sites`, finds the site, calls `list_deployments` for the latest, reads the build log, and summarizes the error.

**Monitoring:**
> "Are any TLS certificates expiring in the next 14 days?"

Calls `list_certificates` with an expiry filter, lists the results with days-remaining.

**Deployment (write scope):**
> "Deploy the latest commit on main to api.example.com."

Calls `get_site` to confirm the site exists, then `trigger_deploy` with `branch: main`. Streams the build log until completion.

**Fleet overview:**
> "Give me a health summary for all my servers."

Calls `list_servers`, then `get_metrics` for each, then presents a summary table.

---

## Troubleshooting

**"0 servers connected" in Claude Desktop**
- Check the config file path and JSON syntax
- Ensure the `tundra` CLI is in your `$PATH` (`which tundra`)
- Test manually: `TUNDRA_API_TOKEN=... TUNDRA_PANEL_URL=... tundra mcp serve --stdio`

**401 on every tool call**
- Token may be expired or revoked — check `tundra mcp token list`
- Ensure the token's scope covers what you're trying to do

**Tools present but mutations fail with 403**
- Session started in `--readonly` mode, or token scope is `mcp:read`
- Mint a new token with `mcp:write` and remove `--readonly`

**Full reference:** `docs/06-mcp-server/tundra-mcp-server-operator-v1.md` and `docs/06-mcp-server/tundra-mcp-server-cookbook-v1.md`
