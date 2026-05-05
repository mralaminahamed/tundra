# Tundra

Self-hosted server management — a modern alternative to Plesk and cPanel.
Single binary. No licensing fees. PostgreSQL + Valkey + Caddy.

**Author:** Al Amin Ahamed — [GitHub @mralaminahamed](https://github.com/mralaminahamed) · [X @mralaminahamed](https://x.com/mralaminahamed)

## Quick Install

```bash
curl -fsSL https://tundra.dev/install.sh | sudo bash
```

> **Security note:** Always verify the installer SHA256 before running in production.
> The installer is signed; see [docs/security.md](docs/security.md) for verification steps.

Runs on Ubuntu 24.04, Debian 12/13, RHEL 9/10.
After install, visit the printed setup URL.

## Features

- **Multi-runtime sites** — PHP, Node.js, Python, Go, Rust, Ruby, .NET
- **Blue/green deployments** with atomic symlink promotion
- **Multi-server fleet** with SSH-based agent install and mTLS
- **Plugin system** — Wasmtime sandbox for third-party plugins; native SDK for first-party
- **MCP server** — connect Claude Desktop, Claude Code, Cursor, Zed via Model Context Protocol
- **13 built-in templates** — WordPress, Laravel, Next.js, Django, Rails, and more
- **Mail** — Postfix + Dovecot + Rspamd + DKIM, managed per domain
- **Backups** — restic-backed, GPG-encrypted, preview-then-confirm restore
- **Monitoring** — per-server + per-site metrics, alert rules, delivery channels

## Architecture

```
tundrad (control plane)  →  tundra-agent (per managed server)
       ↕ mTLS gRPC               ↕ systemd + fs
   PostgreSQL 18              Site workloads
   Valkey 8                   PHP-FPM / Node / Python...
```

See `docs/01-architecture/` for the full spec set.

## Building

```bash
cargo build --release --workspace   # Rust binaries
cd panel && pnpm build               # React panel
```

## Testing

```bash
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cd panel && pnpm test --run && pnpm typecheck
```

## Acceptance checks

```bash
tundra acceptance run --url https://panel.example.com --section all
```

## Documentation

### Guides (`guidelines/`)

| Guide | Audience |
|-------|---------|
| [Getting Started](guidelines/getting-started.md) | Operators — install, first server, first site, plugins, upgrade |
| [Developer Guide](guidelines/developer-guide.md) | Contributors — workspace setup, architecture, conventions, hard constraints |
| [MCP Guide](guidelines/mcp-guide.md) | AI integration — Claude Desktop, Claude Code, Cursor, Zed |
| [Plugin Development](guidelines/plugin-development.md) | Plugin authors — core plugins, templates, WASM sandbox |
| [API Reference](guidelines/api-reference.md) | Integrators — REST endpoints, auth, pagination, WebSocket |

### Deep reference (`docs/`)

| Document | Purpose |
|----------|---------|
| [Architecture](docs/01-architecture/tundra-technical-implementation-plan-v3.md) | Component topology, technology stack, roadmap |
| [Database Schema](docs/01-architecture/tundra-database-schema-v1.md) | PostgreSQL 18 schema (73 tables, 14 modules) |
| [API Specification](docs/01-architecture/tundra-api-specification-v1.md) | REST + gRPC + WebSocket surface |
| [Deployment Runbook](docs/02-operations/tundra-deployment-runbook-v1.md) | Engineering-grade install, upgrade, recovery |
| [Security Audit](docs/03-security/tundra-security-audit-v1.md) | STRIDE threat model, controls catalog |
| [Test Plan](docs/04-quality/tundra-test-plan-v1.md) | Test pyramid, harnesses, CI gates |
| [Plugin Architecture](docs/05-extensibility/tundra-plugin-architecture-plan-v1.md) | Wasm sandbox, capability system, WIT contracts |
| [MCP Server Spec](docs/06-mcp-server/tundra-mcp-server-spec-v1.md) | MCP server engineering reference |
| [Security Overview](docs/security.md) | Hardening checklist, trust model |
| [Upgrade Guide](docs/UPGRADING.md) | Migration policy, major-version upgrade notes |

## Status

| Phase | Status | Notes |
|-------|--------|-------|
| P0 — Bootstrap | Done | Workspace scaffold, toolchain, CI skeleton |
| P1 — Foundation | Done | Crypto, migrations, domain, repo, auth, API skeleton, panel shell |
| P2 — Single-host MVP | Done | gRPC/PKI/mTLS, agent crates, server enrolment, sites+deployments |
| P3 — Databases & Backups | Done | DB engine providers, restic backup module, restore tools |
| P4 — Email & DNS | Done | PowerDNS/Postfix/Dovecot/Rspamd providers, DKIM crypto |
| P5 — Multi-runtime | Done | Node/Python/Go/Rust/Ruby/.NET providers, blue/green deploy, cron |
| P6 — Multi-server | Done | SSH installer wizard, cross-server site move, fleet panel |
| P7 — Templates & Plugins | Done | Wasmtime plugin host, MCP server, 13 templates, alert evaluator |
| P8 — Production hardening | Done | Nginx/PHP-FPM provisioning, ACME, billing, acceptance CLI |
| P9 — General Availability | Done | Beta feedback triage, contract tests, SLSA provenance, v1.0.0 GA |

## License

Apache-2.0 — Copyright 2026 Al Amin Ahamed
