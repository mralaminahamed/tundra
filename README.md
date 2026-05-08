<div align="center">

<img src="docs/07-brand/tundra-lockup-dark.svg" alt="Tundra" height="48" />

**Self-hosted server management — done right.**

A modern, open-source alternative to Plesk and cPanel.
Single binary. No licensing fees. Full control.

[![CI](https://github.com/mralaminahamed/tundra/actions/workflows/ci.yml/badge.svg)](https://github.com/mralaminahamed/tundra/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/mralaminahamed/tundra?label=release&color=7a8a5c)](https://github.com/mralaminahamed/tundra/releases/latest)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![SLSA Level 3](https://slsa.dev/images/gh-badge-level3.svg)](https://slsa.dev)

[Documentation](https://mralaminahamed.github.io/tundra) · [Changelog](CHANGELOG.md) · [Report a bug](https://github.com/mralaminahamed/tundra/issues/new?template=bug_report.yml) · [Request a feature](https://github.com/mralaminahamed/tundra/issues/new?template=feature_request.yml)

</div>

---

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/mralaminahamed/tundra/main/installer/install.sh | sudo bash
```

Runs on **Ubuntu 24.04**, **Debian 12/13**, **RHEL 9/10**. After install, visit the printed URL to create your owner account.

> **Security:** Verify the installer SHA-256 before running in production. See the [security guide](https://mralaminahamed.github.io/tundra/self-hosting/security/).

---

## What Tundra manages

| Area | Details |
|------|---------|
| **Sites** | PHP, Node.js, Python, Go, Rust, Ruby, .NET — blue/green deploys, atomic rollback |
| **WordPress** | WP-CLI lifecycle, per-install DB isolation, plugins/themes, staging, cloning |
| **File manager** | In-browser CodeMirror editor, upload/download, copy/move, zip extraction |
| **Servers** | Multi-server fleet, SSH agent install, mTLS gRPC mesh, cross-server site move |
| **Databases** | PostgreSQL, MySQL, MariaDB, Valkey — CRUD + access control |
| **Domains & DNS** | Zone editor, 30 provider-ready templates (Cloudflare, Vercel, Fly.io, …) |
| **Mail** | Postfix + Dovecot + Rspamd + DKIM, managed per domain |
| **Backups** | restic + GPG, S3/B2/R2/SFTP, preview-then-confirm restore |
| **Plugins** | Wasmtime sandbox, WIT SDK, MCP AI integration (Claude, Cursor, Zed) |
| **Monitoring** | Per-server + per-site metrics, alert rules, delivery channels |

---

## Architecture

```
Browser / AI editor (MCP)
         │
         ▼
  tundrad  ──── PostgreSQL 18
  (control plane)   Valkey 8
         │  mTLS gRPC
         ▼
  tundra-agent  (per managed server)
         │
  Caddy · PHP-FPM · systemd workloads
```

**Single-host mode** (common): `tundrad` and `tundra-agent` on the same machine.  
**Multi-host mode**: mTLS gRPC on `:7447`. Each server runs its own agent.

---

## Quick start (Docker Compose)

```bash
git clone https://github.com/mralaminahamed/tundra
cd tundra/docs/09-deployment-bundle/dev
cp .env.example .env
docker compose up -d
# Panel: http://localhost:5173
```

---

## Building from source

```bash
# Rust workspace
cargo build --release --workspace

# React panel
cd panel && pnpm install && pnpm build

# Run all tests
cargo test --workspace
cd panel && pnpm test --run && pnpm typecheck
```

---

## Documentation

Full docs at **[mralaminahamed.github.io/tundra](https://mralaminahamed.github.io/tundra)**

| | |
|--|--|
| [Getting Started](https://mralaminahamed.github.io/tundra/getting-started/introduction/) | Install, enroll a server, deploy a site |
| [Self-Hosting](https://mralaminahamed.github.io/tundra/self-hosting/overview/) | Docker Compose, systemd, config reference, security hardening |
| [API Reference](https://mralaminahamed.github.io/tundra/api/overview/) | REST endpoints, auth, errors, WebSocket events |
| [MCP Integration](https://mralaminahamed.github.io/tundra/plugins/mcp/) | Connect Claude Code, Claude Desktop, Cursor, Zed |
| [Plugin Development](https://mralaminahamed.github.io/tundra/plugins/building-plugins/) | Build WASM plugins with the WIT SDK |
| [Contributing](https://mralaminahamed.github.io/tundra/contributing/developer-guide/) | Architecture, conventions, hard constraints, PR checklist |

---

## Status

All 9 phases shipped — **v1.0.0 GA**.

| Phase | Status |
|-------|--------|
| P0 Bootstrap | ✅ |
| P1 Foundation (crypto, auth, migrations) | ✅ |
| P2 Single-host MVP (gRPC, agent, sites) | ✅ |
| P3 Databases & Backups | ✅ |
| P4 Email & DNS | ✅ |
| P5 Multi-runtime + blue/green | ✅ |
| P6 Multi-server fleet | ✅ |
| P7 Templates & Plugins (Wasmtime + MCP) | ✅ |
| P8 Production hardening (ACME, SLSA) | ✅ |
| P9 General Availability | ✅ |

---

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) and the [developer guide](https://mralaminahamed.github.io/tundra/contributing/developer-guide/).

Before opening a PR:

```bash
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cd panel && pnpm typecheck && pnpm lint && pnpm test --run
```

Report security vulnerabilities via [GitHub private advisory](https://github.com/mralaminahamed/tundra/security/advisories/new) — not a public issue.

---

## License

Apache-2.0 © 2026 [Al Amin Ahamed](https://github.com/mralaminahamed)
