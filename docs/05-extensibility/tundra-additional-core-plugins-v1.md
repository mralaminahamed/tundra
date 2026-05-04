# Tundra — Additional Core Plugins Specification

> **Three additional core plugins joining the v1.0 release:**
> Namecheap registrar integration, GitHub integration, and MCP Server for AI agent connectivity.
> All three implement the plugin contract defined in `tundra-plugin-architecture-plan-v1.md`.

---

**Author:** Al Amin Ahamed
**GitHub:** [@mralaminahamed](https://github.com/mralaminahamed)
**X:** [@mralaminahamed](https://x.com/mralaminahamed)

**Document Version:** v1.0
**Document Date:** May 2026
**Companion to:** `tundra-plugin-architecture-plan-v1.md`, `tundra-technical-implementation-plan-v2.md`
**Status:** Implementation-Ready Specification
**Replaces:** N/A (additive)

---

## 1. Executive Summary

This document specifies three additional core plugins for Tundra v1.0, joining the Plesk Migration plugin already specified in `tundra-plesk-migration-plan-v1.md`:

1. **Namecheap Integration** (`com.tundra.namecheap`) — connect a Namecheap account once, manage every domain registered there directly from Tundra: nameservers, DNS records, contact info, transfer locks, renewals, WHOIS privacy.
2. **GitHub Integration** (`com.tundra.github`) — connect a GitHub account or organization once via the Tundra GitHub App, then deploy any accessible repository (public or private) without copy-pasting URLs or manually configuring deploy keys per site.
3. **MCP Server** (`com.tundra.mcp-server`) — expose Tundra's capabilities to AI agents (Claude Desktop, Claude Code, Cursor, Zed, ChatGPT, custom agents) over the Model Context Protocol, supporting both local stdio and remote Streamable HTTP transports, with role-scoped tokens that operators control per session.

All four plugins (Plesk migration + the three in this document) ship as **core plugins** — statically linked into `tundrad`, full trust, optional via build feature flags but enabled in the default install.

### 1.1 Why These Three

The technical implementation plan promises Tundra makes infrastructure work *easy* and *handy*. Two operator workflows define that promise more than any other:

- **"I bought a domain. Now what?"** — In Plesk and cPanel, the operator manually enters the domain, manually copies nameservers from the panel back to the registrar, manually waits for propagation, manually configures every DNS record. Tundra collapses this to: connect Namecheap once, then `tundra domain register example.com` does everything.
- **"Deploy this repo to that subdomain."** — In Plesk and Ploi, the operator copies a repository URL, generates a deploy key in the panel, copies it back to GitHub as a deploy key, configures a webhook URL on GitHub, configures it again on the panel. Tundra collapses this to: connect GitHub once, then `tundra site create --repo my-org/my-app` reads the operator's authorized repos and configures everything end-to-end.

The MCP server plugin is the third leg of that "make things handy" stool: AI agents become a legitimate operator interface alongside CLI and UI. An operator can ask Claude Desktop "deploy the latest commit on `my-org/my-app` to staging and tail the logs" and have it work — the agent uses Tundra's MCP tools to execute the steps a human would, with the operator's policy gates intact.

### 1.2 Trust Tier Justification

All three are core (native) plugins, not third-party WASM. The reasoning differs per plugin:

| Plugin     | Why core (not third-party WASM)                                                                                                                                                                                                                                         |
|------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Namecheap  | Holds a registrar API token that controls billing, transfers, and ownership of domains worth real money. Compromise of this token is a high-severity event. The shorter chain of custody (first-party code, signed releases, native execution) materially reduces risk. |
| GitHub     | Holds a GitHub App private key with installation access to potentially hundreds of repositories. Same trust calculus as Namecheap — the blast radius from key compromise warrants the highest trust tier.                                                               |
| MCP Server | Has read access to most of the panel database to answer AI queries. Has callable references to nearly every Tundra mutation API. The plugin literally **is** an authorization boundary — and security-critical authorization boundaries belong in core.                 |

Each plugin's permissions are still scoped through the same capability system third-party plugins use. Being core means the plugin code itself is reviewed and signed by the Tundra project; it does not mean the plugin can ignore the permission system.

---

## 2. Plugin 1 — Namecheap Integration

### 2.1 Plugin Identity

```toml
id = "com.tundra.namecheap"
name = "Namecheap"
version = "1.0.0"
author = "Tundra Team"
license = "Apache-2.0"
tier = "core"
kind = "native"
official = true
tundra_min_version = "1.0.0"
description = """
Connect a Namecheap account to Tundra. Manage domain registrations, nameserver
configuration, DNS records, contact information, transfer locks, WHOIS privacy,
and auto-renewal across every domain in the account, without leaving the panel.
"""
```

### 2.2 What It Does

| Capability                      | Detail                                                                                                                         |
|---------------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| Domain inventory                | Lists every domain in the connected Namecheap account; auto-imports them as Tundra `Domain` records                            |
| Nameserver management           | Set, swap, validate nameservers per domain. Default action when a domain becomes Tundra-managed: point NS at Tundra's PowerDNS |
| DNS records (Namecheap-hosted)  | Read, create, update, delete A/AAAA/CNAME/MX/TXT/SRV/CAA/ALIAS records via the Namecheap Domains API                           |
| Glue records                    | Create, update, delete glue records (host registration) for vanity nameservers                                                 |
| Domain registration             | Search availability, register new domains directly from Tundra; supports all TLDs Namecheap offers                             |
| Domain transfer                 | Initiate and monitor inbound transfers; auth-code retrieval                                                                    |
| Auto-renewal                    | Toggle auto-renewal per domain; renewal alerts at T-30, T-7, T-1 days                                                          |
| WHOIS privacy                   | Toggle WHOIS privacy per domain                                                                                                |
| Contact information             | View and update registrant/admin/tech/billing contacts                                                                         |
| Transfer lock                   | Toggle transfer (registrar) lock per domain                                                                                    |
| Email forwarding (Namecheap MX) | List and manage Namecheap's free email-forwarding service                                                                      |
| URL forwarding                  | List and manage Namecheap's URL-redirect service                                                                               |

### 2.3 The Killer Workflow

```bash
# One-time setup
tundra plugin grant com.tundra.namecheap
tundra namecheap connect --api-user mralaminahamed --api-key <key> --client-ip <whitelisted-ip>

# Inventory: pulls every domain, creates Tundra Domain records
tundra namecheap sync

# From now on:
tundra domain register example.com --years 2 --auto-renew
tundra domain example.com nameservers --use-tundra      # one command, NS swap done at registrar
tundra domain example.com transfer-in --auth-code AB123CD
tundra domain example.com privacy on
tundra domain example.com lock on
```

In the UI: a dedicated "Namecheap" page under "Domains > Registrars" with the full account inventory, expiry timeline, and bulk-action toolbar. When a Tundra `Site` is created on a Tundra-managed domain, the panel offers a single "Use Tundra DNS for this domain" button that handles the registrar-side NS update without the operator switching tabs.

### 2.4 Capabilities Requested

```toml
[[capabilities]]
kind = "net"
hosts = ["api.namecheap.com", "api.sandbox.namecheap.com"]
max_rpm = 60
max_bytes_per_request = 1_048_576

[[capabilities]]
kind = "secret"
names = [
  "namecheap.api-user",
  "namecheap.api-key",
  "namecheap.client-ip",       # Namecheap requires the calling IP to be on a server-side whitelist
]

[[capabilities]]
kind = "db-read"
tables = ["domains", "dns_zones", "dns_records", "operators"]

[[capabilities]]
kind = "db-write"
tables = [
  "domains",                   # may create Domain rows on sync
  "dns_zones",                 # may create zones for newly registered domains
  "dns_records",               # mirrors Namecheap-hosted records when DNS stays on Namecheap
  "plugin_namecheap_state",    # plugin-owned (see §2.6)
]

[[capabilities]]
kind = "events-subscribe"
events = [
  "domain.created",
  "domain.deleted",
  "dns.zone.published",        # tells the plugin to update NS at Namecheap when Tundra publishes a zone
]

[[capabilities]]
kind = "events-publish"
events = [
  "namecheap.sync.started",
  "namecheap.sync.completed",
  "namecheap.sync.failed",
  "namecheap.domain.expiring-soon",
  "namecheap.domain.renewed",
  "namecheap.domain.transferred-in",
]

[[capabilities]]
kind = "background-jobs"
max_concurrent = 4
```

### 2.5 Contributions

```toml
[[contributes]]
kind = "registrar"
slug = "namecheap"
display_name = "Namecheap"
supported_operations = ["inventory", "register", "transfer-in", "renew",
                        "set-nameservers", "set-contacts", "set-privacy",
                        "set-lock", "set-auto-renew", "dns-records"]

[[contributes]]
kind = "cli-subcommand"
verb = "namecheap"
help = "Manage the connected Namecheap account"
subcommands = [
  { verb = "connect",   help = "Connect a Namecheap API account" },
  { verb = "disconnect",help = "Disconnect the Namecheap account" },
  { verb = "sync",      help = "Re-inventory all domains from Namecheap" },
  { verb = "search",    help = "Check domain availability" },
  { verb = "list",      help = "List all Namecheap-managed domains" },
  { verb = "status",    help = "Show plugin and connection health" },
]

[[contributes]]
kind = "http-route"
method = "POST"
path = "/connect"
auth = "operator-session"

[[contributes]]
kind = "http-route"
method = "POST"
path = "/sync"
auth = "operator-session"

[[contributes]]
kind = "http-route"
method = "GET"
path = "/domains"
auth = "operator-session"

# ... full list of routes elided for brevity

[[contributes]]
kind = "ui-page"
parent = "domains"
id = "registrars-namecheap"
title = "Namecheap"
icon = "Globe"
spec_path = "ui/pages/namecheap.json"

[[contributes]]
kind = "scheduled-job"
name = "namecheap-sync"
cron = "0 */6 * * *"           # every 6 hours
help = "Reconcile Tundra domain state with Namecheap"

[[contributes]]
kind = "scheduled-job"
name = "namecheap-expiry-alerts"
cron = "0 9 * * *"             # daily at 09:00 UTC
help = "Check domains for upcoming expiry; emit events"
```

The `registrar` contribution is itself a new extension point — adding a future Cloudflare Registrar, Porkbun, or GoDaddy bundled plugin only requires implementing the `registrar` interface, and the rest of the system (UI tabs, CLI verbs, sync jobs) Just Works.

### 2.6 Plugin-Owned Schema

```sql
CREATE TABLE plugin_namecheap_state (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    domain_id           BIGINT NOT NULL REFERENCES domains(id) ON DELETE CASCADE UNIQUE,
    namecheap_id        TEXT,                       -- their numeric ID
    is_premium          BOOLEAN NOT NULL DEFAULT FALSE,
    is_locked           BOOLEAN NOT NULL DEFAULT FALSE,
    is_privacy_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
    is_auto_renew       BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at          TIMESTAMPTZ,
    last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    sync_status         TEXT NOT NULL DEFAULT 'ok',
    sync_error          TEXT,
    raw                 JSONB                       -- last full Namecheap API response, for diagnostics
);

CREATE INDEX idx_namecheap_state_expiring ON plugin_namecheap_state(expires_at)
    WHERE is_auto_renew = FALSE;

CREATE TABLE plugin_namecheap_audit (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operator_id     BIGINT REFERENCES operators(id) ON DELETE SET NULL,
    domain_id       BIGINT REFERENCES domains(id) ON DELETE SET NULL,
    api_method      TEXT NOT NULL,                  -- 'namecheap.domains.create'
    request_args    JSONB NOT NULL,
    response_code   INT,
    response_summary TEXT,
    succeeded       BOOLEAN NOT NULL,
    duration_ms     INT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

The `plugin_namecheap_audit` table records every API call to Namecheap with sanitized arguments. Critical because Namecheap actions can spend money (registrations, renewals) — the operator must have an audit trail.

### 2.7 Operational Notes

- **IP whitelisting** — Namecheap's API requires the calling IP be on a per-account whitelist. The plugin stores the operator-supplied client IP (the Tundra control plane's egress IP) as a secret; the operator configures the whitelist on Namecheap's dashboard. The plugin verifies whitelist effectiveness at `enable` time by calling `namecheap.users.getBalances` and surfaces a clear error if rejected.
- **API rate** — Namecheap's documented limit is ~60 RPM. The plugin's outbound rate limit matches; bulk operations (e.g., updating DNS for many domains) use a token-bucket scheduler.
- **Sandbox mode** — The plugin supports `--sandbox` flag during connect, switching the API base URL to `api.sandbox.namecheap.com` for testing without spending money.
- **Spending guardrails** — Any operation with cost (registration, renewal, transfer) requires explicit operator confirmation in interactive flows. A separate API token scope (`namecheap.spending`) is required for non-interactive (scripted) money-spending operations; tokens default to denying that scope.

---

## 3. Plugin 2 — GitHub Integration

### 3.1 Plugin Identity

```toml
id = "com.tundra.github"
name = "GitHub"
version = "1.0.0"
author = "Tundra Team"
license = "Apache-2.0"
tier = "core"
kind = "native"
official = true
tundra_min_version = "1.0.0"
description = """
Connect a GitHub account or organization to Tundra via the Tundra GitHub App.
Once connected, deploy any accessible repository (public or private) without
manually copying URLs, generating deploy keys, or configuring webhooks.
"""
```

### 3.2 Authentication Model — GitHub App

The plugin uses a **GitHub App** as the primary authentication mechanism, not personal access tokens. This choice is deliberate and important.

**Why a GitHub App:**

- Per-installation access controls — owner installs the App on their account or org and selects which repos Tundra can see. No "all-or-nothing" PAT scope.
- Server-to-server tokens with short TTL (1 hour), minted on demand from the App's private key — far better than long-lived PATs.
- Webhooks come from a single, verifiable, App-signed origin — not per-repo deploy hooks scattered across the org.
- Rate limits scale with installations, not against a single user's quota.
- Owner can rotate the App without disturbing every individual operator.

**Two installation flows:**

1. **Hosted Tundra GitHub App** — operators install the official `tundra-deploy` GitHub App (one-click from `github.com/apps/tundra-deploy`). The App's webhook target is the operator's own panel hostname (passed via OAuth state during install). Suitable for almost everyone.

2. **Self-hosted GitHub App** — for operators who want zero dependency on a Tundra-team-controlled App, the plugin provides a wizard to create an App on the operator's own GitHub account or org. The wizard generates the App manifest (repository permissions, webhook URL, etc.), the operator clicks "Create GitHub App from manifest," and the App's credentials flow back automatically. Suitable for security-conscious operators and air-gapped enterprise deployments.

Both flows produce the same end state from the plugin's perspective: an installed App with a private key and a list of accessible installations.

### 3.3 What It Does

| Capability                             | Detail                                                                                                                                                             |
|----------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Repository browser                     | Lists every repo accessible to every installation; searchable by name/org/visibility                                                                               |
| One-click deploy                       | Pick a repo + branch from the dropdown; Tundra creates the Site, sets up the deploy webhook, configures the App-token-based clone, runs the first deploy           |
| Auto-deploy on push                    | Webhook delivery (push, pull_request merged) triggers deployment for the configured branch; per-Site configurable                                                  |
| Branch deployment                      | Deploy preview environments per pull request (optional, opt-in per Site)                                                                                           |
| Commit status reporting                | Tundra reports deployment status back to GitHub: `pending` on enqueue, `success`/`failure` on completion. Visible in PR checks.                                    |
| Action artifacts                       | Optionally pull build artifacts from the latest GitHub Actions workflow run instead of building on the Tundra server (Vercel-style "build elsewhere, deploy here") |
| Repository metadata                    | Pull description, topics, default branch, language, stars — surfaced in the Tundra Site's "About" tab                                                              |
| Issue/PR linking                       | When a deploy succeeds for a PR, Tundra comments on the PR with the preview URL                                                                                    |
| GitHub Actions secrets sync (optional) | Push a Tundra environment variable to the matching GitHub Actions secret with one click — useful for CI/CD that needs the same credential the deployed app uses    |

### 3.4 The Killer Workflow

```bash
# One-time setup
tundra plugin grant com.tundra.github
tundra github connect          # opens browser to install Tundra GitHub App
                               # operator selects repositories
                               # control returns to terminal when install completes

# From now on:
tundra github repos             # list every repo accessible to the App
tundra github search "ecommerce" # search repos by name/topic

# Create a Site without ever touching a URL
tundra site create --repo mralaminahamed/my-saas --branch main --domain saas.example.com

# Or interactively:
tundra site create --interactive
# Wizard steps: pick installation → search/pick repo → pick branch →
# pick application type (auto-detected from repo: "looks like Laravel") →
# pick domain or subdomain → confirm. Done.
```

In the UI: when an operator clicks "Create Site," a "Deploy from GitHub" tab is the first option. The repository picker shows the operator's installations and repos with avatars, descriptions, and last-pushed timestamps. Auto-detection runs against the picked repo (read `composer.json`, `package.json`, `Cargo.toml`, `go.mod`, etc.) and pre-fills the application type, build command, and start command.

### 3.5 Capabilities Requested

```toml
[[capabilities]]
kind = "net"
hosts = [
  "api.github.com",
  "github.com",                # for git clone
  "codeload.github.com",       # for tarball downloads if not git-cloning
  "objects.githubusercontent.com",  # for releases / actions artifacts
]
max_rpm = 5000               # GitHub App rate limit is 15k/hr per installation × installations
max_bytes_per_request = 524_288_000   # 500 MB for large repos / artifacts

[[capabilities]]
kind = "secret"
names = [
  "github.app-id",
  "github.app-private-key",
  "github.webhook-secret",
  # Per-installation tokens are minted on demand and not persisted as secrets
]

[[capabilities]]
kind = "db-read"
tables = ["sites", "applications", "deployments", "operators"]

[[capabilities]]
kind = "db-write"
tables = [
  "sites",
  "applications",
  "deployments",
  "releases",
  "environment_variables",
  "plugin_github_installations",
  "plugin_github_repositories",
  "plugin_github_webhooks",
  "plugin_github_pr_previews",
]

[[capabilities]]
kind = "events-subscribe"
events = [
  "site.created",
  "site.deleted",
  "deployment.succeeded",
  "deployment.failed",         # to report status back to GitHub
]

[[capabilities]]
kind = "events-publish"
events = [
  "github.installation.added",
  "github.installation.removed",
  "github.push.received",
  "github.pull-request.opened",
  "github.pull-request.merged",
  "github.deployment.requested",
  "github.deployment.status-reported",
]

[[capabilities]]
kind = "background-jobs"
max_concurrent = 16          # deploys can run in parallel across many sites

# A unique capability for this plugin: an inbound HTTP route from outside the
# operator session. GitHub webhooks arrive unauthenticated except by HMAC.
[[capabilities]]
kind = "http-public-route"   # carries no Tundra session; HMAC-validated
paths = ["/webhook"]
```

### 3.6 Contributions

```toml
[[contributes]]
kind = "vcs-provider"
slug = "github"
display_name = "GitHub"
supported_operations = ["browse", "clone", "tarball", "webhook", "status-report",
                        "pr-preview", "actions-artifact"]

[[contributes]]
kind = "cli-subcommand"
verb = "github"
help = "Manage GitHub integration"
subcommands = [
  { verb = "connect",     help = "Install the Tundra GitHub App" },
  { verb = "disconnect",  help = "Remove an installation" },
  { verb = "installations", help = "List active installations" },
  { verb = "repos",       help = "List repositories accessible to Tundra" },
  { verb = "search",      help = "Search accessible repositories by query" },
  { verb = "rotate-key",  help = "Rotate the App private key" },
  { verb = "test-webhook",help = "Trigger a test webhook delivery" },
]

[[contributes]]
kind = "http-route"
method = "POST"
path = "/webhook"
auth = "none"                  # HMAC validation done in plugin
csrf = false                   # webhook is intentionally cross-origin

[[contributes]]
kind = "http-route"
method = "GET"
path = "/installations"
auth = "operator-session"

# ... full list elided

[[contributes]]
kind = "ui-page"
parent = "settings"
id = "integrations-github"
title = "GitHub"
icon = "Github"
spec_path = "ui/pages/github.json"

[[contributes]]
kind = "site-create-source"
slug = "github-repo"
display_name = "GitHub Repository"
priority = 10                  # highest priority; appears first in Site Create dialog
```

The `vcs-provider` and `site-create-source` are new extension points. Future GitLab, Bitbucket, Gitea, or Forgejo plugins implement `vcs-provider` and contribute `site-create-source` with different slugs; they appear as additional tabs in the Site Create dialog without touching the GitHub plugin's code.

### 3.7 Plugin-Owned Schema

```sql
CREATE TABLE plugin_github_installations (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id           UUID NOT NULL DEFAULT uuidv7() UNIQUE,
    installation_id     BIGINT NOT NULL UNIQUE,     -- GitHub's installation_id
    account_login       TEXT NOT NULL,              -- 'mralaminahamed' or 'codexpert-inc'
    account_type        TEXT NOT NULL,              -- 'User' or 'Organization'
    account_avatar_url  TEXT,
    repository_selection TEXT NOT NULL,             -- 'all' or 'selected'
    permissions         JSONB NOT NULL,
    events              TEXT[] NOT NULL,
    suspended_at        TIMESTAMPTZ,
    installed_by        BIGINT REFERENCES operators(id) ON DELETE SET NULL,
    installed_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE plugin_github_repositories (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    installation_id     BIGINT NOT NULL REFERENCES plugin_github_installations(id) ON DELETE CASCADE,
    github_id           BIGINT NOT NULL,
    full_name           TEXT NOT NULL,              -- 'mralaminahamed/my-saas'
    name                TEXT NOT NULL,
    description         TEXT,
    is_private          BOOLEAN NOT NULL DEFAULT FALSE,
    default_branch      TEXT NOT NULL DEFAULT 'main',
    language            TEXT,
    topics              TEXT[],
    pushed_at           TIMESTAMPTZ,
    last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (installation_id, github_id)
);

CREATE INDEX idx_github_repos_search ON plugin_github_repositories
    USING GIN (to_tsvector('simple', full_name || ' ' || coalesce(description, '')));

CREATE TABLE plugin_github_webhooks (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id           UUID NOT NULL DEFAULT uuidv7() UNIQUE,
    delivery_id         TEXT NOT NULL UNIQUE,       -- GitHub's X-GitHub-Delivery
    event               TEXT NOT NULL,              -- 'push', 'pull_request', etc.
    payload             JSONB NOT NULL,
    received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at        TIMESTAMPTZ,
    handler_outcome     TEXT,
    error               TEXT
);

CREATE INDEX idx_github_webhooks_unprocessed ON plugin_github_webhooks(received_at)
    WHERE processed_at IS NULL;

CREATE TABLE plugin_github_pr_previews (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    site_id             BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    repository_id       BIGINT NOT NULL REFERENCES plugin_github_repositories(id) ON DELETE CASCADE,
    pr_number           INT NOT NULL,
    head_sha            TEXT NOT NULL,
    preview_site_id     BIGINT REFERENCES sites(id) ON DELETE SET NULL,
    preview_url         TEXT,
    status              TEXT NOT NULL,              -- 'building','live','failed','closed'
    opened_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at           TIMESTAMPTZ,
    UNIQUE (site_id, pr_number)
);
```

### 3.8 Operational Notes

- **Webhook signature** — every incoming webhook must validate against the App's webhook secret using HMAC-SHA256. Webhooks failing signature check return 401 and are not stored. This is the one piece of unauthenticated input the plugin accepts; it is the most security-critical surface.
- **Token refresh** — installation access tokens expire in 1 hour. The plugin mints fresh tokens per Git operation rather than caching. The plugin signs JWTs with the App private key to request tokens, never sharing the private key with subprocesses or git itself.
- **Git clone over HTTPS** — uses installation tokens via the `x-access-token:<token>@github.com/...` URL form. Tokens are injected only in the subprocess environment and never logged.
- **Large repositories** — for repos > 1 GB, the plugin uses GitHub's tarball API instead of `git clone` to skip the full history, unless the application requires git metadata (rare).
- **Self-hosted GitHub Enterprise** — supported via a configurable API base URL during connect (`tundra github connect --enterprise github.example-corp.com`). All API calls and webhook origins shift to that host.

---

## 4. Plugin 3 — MCP Server

### 4.1 Plugin Identity

```toml
id = "com.tundra.mcp-server"
name = "MCP Server (AI Agent Integration)"
version = "1.0.0"
author = "Tundra Team"
license = "Apache-2.0"
tier = "core"
kind = "native"
official = true
tundra_min_version = "1.0.0"
description = """
Expose Tundra capabilities to AI agents via the Model Context Protocol.
Supports both local stdio (for Claude Desktop, Claude Code, Cursor, Zed)
and remote Streamable HTTP (for cloud agents). Per-token role-based scopes
and per-session write toggles let operators control exactly what AI agents
can see and do.
"""
```

### 4.2 What It Does

The plugin runs an MCP server that speaks the Model Context Protocol over two transports simultaneously, exposing Tundra's capabilities as MCP **tools**, **resources**, and **prompts**:

| MCP Primitive | Surface                                                                                                                                                   |
|---------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Tools**     | Callable actions that can read or modify Tundra state (deploy a site, restart a service, run a database backup, fetch logs)                               |
| **Resources** | Read-only context the agent can attach to the conversation (a site's recent error logs, a server's system metrics, the panel audit log for the last hour) |
| **Prompts**   | Pre-baked operator-friendly prompts ("Diagnose why deploy X failed", "Suggest a security review of site Y")                                               |

### 4.3 Transport Support

#### Local stdio

For desktop AI clients (Claude Desktop, Cursor, Zed). The user adds Tundra to their MCP configuration:

```jsonc
// ~/.config/claude/mcp_servers.json (or equivalent)
{
  "mcpServers": {
    "tundra": {
      "command": "tundra",
      "args": ["mcp", "serve", "--stdio"],
      "env": {
        "TUNDRA_API_TOKEN": "ttok_readonly_..."
      }
    }
  }
}
```

The `tundra mcp serve --stdio` command launches the plugin's stdio handler. The token is provided via env var (per MCP guidance — never in tool schemas). The token determines what scope the AI agent operates under.

#### Remote Streamable HTTP

For cloud AI agents and shared deployments. The plugin exposes:

```
POST https://panel.example.com/mcp
GET  https://panel.example.com/mcp           (SSE stream for server-initiated messages)
```

This follows the MCP 2025-03-26 Streamable HTTP transport — single endpoint, both POST and GET, with SSE upgrade for server-to-client notifications. The deprecated SSE-only transport from 2024-11-05 is **not** offered; it has been superseded.

Authentication uses Tundra API tokens passed as `Authorization: Bearer <token>`. OAuth 2.1 device flow (the latest MCP authorization spec) is supported as a v1.1 enhancement; v1.0 ships with bearer tokens only.

### 4.4 Token Scopes — The Heart of the Security Model

API tokens for MCP have a dedicated scope set, distinct from the general `tundra` API token scopes:

| Scope            | Grants                                                                                                                                             |
|------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| `mcp:read`       | Read-only: list sites, read logs, view metrics, browse audit log                                                                                   |
| `mcp:write:safe` | Read + safe writes: restart a service, clear a cache, retry a failed job. **No site/server/database creation, no deletion, no credential changes** |
| `mcp:write`      | Read + safe writes + full mutation: create sites, deploy code, modify environment variables, trigger backups                                       |
| `mcp:admin`      | All of the above plus operator-level mutations: invite operators, change permissions, modify the master configuration                              |

Tokens are minted by the operator with explicit scope. The `tundra mcp token create` command:

```bash
# Read-only token for safe agent exploration
tundra mcp token create --name "claude-readonly" --scopes mcp:read --ttl 30d

# Full-power token for trusted automation, short-lived
tundra mcp token create --name "deploy-bot" --scopes mcp:write --ttl 1h --max-uses 100

# Admin token, IP-restricted, single use
tundra mcp token create --name "incident-response" --scopes mcp:admin \
    --ttl 1h --max-uses 1 --restrict-ip 203.0.113.45
```

### 4.5 Per-Session Write Toggle

Even with a `mcp:write` token, the operator chooses **at session start** whether write operations are enabled for that session:

```bash
# Start a stdio session in read-only mode (write tools hidden from agent)
tundra mcp serve --stdio --readonly

# Start a stdio session with writes enabled (all tools visible)
tundra mcp serve --stdio
```

For HTTP sessions, the client sends an `X-Tundra-Mode: read | write` header on initialization. The MCP server returns a different tool list depending on the mode. An agent that started a read-only session literally cannot see the `deploy_site` or `delete_database` tools — they are not advertised in the `tools/list` response.

This implements the user's stated preference: "Configurable: operator chooses per-token/per-session whether write is enabled." The token sets the ceiling; the session toggle sets the actual exposure within that ceiling.

### 4.6 Tools Catalog (v1.0)

A representative selection of the tools exposed:

#### Read tools (always available with `mcp:read`+)

| Tool                    | Description                                                                                 |
|-------------------------|---------------------------------------------------------------------------------------------|
| `list_servers`          | Returns all Tundra-managed servers with status                                              |
| `list_sites`            | Returns all Sites; filterable by server, application type, or status                        |
| `get_site`              | Full Site detail: domain, application, recent deployments, env vars (keys only, not values) |
| `tail_logs`             | Stream last N lines of a Site's nginx/application logs (resource, not tool, in MCP terms)   |
| `get_metrics`           | Per-server or per-site metrics for a time window                                            |
| `list_databases`        | All Tundra-managed databases with connection details (host, port, name; not credentials)    |
| `list_certificates`     | All certificates with expiry timestamps                                                     |
| `get_audit_log`         | Recent entries from the Tundra audit log                                                    |
| `get_deployment_status` | Status of a specific deployment, with build log                                             |
| `search`                | Full-text search across sites, domains, deployments                                         |

#### Safe-write tools (require `mcp:write:safe`+)

| Tool                | Description                                            |
|---------------------|--------------------------------------------------------|
| `restart_service`   | Restart a managed service (PHP-FPM pool, daemon, etc.) |
| `clear_cache`       | Clear application cache (per-Site)                     |
| `retry_failed_job`  | Retry a failed background job                          |
| `renew_certificate` | Trigger ACME renewal for a certificate                 |
| `run_health_check`  | Trigger an immediate health check on a Site            |

#### Full-write tools (require `mcp:write`+)

| Tool                          | Description                                                 |
|-------------------------------|-------------------------------------------------------------|
| `create_site`                 | Create a new Site (domain, application type, runtime, repo) |
| `deploy_site`                 | Trigger a deployment for a Site                             |
| `set_environment_variable`    | Add/update an environment variable for a Site               |
| `delete_environment_variable` | Remove an environment variable                              |
| `create_database`             | Create a database                                           |
| `run_backup`                  | Run a backup job                                            |
| `restore_backup`              | Restore from a backup snapshot                              |
| `update_dns_record`           | Modify a DNS record                                         |

#### Admin tools (require `mcp:admin`)

| Tool                   | Description                      |
|------------------------|----------------------------------|
| `delete_site`          | Delete a Site (destructive)      |
| `delete_database`      | Delete a database (destructive)  |
| `invite_operator`      | Send an operator invitation      |
| `update_operator_role` | Change an operator's role        |
| `revoke_session`       | Forcibly end an operator session |

Every tool's input schema is JSON Schema generated automatically from the corresponding Tundra API DTOs. The MCP `tools/list` response describes inputs precisely so the AI agent constructs valid calls without trial-and-error.

### 4.7 Resources Catalog

Resources (read-only context attachable by the host application):

| Resource URI                                               | Content                                                |
|------------------------------------------------------------|--------------------------------------------------------|
| `tundra://sites/{site_id}/logs/recent`                     | Last 1000 lines of combined application logs           |
| `tundra://sites/{site_id}/deployments/{deployment_id}/log` | Build/deploy log for a specific deployment             |
| `tundra://servers/{server_id}/metrics/last-hour`           | CSV of per-minute metrics                              |
| `tundra://audit-log/recent`                                | Last 200 audit log entries                             |
| `tundra://sites/{site_id}/config`                          | Generated Nginx config + systemd unit (read-only view) |
| `tundra://databases/{database_id}/schema`                  | Tables, columns, indexes — no data                     |

### 4.8 Prompts Catalog

Pre-baked prompts the AI agent can offer the operator:

- **`diagnose-failed-deploy`** — input: `site_id`, `deployment_id`. Pulls the deploy log, recent commits, last successful deploy. Frames a diagnosis prompt for the model.
- **`audit-recent-changes`** — input: `since`, `actor` (optional). Pulls audit log entries, formats them for review.
- **`suggest-cost-optimization`** — input: `server_id`. Pulls metrics, identifies underutilized resources, frames a recommendation prompt.
- **`incident-response-runbook`** — input: `site_id`, `severity`. Frames a structured incident response prompt with relevant context attached.

### 4.9 Capabilities Requested

```toml
[[capabilities]]
kind = "net"
hosts = []                    # MCP server is an HTTP server, not client; no outbound needed for v1
max_rpm = 0

[[capabilities]]
kind = "secret"
names = []                    # No long-lived secrets; tokens managed via panel API tokens table

[[capabilities]]
kind = "db-read"
tables = [
  # Broad read access — the MCP server exposes most of the panel state
  "servers", "sites", "applications", "deployments", "releases",
  "databases", "database_users", "domains", "dns_zones", "dns_records",
  "mail_domains", "mailboxes", "certificates", "scheduled_tasks",
  "audit_log", "operators",
  "plugin_mcp_tokens", "plugin_mcp_sessions",
]

[[capabilities]]
kind = "db-write"
tables = [
  # MCP server only writes its own state; all panel mutations are dispatched
  # through the standard panel API surface (so RBAC, audit, validation all run).
  "plugin_mcp_tokens",
  "plugin_mcp_sessions",
  "plugin_mcp_tool_invocations",
]

[[capabilities]]
kind = "events-subscribe"
events = ["*"]                # Stream events to active MCP sessions for real-time observability

[[capabilities]]
kind = "events-publish"
events = [
  "mcp.session.opened",
  "mcp.session.closed",
  "mcp.tool.invoked",
  "mcp.tool.denied",
  "mcp.write-mode-toggled",
]

[[capabilities]]
kind = "background-jobs"
max_concurrent = 32           # tail_logs, metrics streaming, etc.

[[capabilities]]
kind = "http-public-route"
paths = ["/mcp"]              # GET + POST, both on /mcp per Streamable HTTP spec
```

The MCP server **does not write directly to panel domain tables**. Every mutation flows through the standard Tundra API client, in-process — meaning every RBAC check, every audit log entry, every input validation runs exactly as if the operator had clicked the button or typed the CLI command. The MCP layer is a translator, not a privileged shortcut.

### 4.10 Contributions

```toml
[[contributes]]
kind = "cli-subcommand"
verb = "mcp"
help = "Manage the MCP server and tokens"
subcommands = [
  { verb = "serve",    help = "Run the MCP server (stdio mode)" },
  { verb = "status",   help = "Show MCP server status" },
  { verb = "tokens",   help = "Manage MCP tokens" },
  { verb = "sessions", help = "List active MCP sessions" },
  { verb = "audit",    help = "Audit log of MCP tool invocations" },
]

[[contributes]]
kind = "http-route"
method = "POST"
path = "/mcp"
auth = "api-token-mcp"        # custom auth scheme handling Bearer ttok_*
csrf = false

[[contributes]]
kind = "http-route"
method = "GET"
path = "/mcp"
auth = "api-token-mcp"
csrf = false

[[contributes]]
kind = "http-route"
method = "POST"
path = "/tokens"              # operator-session-authed; manages MCP tokens
auth = "operator-session"

[[contributes]]
kind = "ui-page"
parent = "settings"
id = "mcp-server"
title = "AI Agents (MCP)"
icon = "Bot"
spec_path = "ui/pages/mcp.json"

[[contributes]]
kind = "scheduled-job"
name = "mcp-token-cleanup"
cron = "*/15 * * * *"
help = "Remove expired MCP tokens and stale sessions"
```

### 4.11 Plugin-Owned Schema

```sql
CREATE TABLE plugin_mcp_tokens (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id       UUID NOT NULL DEFAULT uuidv7() UNIQUE,
    operator_id     BIGINT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    token_hash      BYTEA NOT NULL UNIQUE,          -- SHA-256 of the actual token; token shown only on create
    token_prefix    TEXT NOT NULL,                  -- 'ttok_readonly_abc123' first 16 chars for display
    scopes          TEXT[] NOT NULL,                -- subset of mcp:read, mcp:write:safe, mcp:write, mcp:admin
    restrict_ip     CIDR,
    max_uses        INT,                            -- NULL = unlimited
    use_count       INT NOT NULL DEFAULT 0,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE plugin_mcp_sessions (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id       UUID NOT NULL DEFAULT uuidv7() UNIQUE,
    token_id        BIGINT NOT NULL REFERENCES plugin_mcp_tokens(id) ON DELETE CASCADE,
    transport       TEXT NOT NULL CHECK (transport IN ('stdio','http')),
    mode            TEXT NOT NULL CHECK (mode IN ('read','write')),
                                                     -- 'read' hides write tools regardless of token scope
    client_name     TEXT,                            -- from initialize: 'claude-desktop', 'cursor', etc.
    client_version  TEXT,
    remote_ip       INET,                            -- for http transport
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at        TIMESTAMPTZ
);

CREATE TABLE plugin_mcp_tool_invocations (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id      BIGINT NOT NULL REFERENCES plugin_mcp_sessions(id) ON DELETE CASCADE,
    tool_name       TEXT NOT NULL,
    arguments       JSONB NOT NULL,                  -- with secrets redacted before insert
    outcome         TEXT NOT NULL,                   -- 'success','error','denied','blocked'
    error_summary   TEXT,
    duration_ms     INT,
    invoked_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcp_invocations_session ON plugin_mcp_tool_invocations(session_id, invoked_at DESC);
CREATE INDEX idx_mcp_sessions_active ON plugin_mcp_sessions(token_id, ended_at)
    WHERE ended_at IS NULL;
```

### 4.12 The Operator's MCP Settings Page

The settings page surfaces a single source of truth for AI access. Mocked layout:

```
┌─────────────────────────────────────────────────────────────────────┐
│ AI Agents (MCP)                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ Status:        Active (HTTP endpoint live, stdio per-CLI-invocation)│
│ HTTP endpoint: https://panel.example.com/mcp                        │
│                                                                     │
│ Connect Claude Desktop:                                             │
│   [ Show MCP config ▼ ]   copies a ready-to-paste JSON snippet      │
│                                                                     │
│ Connect Cursor / Zed / Claude Code:                                 │
│   [ Show install command ▼ ]   the equivalent for each editor      │
│                                                                     │
│ ── Tokens ───────────────────────────────────────────────────────── │
│  Name              Scope            Expires         Last used      │
│  claude-readonly   mcp:read         2026-06-01      2 minutes ago  │
│  deploy-bot        mcp:write        2026-05-15      1 hour ago     │
│  [+ Create token]                                                   │
│                                                                     │
│ ── Active sessions ─────────────────────────────────────────────── │
│  Client            Mode    Started     Tools used    Token         │
│  claude-desktop    read    11:42       42            claude-...    │
│  cursor            write   11:40       7             deploy-bot    │
│                                                                     │
│ ── Recent tool invocations ─────────────────────────────────────── │
│  11:43 list_sites          [success]                                │
│  11:42 tail_logs("api")    [success]                                │
│  11:41 deploy_site("api")  [success]   by deploy-bot                │
│ [ Full audit log → ]                                                │
└─────────────────────────────────────────────────────────────────────┘
```

The operator never has to ssh into the server to figure out which AI agents are connected. Every session, every tool call, every denied request is visible in real time.

### 4.13 Operational Notes

- **Origin and DNS-rebinding protection** — per MCP spec, the server validates the `Origin` header on all HTTP connections to prevent DNS-rebinding attacks. Local-bound deployments (single-server install) bind only to `127.0.0.1`.
- **Tool advertisement is dynamic** — the MCP `tools/list` response is generated per session based on `(token.scopes, session.mode)`. An operator who downgrades a session from write to read causes a `notifications/tools/list_changed` to fire and tools disappear from the agent's view.
- **Streaming long operations** — log tailing and deploy progress use SSE on the GET endpoint, allowing the agent to receive incremental updates without polling.
- **Rate limits per session** — an MCP session has its own rate limit window (default 60 tool calls/minute, configurable). Exceeding triggers a friendly error the agent surfaces to the user.
- **Audit log integration** — every MCP-mediated action lands in the main `audit_log` with `actor_kind = 'mcp'` and a reference to the MCP session and token. This means a Tundra operator reviewing the audit log sees AI-mediated changes with the same visibility as human-mediated changes.

---

## 5. Cross-Plugin Integration

The four core plugins (Plesk migration + Namecheap + GitHub + MCP server) are designed to compose cleanly. A few illustrative flows:

### 5.1 "Buy domain, deploy app" — Namecheap + GitHub Together

```bash
# Search and register
tundra namecheap search example.com           # available
tundra domain register example.com --years 1

# DNS setup is automatic: Tundra publishes the zone, Namecheap nameservers
# are flipped to Tundra by the namecheap plugin. operator does nothing manual.

# Deploy
tundra site create --repo mralaminahamed/my-app --branch main --domain example.com
# GitHub plugin clones the repo using the App token. ACME plugin issues TLS via
# Tundra DNS (DNS-01 challenge). Site is live with HTTPS.
```

Time elapsed from search to live HTTPS: under 5 minutes if DNS propagation cooperates.

### 5.2 "Migrate from Plesk, keep Namecheap" — Plesk Migration + Namecheap Together

The Plesk migration plugin's cutover step needs DNS updates. If the migrated domain's NS records point at Namecheap-hosted DNS (rather than Plesk's BIND), the migration plugin queries the Namecheap plugin for credentials and updates DNS programmatically — the operator never visits the Namecheap dashboard.

```bash
tundra migrate cutover <job-id> --dns-provider namecheap
```

The migration plugin's `cutover-prepare` returns a `cutover-plan` that describes the DNS changes required; the Namecheap plugin's `dns-provider` interface implementation applies them. Two plugins, one operation, no copy-paste.

### 5.3 "Ask Claude to deploy a PR" — GitHub + MCP Server Together

The operator says to Claude Desktop: "Deploy PR #42 of mralaminahamed/my-app to a preview environment."

1. Claude calls `search_repositories` (MCP read tool) to find the repo.
2. Claude calls `list_pull_requests(repo="mralaminahamed/my-app", number=42)` (MCP read tool, GitHub-plugin-backed) to get PR details.
3. Claude calls `create_pr_preview(site_id=42, pr_number=42)` (MCP write tool, requires `mcp:write` scope, available because session is in write mode).
4. The GitHub plugin's `pr-preview` machinery spins up the preview Site.
5. Claude calls `tail_logs(site_id=<preview>)` (MCP read tool) to monitor the build.
6. Once green, Claude reports back: "Deployed. Preview is live at https://pr-42.preview.tundra.example.com."

The operator never typed a Tundra command. The audit log shows the full chain — operator's MCP token, session, tool invocations, GitHub plugin actions, deploy outcome — at the same fidelity as if the operator had typed everything by hand.

### 5.4 "AI-mediated incident response" — MCP + Plesk Migration Together

If a Plesk migration's automatic cutover fails, the migration plugin emits `plesk-migration.failed`. The MCP server forwards this event to subscribed AI agent sessions. An always-on observer agent (e.g., a custom Cursor workflow with MCP integration) sees the event and is triggered to:

1. Read the migration job's verification report (MCP resource).
2. Read the source Plesk server's recent error logs (MCP resource).
3. Call `migration_rollback` (MCP write tool) if it concludes rollback is correct.
4. Page the operator with a summary.

This pattern is the most powerful — and the most dangerous. The configurable per-session write toggle and explicit token scopes mean operators can opt into this only for the agents they trust, with the kill switch one CLI command away (`tundra mcp tokens revoke deploy-bot`).

---

## 6. Updated Build Phase

Section 12.1 of `tundra-plugin-architecture-plan-v1.md` listed the v1.0 plugin shipping list. With the additions in this document, the corrected list is:

| Plugin                      | Tier     | Kind       | Source          |
|-----------------------------|----------|------------|-----------------|
| Plesk Obsidian Migration    | Core     | Native     | First-party     |
| **Namecheap**               | **Core** | **Native** | **First-party** |
| **GitHub**                  | **Core** | **Native** | **First-party** |
| **MCP Server**              | **Core** | **Native** | **First-party** |
| Cloudflare DNS Provider     | Bundled  | Native     | First-party     |
| Mailgun smarthost relay     | Bundled  | Native     | First-party     |
| S3-compatible backup target | Bundled  | Native     | First-party     |
| Slack alerting channel      | Bundled  | Native     | First-party     |
| Discord alerting channel    | Bundled  | Native     | First-party     |

Four core plugins is the right number for v1.0. Each addresses an explicit operator pain point that defines Tundra's "easy and handy" promise.

---

## 7. Implementation Roadmap Update

The v1.0 timeline in `tundra-technical-implementation-plan-v2.md` §11 listed 9 phases over ~44 weeks. The three new core plugins fit into the existing structure:

| Phase                                      | Existing Scope                                          | Added Scope From This Document                                                                |
|--------------------------------------------|---------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| Phase 6 — Templates & Polish (Weeks 34–37) | Templates, Docker, scheduled tasks, daemons, monitoring | **+ Namecheap plugin (week 34–35), GitHub plugin (week 35–36), MCP server (week 36–37)**      |
| Phase 7 — Hardening & Beta (Weeks 38–41)   | Security audit, docs                                    | **+ MCP penetration test, GitHub App security review, Namecheap spending-guard verification** |

Net schedule impact: zero. The new plugins absorb the existing slack in Phase 6 and add specific items to Phase 7 that were already broadly scoped.

---

## 8. Performance Targets

Per the targets in `tundra-plugin-architecture-plan-v1.md` §13 (already accommodating these plugin counts):

| Metric                                           | Target                                           |
|--------------------------------------------------|--------------------------------------------------|
| MCP `tools/list` response                        | < 50 ms                                          |
| MCP read tool latency (e.g., `list_sites`)       | < 100 ms                                         |
| MCP write tool latency (e.g., `restart_service`) | < 500 ms (excluding service restart time itself) |
| MCP concurrent sessions                          | 50 per `tundrad` (matches existing target)       |
| GitHub webhook → deploy-enqueue latency          | < 200 ms                                         |
| Namecheap inventory of 100 domains               | < 30 s                                           |
| Namecheap full sync (100 domains)                | < 90 s                                           |
| GitHub repo browse (search across 1000 repos)    | < 800 ms                                         |

---

## 9. Document Control

| Version | Date     | Author         | Changes                                                                                                                                                                                                                                                        |
|---------|----------|----------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| v1.0    | May 2026 | Al Amin Ahamed | Initial specification of Namecheap, GitHub, and MCP Server core plugins. Defines `registrar`, `vcs-provider`, and `site-create-source` as new plugin extension points. Updates the v1.0 plugin shipping list in `tundra-plugin-architecture-plan-v1.md` §12.1. |

**Companion Documents:**

- `tundra-technical-implementation-plan-v2.md` — primary architecture
- `tundra-plesk-migration-plan-v1.md` — Plesk migration as the first reference core plugin
- `tundra-plugin-architecture-plan-v1.md` — plugin contract and host APIs

**Planned Follow-up Documents:**

- `tundra-mcp-tools-reference.md` — full MCP tool catalog with input/output schemas, suitable for handing to an AI agent's documentation pipeline
- `tundra-namecheap-spending-policy.md` — operator-facing guide to spending guardrails and approval flows
- `tundra-github-app-setup-guide.md` — step-by-step for both hosted and self-hosted App installation, with screenshots
