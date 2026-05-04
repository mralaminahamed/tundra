# Tundra MCP Server — Operator Guide

> A plain-language guide to using Tundra's AI-agent integration.
> What it is, how to enable it, how to give someone access without giving away the keys to the kingdom, and how to keep an eye on what's happening.

---

**Author:** Al Amin Ahamed
**GitHub:** [@mralaminahamed](https://github.com/mralaminahamed)
**X:** [@mralaminahamed](https://x.com/mralaminahamed)

**Document Version:** v1.0
**Document Date:** May 2026
**Status:** Operator Reference
**Audience:** Operators — the person running Tundra and choosing whether AI agents can interact with it
**Companion to:** `tundra-mcp-server-spec-v1.md` (engineering reference) and `tundra-mcp-server-cookbook-v1.md` (worked integration examples)

---

## 1. What This Is

Tundra ships with a Model Context Protocol (MCP) server. MCP is the protocol that lets AI agents — Claude Desktop, Claude Code, Cursor, Zed, and others — talk to external tools in a standardised way. With it enabled, you can ask an AI assistant questions like "show me my failing deploys," "tail the logs on the API site," or "deploy the latest commit on main" and the assistant will use Tundra to actually do those things.

The two questions every operator should answer before turning this on:

1. **Should an AI ever be able to do this?** For some operators the answer is "yes, but read-only" — the AI helps with diagnostics and reviews, the operator clicks the deploy button. For others it's "yes, including writes, in a tightly scoped way." For others still it's "no, not yet." Tundra accommodates all three.

2. **If yes, who gets access and what can they do?** The MCP server doesn't grant blanket access. You mint **tokens** with explicit scopes, hand them to specific AI agents, and revoke them when you're done.

This document walks you through both questions and the day-to-day mechanics. The technical reference (full tool catalog, JSON schemas, transport details, threat model) is in `tundra-mcp-server-spec-v1.md`. Worked examples for specific AI hosts are in `tundra-mcp-server-cookbook-v1.md`.

---

## 2. The Mental Model

There are three knobs the operator turns:

### 2.1 The plugin enable/disable

The MCP server is a plugin that ships with Tundra but is **disabled** on a fresh install. Until you enable it, no AI agent can connect. You enable it once, and it stays enabled across upgrades unless you turn it back off.

### 2.2 The token

A token is a long random string that an AI agent presents to authenticate. Tokens have:

- A **scope** (`mcp:read`, `mcp:write:safe`, `mcp:write`, `mcp:admin`) — the ceiling of what the agent can do.
- An **expiry** — when the token stops working. Maximum 90 days.
- Optional restrictions: maximum number of uses, IP CIDR allowlist, allowlist of which AI host can use it.

You mint tokens. You hand them out. You revoke them. They're not auto-issued. Anyone who has a Tundra-managed AI assistant has it because you gave them a token.

### 2.3 The session mode

Even with a token that *could* allow writes, the actual write capability is decided **at session start**:

- A `read` session sees only read tools, regardless of token scope.
- A `write` session sees the read tools plus whatever the token's scope allows.

This double-gating is intentional. A daily-driver AI assistant that mostly diagnoses can carry a `mcp:write` token but be started in `read` mode, and only switch to `write` when you explicitly tell it to. The token is the policy ceiling; the session mode is the operational floor.

The combination is: **tokens are who, sessions are when**. The token says "this AI may do up to X." The session says "and right now, it's doing up to Y, where Y ≤ X."

---

## 3. Enabling It

In the panel: **Settings → Plugins → AI Agents (MCP) → Enable**.

After enabling, the page reorganises itself into the **Settings → AI Agents (MCP)** view (the layout in §6 below). The HTTP endpoint becomes live at `https://<your-panel-host>/mcp`. The stdio mode becomes invokable via `tundra mcp serve --stdio`.

You can also enable via CLI:

```
tundra plugin enable com.tundra.mcp-server
```

There's no observable change for end users until you mint a token. The endpoint exists but rejects everything that doesn't carry a valid token.

---

## 4. Choosing a Scope

You'll mint a token at the lowest scope that's actually needed for what you want the AI to do.

### 4.1 `mcp:read`

The AI can list things, read logs, view metrics, browse the audit log. It cannot change anything.

This is the right starting scope for almost everyone. An AI assistant with `mcp:read` can answer questions like:

- "What sites are on this server?"
- "Show me the deploy log for site X."
- "What did Alice do in the panel today?"
- "Are any TLS certs about to expire?"
- "What's the CPU history on the API server for the last hour?"

For most operators, this scope provides 80% of the value with zero risk. You learn how the AI behaves, what its failure modes are, and what kind of context windows it needs, without any chance of it making changes.

### 4.2 `mcp:write:safe`

The AI can do read-only things plus a small set of low-impact, easily-reversible writes:

- Restart a service.
- Clear an application cache.
- Retry a failed background job.
- Force a TLS certificate renewal.
- Trigger an immediate health check.

These are operations a tier-1 support technician would routinely perform. Nothing here creates resources, deletes resources, or changes credentials.

This scope works well for an "ops co-pilot" — an AI that helps you respond to alerts and routine issues without you having to context-switch to the panel.

### 4.3 `mcp:write`

The AI can do everything in the safe-write scope plus mutations:

- Create sites.
- Trigger deploys.
- Modify environment variables.
- Run backups.
- Restore backups (with explicit confirmation).
- Modify DNS records.

This is significantly more power, and you should think carefully before issuing a token at this scope. The right cases:

- A short-lived (hours, not weeks) token for a specific high-context task — "I'm doing the migration, give me a token I can use for the next two hours and then revoke."
- An automation token for a CI/CD pipeline that pushes deploys via Tundra, with `--max-uses` set to a number that matches the pipeline's expected use over the token's life.
- A trusted, IP-restricted token for a developer's specific workstation.

This scope **never** creates new operators or changes role assignments — that requires `mcp:admin`.

### 4.4 `mcp:admin`

The AI can do everything in the write scope plus operator management:

- Invite operators.
- Change operator roles.
- Revoke operator sessions.

`mcp:admin` should be a rare exception, not a default. It exists because some legitimate use cases (incident response, automated provisioning of new team members) require it. The right discipline is:

- Issue with `--max-uses 1`.
- Issue with `--ttl 1h` (one hour).
- Issue with `--restrict-ip` to a specific known address.
- Document the reason in the token's name.

The MCP server requires step-up authentication on `mcp:admin` operations: the issuing operator must have signed in within the last 5 minutes. This means an `mcp:admin` token by itself isn't enough; the operator who minted it has to be recently active too.

### 4.5 The default recommendation

For your first token: **`mcp:read`, 30 days, no other restrictions.** Use it. Get a feel for what the AI does well and where it gets confused. After a couple of weeks you'll have a clear sense of whether you want to issue a write-capable token at all, and to what scope.

---

## 5. Minting a Token

### 5.1 In the panel

**Settings → AI Agents (MCP) → Tokens → Create token.**

A small form opens:

- **Name** — a short, human-readable description (`claude-readonly`, `cursor-deploys`, `incident-response-2026-05`). The name appears in audit entries.
- **Scope** — pick one of `mcp:read`, `mcp:write:safe`, `mcp:write`, `mcp:admin`. The picker hides `mcp:admin` if you don't have permission to mint it.
- **Expiry** — pick a date. Default 30 days. Maximum 90 days.
- **Optional restrictions:**
  - **Max uses** — leave blank for unlimited; otherwise a small integer.
  - **Restrict to IP** — a single IP or CIDR block. The token is rejected if used from outside this range.
  - **Allowed clients** — checkboxes for `claude-desktop`, `claude-code`, `cursor`, `zed`, `cloud-claude`, `other`. Leave none checked to allow any.

After submitting, the token is shown **once** in plaintext. Copy it. The panel never shows it again — only the prefix (`ttok_readonly_abc123...`) is shown for identification.

If you lose the token, you can't recover it. Revoke it and mint a new one.

### 5.2 At the command line

```
tundra mcp tokens create \
    --name "claude-readonly" \
    --scopes mcp:read \
    --ttl 30d
```

For an `mcp:write` token bound to your office IP and limited to 100 uses:

```
tundra mcp tokens create \
    --name "deploy-bot" \
    --scopes mcp:write \
    --ttl 7d \
    --max-uses 100 \
    --restrict-ip 203.0.113.0/24
```

For an incident-response admin token, single-use, IP-bound, expires in an hour:

```
tundra mcp tokens create \
    --name "incident-2026-05-02" \
    --scopes mcp:admin \
    --ttl 1h \
    --max-uses 1 \
    --restrict-ip 203.0.113.45/32 \
    --allowed-clients claude-desktop
```

The CLI prints the token once, exactly like the panel does.

---

## 6. Handing the Token to an AI

### 6.1 Local AI (stdio)

For Claude Desktop, Claude Code, Cursor, Zed, and similar desktop tools that launch MCP servers as subprocesses:

The end user adds Tundra to their MCP configuration file. The exact location varies by app — see the cookbook for each. The shape is the same:

```json
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

The user needs the `tundra` CLI installed locally (download from your panel, or `cargo install tundra-cli`). The CLI must be configured to point at your panel — `tundra config set panel-url https://panel.example.com` once.

For a read-only session even with a write-capable token:

```json
{
  "args": ["mcp", "serve", "--stdio", "--readonly"]
}
```

### 6.2 Cloud AI (HTTP)

For cloud-hosted AI agents that speak MCP over HTTP — anything from a colleague's web-based assistant to a CI/CD pipeline's tool integration — they need:

- The endpoint URL: `https://panel.example.com/mcp`
- The token, sent as `Authorization: Bearer ttok_...`
- The mode header: `X-Tundra-Mode: read` or `X-Tundra-Mode: write`

The panel's MCP page surfaces these in a "Show connection details" card. The cookbook has worked examples for the common providers.

### 6.3 What to communicate to the recipient

When you hand over a token, communicate these clearly:

1. **What scope it has** — so they know what the AI is allowed to do.
2. **When it expires** — so they're not surprised when it stops working.
3. **What restrictions apply** — IP allowlist, max uses, host restrictions.
4. **Who they should contact if it stops working** — typically you.

A short message like this is plenty:

> Here's an MCP token for Tundra. It's read-only and expires June 1. Use it from your work IP. If it stops working, ping me. Don't share it.
> `ttok_readonly_a3b4c5d6e7f8...`

---

## 7. The Settings Page

Once the plugin is enabled, **Settings → AI Agents (MCP)** is the operator's command surface. It surfaces everything in real time:

- **Plugin status** and HTTP endpoint URL.
- **Connect-X buttons** that produce ready-to-paste configs for the major AI hosts.
- **Tokens** — name, scope, expiry, last used. From here you can revoke, see details, copy the prefix.
- **Active sessions** — every currently-connected AI agent, what mode it's in, how many tools it's used, which token it's using.
- **Recent invocations** — the last few tool calls, their outcomes, click through to the full audit log.

You don't need to ssh into the server to figure out what's happening. Every consequential AI action is visible here.

The page also shows a **session mode toggle** for active sessions. If an agent is in `write` mode and you want to downgrade it to `read` without revoking the whole session, click the toggle. The agent's tool catalog is updated immediately and write tools disappear from its view.

---

## 8. Day-to-Day Operation

### 8.1 What to expect on a normal day

- Sessions open and close as users start and stop their AI assistants. You don't need to do anything.
- Tool invocations stream into the audit log. Read-only ones won't surprise you; write-mode ones come from people you specifically issued tokens to.
- Tokens age toward expiry. The MCP page warns you 7 days before any token expires (and the token's owner gets the same warning if they have a Tundra account).

### 8.2 Routine check

A weekly habit: open **Settings → AI Agents (MCP)** and skim:

- Are there active sessions you don't recognise? (Click through to see which token, which client, which IP.)
- Are there tokens that should have been revoked by now? (Past their useful date, or held by people who've left, or for tasks that ended.)
- Are the recent invocation outcomes mostly `success`? A spike in `denied` or `error` is a signal — either an agent is misbehaving or something legitimate is failing.

A monthly habit: open the full audit log filtered to `actor_kind = mcp` and skim a few days. You're looking for: actions you didn't expect, actions that happened at unexpected times, actions taken by tokens you don't immediately recognise.

### 8.3 Revoking a token

In the panel: **Settings → AI Agents (MCP) → Tokens → [token] → Revoke**.

At the CLI:

```
tundra mcp tokens revoke ttok_01H8XK0... --reason "task complete"
```

Revocation is immediate. Active sessions using the token are terminated within ~10 seconds. The token row is kept (with `revoked_at` set) for 30 days for forensic lookup, then hard-deleted.

### 8.4 Closing a session without revoking

Sometimes you want a specific session to end without invalidating the token (e.g., the user's laptop is asleep with an old session, and they want to start a new one cleanly).

In the panel: **Sessions → [session] → Close**.

CLI:

```
tundra mcp sessions close mcp_01H8XK0...
```

The session row is marked closed. The token is still valid for new sessions.

### 8.5 Downgrading a write-mode session to read

In the panel: on the active session row, toggle the mode chip from "write" to "read." The agent's view of the tool catalog updates within a second.

This is useful when an AI assistant is finishing a write-mode task and you want to leave the session running for read-only follow-up without re-establishing it.

---

## 9. Things That Will Surprise You

### 9.1 The AI doesn't know your tokens

When a user asks an AI agent "what tokens does Tundra have?", a read-mode agent can list tokens (it's read access to the same audit log you'd see), but it can't see token plaintext or token prefixes from other operators. There's no way for an AI to enumerate or steal tokens.

### 9.2 Read-mode hides tools, doesn't just refuse them

In a `read` session, the agent doesn't see write tools advertised at all. It will not try to call `deploy_site` because as far as it's concerned, no such tool exists. This is stronger than "the call is refused" — the agent doesn't know to try.

When a user asks a read-mode agent "deploy the API site," the agent will say something like "I don't have a deployment tool available in this session — only read tools. You may need to start a write-mode session." Not "I tried to deploy and got denied."

### 9.3 Destructive operations need a confirmation dance

The `delete_site`, `delete_database`, and `restore_backup` tools require a two-step pattern:

1. Agent calls the tool with `confirm: false` (or just the destructive intent).
2. Server returns a preview describing what would happen, plus a one-time `confirmation_token`.
3. Agent calls the tool again with `confirm: true` and the `confirmation_token`.

This is enforced server-side. An agent that tries to skip the preview gets an error. The audit log records both calls, so you can see that confirmation actually happened.

### 9.4 Step-up authentication catches stale admin sessions

`mcp:admin` operations require the issuing operator to have completed full sign-in within the last 5 minutes. If you minted an admin token a week ago and the agent tries to use it for an admin-scope operation, the call returns `unauthenticated:step-up-required` with a URL. You'd need to sign in fresh on the panel before the agent can complete the action.

This is a feature, not a bug. It means a long-lived admin token can't be used unattended.

### 9.5 The agent's `clientInfo.name` is for audit only

When an MCP client connects, it announces itself: `clientInfo.name = "claude-desktop"`, etc. Tundra records this in the session row and shows it in the UI. But it doesn't *trust* it for authorization. Tools aren't gated by client name. (You can scope a token to allowed clients, but that's a separate explicit restriction.)

The reason: any client can claim any name. Trust comes from the token, not the announcement.

---

## 10. When Things Go Wrong

### 10.1 An agent is making suspicious calls

Open the MCP page, find the session, click **Close**. Then revoke the token. Then open the audit log and look at what the agent did during the session.

If the calls are inside scope but you don't like them (e.g., excessive log tailing, or unexpected mutations), the right next step is a smaller-scope token next time. If the calls are outside scope, that's a bug — please report it; the scope check should have refused them.

### 10.2 You leaked a token

If you're not sure where a token went or you know it ended up somewhere unintended:

1. **Revoke it immediately.** This kills active sessions and stops new ones.
2. **Open the audit log filtered to that token.** See what was done with it.
3. **For each consequential action, decide whether reversal is needed.** Most of the time, the audit will show only what you expected — the leak was caught early.
4. **Mint a replacement** with a smaller scope and tighter restrictions.

### 10.3 You suspect operator account compromise (not just the token)

Token-only compromise is bounded by the token's scope. Operator-account compromise is much broader: the attacker can mint new tokens, change roles, do anything the operator can do.

If you suspect the operator account itself is compromised, follow the procedure in `tundra-security-audit-v1.md` §11. Don't only revoke tokens — re-secure the account, then audit.

### 10.4 Tokens stop working unexpectedly

A few benign causes:

- **Expired.** Check the expiry on the MCP page.
- **Hit max-uses.** The page shows the use count.
- **IP changed.** If the token has IP restrictions and the user's network changed (new VPN, mobile data, traveled), the calls will be rejected. Mint a new token without the IP restriction or with the new IP added.
- **Plugin disabled.** Has someone toggled the MCP plugin off? Check **Settings → Plugins**.
- **Panel down.** Is the Tundra panel reachable? `https://panel.example.com/api/v1/healthz` should return `ok`.

If none of those, look at the plugin logs (`tundra mcp status` or the audit log filtered to `mcp.tool.denied`) — denial reasons are reported there.

---

## 11. Working with a Team

A few patterns that work well when more than one person is involved:

### 11.1 Per-person tokens, never shared

Mint one token per person, named after them: `claude-alice`, `claude-bob`. When Alice leaves the project, you revoke `claude-alice` and you're done — no question of "did anyone else have that one too."

### 11.2 Per-task tokens for high-power scopes

For `mcp:write` and `mcp:admin`, mint a fresh token per task and revoke it when the task ends. The naming convention `<scope>-<task>-<date>` (`write-migration-2026-05`, `admin-incident-2026-05-02`) makes this obvious.

### 11.3 Read tokens by default, write tokens by exception

If your team's normal pattern is "the AI helps me think; I click the button," everyone gets `mcp:read`. Only the people who actually use the AI to push deploys get write-capable tokens, and only when the time comes.

### 11.4 Don't put tokens in CI environment variables long-term

CI pipelines are tempting consumers of `mcp:write` tokens. The hygiene rules:

- **Short TTL.** A few days, not 90.
- **Max uses.** Set to a generous multiple of the expected use.
- **IP restriction.** Most CI providers publish their egress IP ranges.
- **Rotate.** Set yourself a calendar reminder.

The MCP page warns you about CI-shaped tokens (high RPS, fixed UA) without restrictions; that's a hint to tighten them.

### 11.5 Use the audit log for accountability

Every MCP-mediated change is in the audit log with the operator who minted the token, the token name, the session, and the parameters (with secrets redacted). For team accountability:

- Code reviews on Tundra-mediated changes can refer to the audit row, not just to chat logs.
- Postmortems can reconstruct exactly what an AI did without depending on the conversation transcript.
- Compliance reviews (if you have them) get the same kind of journal you'd get for human-mediated changes.

---

## 12. The Short Checklist

If you remember nothing else from this document:

1. **Start with `mcp:read`.** Use it for a couple of weeks before issuing any write-capable token.
2. **Mint per-person, per-task tokens.** No shared tokens, no perpetual tokens.
3. **Set the lowest scope and shortest TTL that does the job.** It's easy to mint another; it's harder to clean up after a leaked one.
4. **Skim the MCP page weekly.** Look for active sessions, tokens nearing expiry, tokens that should already be revoked.
5. **Skim the MCP audit log monthly.** Look for unexpected actions; verify tokens are doing what their names suggest.
6. **Revoke tokens proactively.** When a task ends, when a person leaves, when an AI host is no longer used.
7. **Read-mode by default at session start.** Even with a `mcp:write` token, default to `read` and switch to `write` deliberately.

---

## 13. Frequently Asked

**Q: Can the AI see my secrets?**
A: No. Tools that surface site or environment data return only **keys**, never **values**. The same is true for database credentials and certificate private keys.

**Q: Can the AI change roles or invite people?**
A: Only with an `mcp:admin` token, and only if the issuing operator has signed in within the last 5 minutes (step-up). For most operators, this scope is never needed.

**Q: What if I want to disable AI access entirely for a while?**
A: **Settings → Plugins → AI Agents (MCP) → Disable.** Active sessions are terminated. Tokens are preserved (revoke separately if you want them gone). Re-enabling resumes service.

**Q: Does enabling MCP open me up to anything from the public internet?**
A: The HTTP endpoint listens on the same hostname as your panel and is protected by the same TLS. Connections without a valid token are rejected before any business logic runs. The Origin header is validated to prevent DNS-rebinding attacks.

**Q: Can the AI delete things?**
A: Only with an admin-scope token, in `write` mode, and only after a two-step confirmation flow. Even then, every deletion is in the audit log.

**Q: Does it cost anything?**
A: The MCP server itself is part of Tundra; there's no per-call charge. The AI side may have its own costs (Claude API usage, Cursor/Zed subscriptions); that's between you and your AI provider.

**Q: Does it work offline (panel unreachable)?**
A: No. The MCP server is the panel; if the panel is down, MCP is down. Local stdio sessions can't bridge to a non-existent control plane.

**Q: Can I write my own tool?**
A: Not directly today. v1.3 of the plugin is planned to support tools registered by other Tundra plugins. For now, the catalog is the catalog.

---

## 14. Cross-References

- `tundra-mcp-server-spec-v1.md` — full technical specification (architecture, JSON Schemas, transport details, threat model)
- `tundra-mcp-server-cookbook-v1.md` — worked examples for Claude Desktop, Claude Code, Cursor, Zed, plus end-to-end walkthroughs
- `tundra-security-overview-v1.md` — operator-facing security model that this document fits inside
- `tundra-deployment-overview-v1.md` — operator-facing install and routine ops
- `tundra-acceptance-checklist-v1.md` — UAT including MCP enablement check

---

## 15. Document Control

| Version | Date     | Author         | Changes                                                                                                                                                                                                                                                                             |
|---------|----------|----------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| v1.0    | May 2026 | Al Amin Ahamed | Initial operator-facing guide. Mental model (plugin / token / session), scope choice guidance, minting workflow (panel + CLI), handing tokens to AI hosts, the settings page, daily/weekly/monthly habits, things that surprise operators, incident procedures, team patterns, FAQ. |
