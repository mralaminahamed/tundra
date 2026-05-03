# Tundra MCP Server — Integration Cookbook

> Worked examples. Concrete configs for the major AI hosts. Real conversations that show what "deploy via Claude" actually looks like end-to-end.
> Pair this with the operator guide for context and the spec for technical depth.

---

**Author:** Al Amin Ahamed
**GitHub:** [@mralaminahamed](https://github.com/mralaminahamed)
**X:** [@mralaminahamed](https://x.com/mralaminahamed)

**Document Version:** v1.0
**Document Date:** May 2026
**Status:** Reference Cookbook
**Audience:** Operators and developers wiring up specific AI hosts to Tundra
**Companions:** `tundra-mcp-server-spec-v1.md` (technical reference) and `tundra-mcp-server-operator-v1.md` (operator guide)

---

## 1. Before You Start

Every recipe in this cookbook assumes:

- The MCP plugin is enabled on your Tundra panel (**Settings → Plugins → AI Agents (MCP) → Enable**).
- You've minted a token with the right scope for what the recipe does (`tundra-mcp-server-operator-v1.md` §5 covers minting).
- For local stdio recipes: you have the `tundra` CLI installed and configured to point at your panel.

If you haven't done these, start with the operator guide and come back. The recipes below assume you arrive with a token in hand.

A couple of conventions used throughout:

- We write `https://panel.example.com` for your panel URL. Substitute your actual hostname.
- We write `ttok_readonly_...` etc. for token values. Substitute the actual token you got when minting.
- Lines like `> "show me my failing deploys"` represent what you'd type to the AI.
- Lines like `→ tool: list_sites` represent what the AI does in response. The exact phrasing varies by AI; the tool calls and outcomes don't.

---

## 2. Claude Desktop

### 2.1 Where the config lives

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

Quit Claude Desktop fully before editing; it caches the config at launch.

### 2.2 Minimal config (read-only)

```json
{
  "mcpServers": {
    "tundra": {
      "command": "tundra",
      "args": ["mcp", "serve", "--stdio", "--readonly"],
      "env": {
        "TUNDRA_API_TOKEN": "ttok_readonly_paste_yours_here",
        "TUNDRA_PANEL_URL": "https://panel.example.com"
      }
    }
  }
}
```

Open Claude Desktop. In any new conversation, the **🛠 Tools** indicator at the bottom of the input bar should show "1 server connected" — that's Tundra. Click it to inspect the available tools; you should see the read tools listed.

If the indicator shows "0 servers" or an error, see §10 (troubleshooting).

### 2.3 Write-capable config

For a session that needs to do mutations:

```json
{
  "mcpServers": {
    "tundra": {
      "command": "tundra",
      "args": ["mcp", "serve", "--stdio"],
      "env": {
        "TUNDRA_API_TOKEN": "ttok_write_paste_yours_here",
        "TUNDRA_PANEL_URL": "https://panel.example.com"
      }
    }
  }
}
```

The difference: no `--readonly`. The session starts in `write` mode, exposing the write tools (still subject to the token's scope ceiling).

### 2.4 Two configs side by side

Claude Desktop allows multiple MCP servers. You can register Tundra under different names with different tokens to switch contexts:

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

When you start a new conversation in Claude Desktop, both servers are advertised. The model decides which one to call based on what you ask. If you want to be explicit, mention "use the read-only Tundra" or "use the deploy Tundra" in your first message.

### 2.5 What it feels like

Once configured:

> "What sites do I have on the production server?"

The model calls `list_servers` to find which is "production," then `list_sites` filtered to that server, then summarises the result. You see the tool calls inline if you click the tool indicator.

> "Tail the logs on the api site for the last 5 minutes."

The model calls `tail_logs` with the right parameters. Output streams into the conversation.

> "Why did the last deploy fail?"

The model calls `list_sites`, picks the most recently-deployed one, calls `get_deployment_status` on its latest deploy, reads the build log resource, and offers a diagnosis.

If the model isn't sure which site you mean, it asks. ("There are three sites with 'api' in the name — `api.example.com`, `internal-api.example.com`, `api-staging.example.com`. Which?")

---

## 3. Claude Code

Claude Code is Anthropic's command-line agent. It speaks MCP natively.

### 3.1 Configuration

```bash
claude mcp add tundra \
    --command tundra \
    --args "mcp serve --stdio --readonly" \
    --env "TUNDRA_API_TOKEN=ttok_readonly_..." \
    --env "TUNDRA_PANEL_URL=https://panel.example.com"
```

Or edit `~/.config/claude/config.json` directly with the same `mcpServers` structure as Claude Desktop. (Claude Code reads the same config file shape.)

Verify:

```bash
claude mcp list
# tundra        Connected (5 tools available)
```

### 3.2 Use cases

Claude Code shines when you're already at the terminal and want an AI to operate on your Tundra:

```
$ claude
> i'm on call. show me anything red in the last 30 minutes.
```

The agent will use `get_audit_log` filtered to recent timestamps, `get_metrics` on each server, and possibly `list_certificates` checking for upcoming expiry. It produces a short report.

```
> nothing red, but rps on the api server is 4x normal. tail its logs.
```

The agent calls `tail_logs` and surfaces what's there.

```
> the spike correlates with this commit. is the deploy that introduced it still rolled out?
```

The agent calls `get_site` on the api site, reads `current_release_id`, calls `get_deployment_status`, and reports.

For a write-capable session in Claude Code:

```bash
claude mcp add tundra-deploy \
    --command tundra \
    --args "mcp serve --stdio" \
    --env "TUNDRA_API_TOKEN=ttok_write_..." \
    --env "TUNDRA_PANEL_URL=https://panel.example.com"
```

---

## 4. Cursor

Cursor speaks MCP natively as of late 2024.

### 4.1 Configuration

In Cursor: **Settings → Features → MCP → Add new server**.

Fill in:

- **Name:** `tundra`
- **Type:** `command`
- **Command:** `tundra`
- **Arguments:** `mcp serve --stdio --readonly`
- **Environment:**
  - `TUNDRA_API_TOKEN` = `ttok_readonly_...`
  - `TUNDRA_PANEL_URL` = `https://panel.example.com`

Or edit Cursor's `mcp.json` (path varies by version; search Cursor docs):

```json
{
  "mcpServers": {
    "tundra": {
      "command": "tundra",
      "args": ["mcp", "serve", "--stdio", "--readonly"],
      "env": {
        "TUNDRA_API_TOKEN": "ttok_readonly_...",
        "TUNDRA_PANEL_URL": "https://panel.example.com"
      }
    }
  }
}
```

### 4.2 Use cases

Cursor's strength is the IDE context. The Tundra MCP integration shines when the developer is already in the codebase:

> "I'm about to merge this PR. What's the current deploy status of this app on staging?"

The agent reads the project's `.git/config` to find the repo, calls `list_sites` to find a Tundra site whose source matches, calls `get_deployment_status` on the latest deploy. The developer sees the answer without leaving their editor.

> "After this merge lands, can you queue a deploy?"

In a write-capable session: the agent waits for the merge (Cursor knows the git state), then calls `deploy_site` with the new commit SHA.

> "Set the `STRIPE_KEY` env var to the value in 1Password://..."

Cursor's secret-manager integration combined with `set_environment_variable` makes this a one-liner from the IDE.

---

## 5. Zed

Zed has MCP support as of mid-2025.

### 5.1 Configuration

In `~/.config/zed/settings.json`:

```json
{
  "context_servers": {
    "tundra": {
      "command": {
        "path": "tundra",
        "args": ["mcp", "serve", "--stdio", "--readonly"],
        "env": {
          "TUNDRA_API_TOKEN": "ttok_readonly_...",
          "TUNDRA_PANEL_URL": "https://panel.example.com"
        }
      }
    }
  }
}
```

(Zed calls them "context servers" but the protocol is MCP.)

Restart Zed. In the agent panel, the Tundra tools should appear.

### 5.2 Use cases

Zed's agent is integrated with the editor's panel system; the MCP integration appears as another tool source. Same patterns as Cursor.

A Zed-specific pattern that works well: ask the agent to attach a Tundra resource to the conversation as context:

> "Attach the deploy log for the last build of the api site, then help me figure out why the build is slow."

The agent calls `get_deployment_status` to find the deployment ID, then attaches the resource `tundra://sites/.../deployments/.../log` as a read-only context to the conversation. The model now has the build log to reason about, alongside whatever code you've already pulled into the conversation.

---

## 6. Cloud Agents (HTTP transport)

For agents that don't run as a subprocess on your machine — cloud-hosted assistants, CI/CD pipeline integrations, custom agents using the MCP protocol — connect via the HTTP transport.

### 6.1 The endpoint

```
POST   https://panel.example.com/mcp
GET    https://panel.example.com/mcp           (SSE)
DELETE https://panel.example.com/mcp/sessions/:id
```

### 6.2 The handshake (curl)

```bash
TOKEN="ttok_readonly_..."

# 1. initialize
curl -X POST https://panel.example.com/mcp \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -H "X-Tundra-Mode: read" \
    -d '{
      "jsonrpc": "2.0",
      "id": 1,
      "method": "initialize",
      "params": {
        "protocolVersion": "2025-03-26",
        "capabilities": {},
        "clientInfo": {"name": "curl-recipe", "version": "0.1"}
      }
    }'

# Response includes Mcp-Session-Id header. Save it.

# 2. notifications/initialized
SESSION_ID="01H8XK0..."
curl -X POST https://panel.example.com/mcp \
    -H "Authorization: Bearer $TOKEN" \
    -H "Mcp-Session-Id: $SESSION_ID" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}'

# 3. list tools
curl -X POST https://panel.example.com/mcp \
    -H "Authorization: Bearer $TOKEN" \
    -H "Mcp-Session-Id: $SESSION_ID" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# 4. call a tool
curl -X POST https://panel.example.com/mcp \
    -H "Authorization: Bearer $TOKEN" \
    -H "Mcp-Session-Id: $SESSION_ID" \
    -H "Content-Type: application/json" \
    -d '{
      "jsonrpc": "2.0",
      "id": 3,
      "method": "tools/call",
      "params": {
        "name": "list_sites",
        "arguments": {"limit": 5}
      }
    }'

# 5. close
curl -X DELETE https://panel.example.com/mcp/sessions/$SESSION_ID \
    -H "Authorization: Bearer $TOKEN"
```

This sequence is everything an HTTP MCP client does, just unwrapped. Use it to verify your token works before pointing your real AI at it.

### 6.3 Streaming events (SSE)

For tools that stream output (`tail_logs --follow`, `deploy_site --wait`):

```bash
# Start the SSE stream first
curl -N https://panel.example.com/mcp \
    -H "Authorization: Bearer $TOKEN" \
    -H "Mcp-Session-Id: $SESSION_ID" \
    -H "Accept: text/event-stream"
# This connection stays open. Server pushes events as they happen.

# In another terminal, call the streaming tool
curl -X POST https://panel.example.com/mcp \
    -H "Authorization: Bearer $TOKEN" \
    -H "Mcp-Session-Id: $SESSION_ID" \
    -H "Content-Type: application/json" \
    -d '{
      "jsonrpc": "2.0",
      "id": 4,
      "method": "tools/call",
      "params": {
        "name": "tail_logs",
        "arguments": {"site_id": "...", "follow": true}
      }
    }'
# Tool call returns the result envelope; subsequent log lines stream on the SSE connection
```

### 6.4 Cloud-Claude (Anthropic console)

The Anthropic console's MCP integration uses the HTTP transport:

1. In the console, **Settings → MCP integrations → Add → Custom**.
2. **URL:** `https://panel.example.com/mcp`
3. **Auth:** `Authorization: Bearer ttok_readonly_...`
4. **Initial mode header:** `X-Tundra-Mode: read`

The console will run the handshake, list the tools, and you can use them in conversations.

For a write-capable cloud connection, change the mode header to `write` and ensure the token has `mcp:write` scope. Cloud connections from outside known IP ranges should always carry `--restrict-ip` on the token; it's the only enforcement boundary you have for cloud-hosted agents.

---

## 7. End-to-End: Deploy via Claude

A full conversation showing how a deploy goes from "should we ship?" to "shipped, here's what happened." Read-then-write pattern: start in read mode, escalate to write only when needed.

### 7.1 Setup

- One token: `claude-deploy`, scope `mcp:write`, TTL 7 days, restricted to your office IP.
- Configured in Claude Desktop, both as `tundra-readonly` (with `--readonly` flag) and `tundra-deploy` (without).

### 7.2 The conversation

> Me: "What's on the api site right now?"

Claude (using tundra-readonly):
- → `list_sites` filtered to the apex `api.example.com`
- → `get_site` on the resulting id
- → "The api site is on `production-fra-1`, currently serving release `rls_01H8...` deployed 3 hours ago from commit `a1b2c3d` on `main`. Health is healthy, last check 30 seconds ago."

> Me: "What's changed on `main` since that commit?"

Claude:
- → `get_audit_log` filtered to deployments on the site → finds the most recent successful deploy as a baseline
- (Claude's own knowledge: it can reach the GitHub MCP if also configured, or it asks me to share)
- → "Since `a1b2c3d`, there are 7 commits. Three are docs-only. Two refactor a service. One adds a new feature flag. One bumps a dependency."

> Me: "Read the deploy log for the last build. Was anything close to failing?"

Claude:
- → `get_deployment_status` to grab the build log resource URI
- → reads `tundra://sites/.../deployments/.../log`
- → "Build took 3m12s. The migration step took 1m41s of that — long but not failing. Test stage passed. No warnings I'd flag."

> Me: "OK, deploy."

Claude (now using tundra-deploy):
- → "I'll deploy `main` (which currently points at commit `f7g8h9i`). Confirm?"

> Me: "Yes."

Claude:
- → `deploy_site` with `site_id`, `ref: "main"`, `wait: true`
- → Streams progress: `queued` → `fetching` → `building` (with build log lines streamed in) → `deploying` → `health-checking` → `succeeded`
- → "Deploy `dep_01H9...` succeeded in 2m47s. New release is `rls_01H9...`. Health is green at 12 consecutive successful checks."

> Me: "What does the audit log say I just did?"

Claude (back on tundra-readonly):
- → `get_audit_log` filtered to actor=me, recent
- → "You — well, I, on your behalf via the `claude-deploy` token — triggered a deploy of api site at 11:47:13. Action: `site.deploy_triggered`. Outcome: success. The audit row also records that this came from MCP, the session id, and the token name."

The pattern: read mode for everything diagnostic. Write mode for the explicit mutation step. Read mode again for verification. Every step is in the audit log; every step has a tool call you can inspect.

---

## 8. End-to-End: Incident Response

The 2 AM scenario. Alert fires; you fumble for your laptop; you don't want to context-switch a hundred times.

### 8.1 Setup

- A pre-prepared `incident` token: scope `mcp:write`, TTL 24h, max-uses 200, restricted to your home IP.
- The token is normally **revoked**. When alerts fire, you mint a new one in seconds.

### 8.2 The conversation

> Me: "Alert: 5xx rate on the api site is over 5% for the last 3 minutes. Diagnose."

Claude:
- → `get_site` for api.example.com
- → `get_metrics` for site `rps`, `latency_p95_ms`, `5xx` for the last 30m, step 60s
- → "5xx is at 8% currently, started ramping at 02:11. Latency p95 jumped from 80ms to 420ms at the same moment. RPS hasn't changed."

> Me: "Logs?"

Claude:
- → `tail_logs` with site_id and `follow: true`
- → "Lots of `database connection refused` errors, all pointing at the postgres-1 server. This started 02:09."

> Me: "Is postgres-1 up?"

Claude:
- → `list_servers` filtered for `postgres-1`
- → `get_metrics` for postgres-1: CPU, memory, network
- → "Server is up but agent has been silent for the last 4 minutes — `agent_last_seen_at` is 02:08:53. CPU and memory frozen at the values from 02:08."

> Me: "Restart the agent."

Claude:
- → "I'll call `restart_service` on postgres-1, service name `tundra-agent`. Confirm?"

> Me: "Yes."

Claude:
- → `restart_service { server_id: "...", service: "tundra-agent" }`
- → "Restart issued. Health probe in 15s: agent connected. Postgres responding to local pings. 5xx rate on api site dropping: 8% → 3% → 0.4%."

> Me: "Open an incident ticket. Summarize what happened."

Claude:
- → `incident-response-runbook` prompt template, with site_id and severity=high
- → produces the runbook content with metrics, log slice, audit entries
- → optionally pipes that into a separate ticketing MCP if you have one

The patterns:

- The token is short-lived and IP-bound, so leaking it during the incident has bounded damage.
- The diagnosis is read-only; only one write call (the restart) is needed, and it's a safe-write operation.
- The audit log records both the diagnosis (read calls) and the action (write call), so the postmortem has the full sequence.

---

## 9. End-to-End: Routine Operations

A few smaller flows that fit the read-mode-default pattern.

### 9.1 Morning health check

> "Good morning. Anything I should look at?"

Claude:
- → `list_servers` (any with status != active)
- → `list_certificates` (any with `not_after < now() + 14d`)
- → `get_audit_log` for the last 12 hours, filtered to `outcome=error` or `outcome=denied`
- → `get_metrics` summary across servers
- → produces a brief: "Three things — postgres-1 had a 4-minute agent disconnect overnight (auto-recovered). The wildcard cert for `*.example.com` expires in 11 days; auto-renew is on but it's worth confirming. There's a spike of `denied` audit entries from a token named `claude-readonly` calling `delete_site`. The token doesn't have permission for that, so it's rejected — but the agent is asking, which is unusual."

The third item is exactly the kind of signal the operator should catch. Investigate the source of those denied calls; might be a misconfigured client, might be a leaked token.

### 9.2 Pre-merge environment check

Working on a PR; want to make sure the staging env vars match what the new code expects.

> "List the env vars on staging-api. I'll compare against the .env.example in the repo."

Claude:
- → `get_site` for staging-api → returns env var **keys only**
- → "There are 14 keys: `APP_KEY`, `DATABASE_URL`, `STRIPE_KEY`, ..."

> "The PR adds two new keys: `RESEND_API_KEY` and `BRAND_LOGO_URL`. Do they exist?"

Claude: "Neither exists on staging."

> "Set them. RESEND_API_KEY is in 1Password; BRAND_LOGO_URL is `https://cdn.example.com/logos/brand-2026.svg`."

In a write-capable session:
- → `set_environment_variable` for each
- → "Both set. Triggering a redeploy?"

> "Yes."

- → `deploy_site` for staging-api

### 9.3 Audit trail for review

A teammate asks: "Did anyone deploy the api site this week other than me?"

> "Show me all deploys to api.example.com from the last 7 days, with the actor for each."

Claude:
- → `get_audit_log { resource: "site:01H...api...", action: "site.deploy_triggered", since: "7d ago" }`
- → "Eleven deploys in the last 7 days. Eight by you, two by Bob, one by the `deploy-bot` token (which Alice owns)."

Reproducible; no ambiguity; the audit log is authoritative.

---

## 10. Troubleshooting

### 10.1 "0 servers connected" in the AI host

The MCP subprocess failed to start. Run it manually to see what's wrong:

```bash
TUNDRA_API_TOKEN="ttok_readonly_..." \
TUNDRA_PANEL_URL="https://panel.example.com" \
tundra mcp serve --stdio --readonly
```

It should print a JSON-RPC ready message on stderr and wait for input. If it errors:

- `command not found: tundra` — the `tundra` CLI isn't in the PATH the AI host runs subprocesses in. Use an absolute path in the config (`"command": "/usr/local/bin/tundra"`).
- `panel-url not configured` — set the env var explicitly in the config, don't rely on `tundra config`.
- `token rejected` — the token is wrong, expired, revoked, or has IP/client restrictions that exclude this connection. Mint a new one and try.
- `tls error: certificate not trusted` — the panel's TLS cert isn't trusted by the OS. Install the panel's chain or use a system that already trusts it.

### 10.2 "Tool not available" / "tool not found"

The agent tried to call a tool that doesn't exist in this session. Common reasons:

- Session is in `read` mode but the tool is a write tool. Switch the session to `write` mode (or omit `--readonly` from the args).
- Token scope doesn't include the tool's required scope. Mint a higher-scope token.
- The tool was disabled by the operator via the plugin config (`disable_tools = [...]`).

### 10.3 "Step-up required"

The agent tried an `mcp:admin` operation but the issuing operator hasn't fully signed in within the last 5 minutes. The error response includes a URL: open the panel, sign in fresh, then retry the agent's action.

### 10.4 "Rate limit exceeded"

The session hit its per-minute tool-call cap (default 60). Either wait a minute or, for a legitimate high-throughput use, raise the limit in plugin config (`rate_limit_per_session_rpm`). For a runaway agent, close the session.

### 10.5 SSE stream times out

Some HTTP intermediaries (load balancers, corporate proxies) close idle connections aggressively. The MCP server sends a heartbeat every 15s on the SSE channel for this reason; if your client still drops, check for a proxy with a shorter idle timeout in between.

### 10.6 The agent keeps confusing two sites

Refer to sites by their UUID, not their domain. The agent will resolve domains, but if you have `api.example.com` and `api-staging.example.com`, the model can guess wrong. In write-mode operations, the model should always confirm the site by UUID before acting.

A pattern that helps: paste the UUID in your prompt, or refer to a previously-mentioned UUID from earlier in the conversation. The agent will use it directly.

### 10.7 The tool call succeeded but I don't see the change

Some operations are asynchronous. `deploy_site` returns "queued" immediately; the actual deploy happens in the background. Use `wait: true` on the input to block until terminal, or follow up with `get_deployment_status`. The MCP page also shows in-flight deploys live.

For changes that should be immediate (env var update, service restart), check the audit log filtered to the action — it'll tell you the outcome with timestamps.

---

## 11. Patterns That Work Well

### 11.1 Read-mode default

Configure each AI host's primary Tundra connection in read mode. Add a separate write-mode connection only if you need it. When you accidentally ask "deploy this," the read-mode connection refuses; the write-mode one acts. The friction is intentional.

### 11.2 Per-purpose tokens

Don't have one big token that does everything. Have small tokens with descriptive names:

- `claude-readonly` — daily-driver read access
- `cursor-deploys` — write token for IDE-driven deploys
- `incident-2026-05-02` — short-lived, high-scope, revoked when the incident ends
- `ci-pipeline` — long-lived but restricted by IP and max-uses

### 11.3 Confirmation prompts in writeable sessions

Even in write mode, the model should confirm destructive operations conversationally. Most agents do this by default. If yours doesn't, ask: "Always confirm destructive operations before running them." It will, and the audit log will record both the conversation context and the explicit confirmation.

### 11.4 Pipe MCP outputs into other MCPs

If you have multiple MCP servers — say, GitHub via its own server, plus Tundra — agents can compose them:

> "Look at the latest PR on the api repo. If it's been approved, deploy the head commit to staging."

The agent pulls the PR state from GitHub MCP, then calls `deploy_site` on Tundra MCP. The audit log on each side records its part. This composition is exactly the kind of workflow MCP was designed for.

### 11.5 Resources for sustained context

When you're going to ask the agent multiple questions about a site, attach the site's recent logs as a resource at the start of the conversation. The agent has it as context throughout, no need to re-tail. Same for deploy logs during a deploy postmortem — attach them as a resource and discuss.

```
> "Attach the recent logs and the last deploy log for api.example.com, then let's debug the slowdown."
```

The model uses `resources/list` to find the relevant URIs and `resources/read` to attach.

---

## 12. Cookbook Patterns by Use Case

### 12.1 "I want a daily-driver assistant"

- One `mcp:read` token per person (`claude-<username>`), 30-day TTL.
- One Claude Desktop / Claude Code / Cursor configuration in read-only mode.
- No write tokens unless you decide later you want them.

### 12.2 "I want CI/CD to push deploys"

- One `mcp:write` token (`ci-deploys`), restricted by IP to the CI provider's egress range, max 1000 uses, 30-day TTL.
- The CI workflow uses `curl` against `/mcp` directly, or a small `tundra mcp` CLI invocation in a job step.
- Rotate every 30 days; calendar reminder.

### 12.3 "I want incident response automation"

- A pre-prepared token mint command, ready to run when an incident fires (`tundra mcp tokens create ...`).
- Restrict to the responder's IP; max-uses 200; TTL 24h.
- Revoke after the incident closes.
- Incident postmortem cites the audit log filtered to the token.

### 12.4 "I want occasional cloud-Claude diagnostics"

- A long-lived `mcp:read` token bound to specific cloud-Claude IP ranges (per Anthropic's published egress).
- Cloud console configured with the panel's `/mcp` URL and the token.
- Watch the MCP page periodically for unexpected sessions.

### 12.5 "I want a dev to be able to deploy from their editor"

- One `mcp:write` token per dev (`<name>-deploys`), TTL 30d, max-uses generous (1000+).
- Cursor or Zed configured with that token.
- The dev gets a refresh email 7 days before expiry.

---

## 13. Cross-References

- `tundra-mcp-server-spec-v1.md` — the technical reference behind every pattern in this cookbook
- `tundra-mcp-server-operator-v1.md` — the operator framing: scopes, minting, the settings page, audit habits
- `tundra-acceptance-checklist-v1.md` — the routine that includes verifying MCP works after upgrades
- `tundra-additional-core-plugins-v1.md` §3 — the GitHub plugin, useful for the "PR + deploy" composition in §11.4

---

## 14. Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.0 | May 2026 | Al Amin Ahamed | Initial integration cookbook. Worked configurations for Claude Desktop, Claude Code, Cursor, Zed, cloud agents over HTTP. End-to-end conversations: deploy via Claude, incident response, routine ops (morning health check, pre-merge env, audit review). Troubleshooting recipes, patterns by use case. |
