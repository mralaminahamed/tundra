<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/07-brand/brand/logos/tundra-lockup-horizontal.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/07-brand/brand/logos/tundra-lockup-horizontal.svg">
  <img src="docs/07-brand/brand/logos/tundra-lockup-horizontal.svg" alt="Tundra" height="40">
</picture>

<br />
<br />

**The open-source server management platform.**  
Manage sites, databases, DNS, mail, and deployments — from a single panel.

<br />

[![CI](https://github.com/mralaminahamed/tundra/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mralaminahamed/tundra/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/mralaminahamed/tundra?color=7a8a5c&label=)](https://github.com/mralaminahamed/tundra/releases/latest)
[![Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue?color=4a6fa5)](LICENSE)
[![SLSA Level 3](https://slsa.dev/images/gh-badge-level3.svg)](https://slsa.dev)

<br />

[**Docs**](https://mralaminahamed.github.io/tundra) &nbsp;·&nbsp;
[**Changelog**](CHANGELOG.md) &nbsp;·&nbsp;
[**Discussions**](https://github.com/mralaminahamed/tundra/discussions) &nbsp;·&nbsp;
[**Issues**](https://github.com/mralaminahamed/tundra/issues)

</div>

<br />

---

Tundra is a self-hosted alternative to Plesk and cPanel — built in Rust, shipped as a single binary, with no licensing fees. It manages the full lifecycle of web infrastructure: provisioning, deployments, DNS, databases, mail, backups, and monitoring, all from one panel.

```bash
curl -fsSL https://raw.githubusercontent.com/mralaminahamed/tundra/main/installer/install.sh | sudo bash
```

> Runs on Ubuntu 24.04, Debian 12/13, RHEL 9/10. After install, visit the printed URL to complete first-time setup.

---

## Features

**Sites & deployments**
- 7 runtimes: PHP, Node.js, Python, Go, Rust, Ruby, .NET
- Blue/green deploys with atomic symlink swap and 5-release rollback window
- 13 starter templates (WordPress, Laravel, Next.js, Django, Rails, …)
- Daemons and cron-style scheduled tasks per site

**WordPress**
- Full WP-CLI lifecycle: install, configure, reprovision
- Per-install MySQL database isolation with auto-generated credentials
- Plugin and theme management directly from WP.org
- Staging, cloning, and one-click promotion

**File manager**
- In-browser code editor (CodeMirror, 50+ language modes)
- Upload, download (including directory as ZIP), copy, move, delete
- Right-click context menu; API-driven directory tree

**Infrastructure**
- Multi-server fleet with SSH-based agent install and mTLS gRPC mesh
- Cross-server site move with 7-stage atomic pipeline
- PowerDNS zone editor + 30 provider-ready DNS templates
- Postfix + Dovecot + Rspamd + DKIM mail stack per domain
- restic + GPG backups to S3, B2, R2, Wasabi, SFTP, or local

**Platform**
- Wasmtime plugin sandbox with WIT SDK and capability gate
- MCP server — connect Claude Code, Claude Desktop, Cursor, Zed
- Per-server + per-site metrics, alert rules, delivery channels (email, Slack, Discord)
- Audit log with SHA-3/256 chain hash; SLSA Level 3 release provenance

---

## Architecture

```
  Browser / Claude / Cursor
         │  HTTPS + WebSocket
         ▼
  ┌─────────────────────────────┐
  │  tundrad  (control plane)   │
  │  Axum · SQLx · Wasmtime     │
  │  PostgreSQL 18 · Valkey 8   │
  └─────────────┬───────────────┘
                │  mTLS gRPC :7447
       ┌────────┴────────┐
       ▼                 ▼
  tundra-agent      tundra-agent
  (server-01)       (server-02)
  Caddy · PHP-FPM   Caddy · Node
  systemd units     systemd units
```

Single-host (most common): control plane and agent on the same machine, connected over a Unix socket.  
Multi-host: each managed server runs its own agent; they connect back over mTLS gRPC.

---

## Quickstart

**One-line install (systemd)**

```bash
curl -fsSL https://raw.githubusercontent.com/mralaminahamed/tundra/main/installer/install.sh | sudo bash
```

**Docker Compose (dev)**

```bash
git clone https://github.com/mralaminahamed/tundra
cd tundra/docs/09-deployment-bundle/dev
cp .env.example .env
docker compose up -d
# open http://localhost:5173
```

**Docker Compose (production)**

```bash
cd tundra/docs/09-deployment-bundle/prod
cp .env.example .env          # set TUNDRA_HOSTNAME, ACME_EMAIL
bash scripts/generate-secrets.sh
docker compose up -d
```

---

## Building

```bash
# Rust workspace
cargo build --release --workspace

# React panel
cd panel && pnpm install && pnpm build

# Tests
cargo test --workspace
cd panel && pnpm typecheck && pnpm lint && pnpm test --run
```

---

## Documentation

Full docs → **[mralaminahamed.github.io/tundra](https://mralaminahamed.github.io/tundra)**

| Guide | |
|---|---|
| [Getting Started](https://mralaminahamed.github.io/tundra/getting-started/introduction/) | Install, enroll a server, deploy your first site |
| [Self-Hosting](https://mralaminahamed.github.io/tundra/self-hosting/overview/) | Docker Compose, systemd, config reference, security hardening |
| [API Reference](https://mralaminahamed.github.io/tundra/api/overview/) | REST endpoints, authentication, pagination, WebSocket events |
| [Plugin Development](https://mralaminahamed.github.io/tundra/plugins/building-plugins/) | Wasmtime sandbox, WIT SDK, host capabilities |
| [MCP Integration](https://mralaminahamed.github.io/tundra/plugins/mcp/) | Connect Claude Code, Claude Desktop, Cursor, Zed |
| [Contributing](https://mralaminahamed.github.io/tundra/contributing/developer-guide/) | Architecture, conventions, hard constraints, PR checklist |

---

## Contributing

Read [CONTRIBUTING.md](.github/CONTRIBUTING.md). Before opening a PR:

```bash
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cd panel && pnpm typecheck && pnpm lint && pnpm test --run
```

Report vulnerabilities privately via [GitHub Security Advisories](https://github.com/mralaminahamed/tundra/security/advisories/new) — not as public issues.

---

## License

Apache-2.0 © 2026 [Al Amin Ahamed](https://github.com/mralaminahamed)
