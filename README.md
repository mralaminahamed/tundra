# Tundra

A self-hosted, Rust-based server-management platform. A modern alternative to Plesk and cPanel, built for full operator control, latest stable tooling, and native deployment of WordPress, Laravel, Node.js, Python, Go, and Rust applications.

**Author:** Al Amin Ahamed — [GitHub @mralaminahamed](https://github.com/mralaminahamed) · [X @mralaminahamed](https://x.com/mralaminahamed)

---

## Documentation

| Document                                                                              | Purpose                                                     |
|---------------------------------------------------------------------------------------|-------------------------------------------------------------|
| [Architecture](docs/01-architecture/tundra-technical-implementation-plan-v3.md)       | Entry point — component topology, technology stack, roadmap |
| [Database Schema](docs/01-architecture/tundra-database-schema-v1.md)                  | PostgreSQL 18 schema (73 tables, 14 modules)                |
| [API Specification](docs/01-architecture/tundra-api-specification-v1.md)              | REST + gRPC + WebSocket surface                             |
| [Frontend UI Spec](docs/01-architecture/tundra-frontend-ui-spec-v1.md)                | React 19 panel UI design tokens, components, route map      |
| [Deployment Runbook](docs/02-operations/tundra-deployment-runbook-v1.md)              | Engineering-grade install, upgrade, recovery                |
| [Deployment Overview](docs/02-operations/tundra-deployment-overview-v1.md)            | Operator-facing install and routine ops                     |
| [Security Audit](docs/03-security/tundra-security-audit-v1.md)                        | STRIDE threat model, controls catalog                       |
| [Security Overview](docs/03-security/tundra-security-overview-v1.md)                  | Operator-facing security model                              |
| [Test Plan](docs/04-quality/tundra-test-plan-v1.md)                                   | Test pyramid, harnesses, CI gates                           |
| [Acceptance Checklist](docs/04-quality/tundra-acceptance-checklist-v1.md)             | UAT and acceptance testing                                  |
| [Plugin Architecture](docs/05-extensibility/tundra-plugin-architecture-plan-v1.md)    | Wasm sandbox, capability system, WIT contracts              |
| [Additional Core Plugins](docs/05-extensibility/tundra-additional-core-plugins-v1.md) | Namecheap, GitHub, MCP Server plugins                       |
| [Plesk Migration](docs/05-extensibility/tundra-plesk-migration-plan-v1.md)            | Plesk Obsidian migration plugin                             |
| [MCP Server Spec](docs/06-mcp-server/tundra-mcp-server-spec-v1.md)                    | MCP server engineering reference                            |
| [MCP Operator Guide](docs/06-mcp-server/tundra-mcp-server-operator-v1.md)             | MCP server operator guide                                   |
| [MCP Cookbook](docs/06-mcp-server/tundra-mcp-server-cookbook-v1.md)                   | Claude Desktop, Cursor, Zed integration recipes             |
| [Brand Guidelines](docs/07-brand/tundra-brand-guidelines-v1.md)                       | Marks, colour, typography                                   |

## Status

| Phase                    | Status    | Notes                                                                                                |
|--------------------------|-----------|------------------------------------------------------------------------------------------------------|
| P0 — Bootstrap           | ✅ Done    | Workspace scaffold, toolchain, CI skeleton, `deny.toml`                                              |
| P1 — Foundation          | ✅ Done    | Crypto, migrations, domain, repo, auth, API skeleton, panel shell                                    |
| P2 — Single-host MVP     | ✅ Done    | gRPC/PKI/mTLS, agent crates, server enrolment, sites+deployments, job queue, Valkey events, panel UI |
| P3 — Databases & Backups | ✅ Done    | DB engine providers, database REST+panel, restic backup module, self-backup+restore tools            |
| P4 — Email & DNS         | ✅ Done    | PowerDNS/Unbound/Postfix/Dovecot/Rspamd providers, domain+DNS+mail REST+panel, DKIM crypto           |
| P5 — Multi-runtime       | ✅ Done    | Node/Python/Go/Rust/Ruby/.NET providers, blue/green deploy, daemons, cron, site templates            |
| P6 — Production hardening | ⬜ Planned | Nginx/PHP-FPM provisioning, Let's Encrypt ACME, plugin host, billing                                 |

## License

Apache-2.0 — Copyright 2026 Al Amin Ahamed
