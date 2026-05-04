# Tundra v1.0.0 — General Availability

**Release date:** 2026-05-04
**Author:** Al Amin Ahamed

## Overview

Tundra 1.0 is the first stable release of a self-hosted server management platform built to replace Plesk and cPanel for operators who value control, performance, and zero licensing fees.

This release represents approximately 45 weeks of specification-first development across 9 phases (P0–P9), delivering a complete control plane for managing Linux server fleets.

## What's included in v1.0

### Core platform
- Single Rust binary (`tundrad`) — control plane serving the REST API, gRPC agent protocol, WebSocket events, and the React panel
- `tundra-agent` — per-managed-server agent communicating via mTLS gRPC
- `tundra` CLI — operator toolchain

### Supported runtimes
PHP (all versions), Node.js 18/20/22, Python 3.11/3.12/3.13, Go 1.22/1.23, Rust (stable/nightly), Ruby 3.2/3.3, .NET 8/9

### One-click templates (13 built-in)
WordPress, WooCommerce, Laravel, Django, Next.js, Rails, Astro, SvelteKit, Ghost, Hugo, Strapi, Directus, Static HTML

### Key features
- Blue/green deployments with atomic symlink promotion
- Multi-server fleet management with SSH-based agent installation
- Wasmtime plugin sandbox for third-party plugins
- MCP server — connect Claude Desktop, Claude Code, Cursor, Zed
- Full mail stack (Postfix + Dovecot + Rspamd + DKIM)
- restic-backed site backups with GPG encryption
- Let's Encrypt TLS via HTTP-01 / DNS-01 (ACME)
- Per-server + per-site metrics with alert rules
- Namecheap and GitHub core plugins

### Security
- Argon2id password hashing (m=64 MiB, t=3, p=1)
- AES-256-GCM at rest (HKDF-derived per-column keys)
- mTLS 1.3 for agent communication
- CSP `default-src 'self'`, HSTS preload, step-up auth for destructive operations
- Comprehensive audit log with BLAKE3 chain hash

## Installing

```bash
curl -fsSL https://tundra.dev/install.sh | sudo bash
```

Supported: Ubuntu 24.04, Debian 12/13, RHEL 9/10.

## Upgrading from beta

```bash
sudo tundra upgrade --version 1.0.0
```

No breaking schema changes from v0.9.0-beta.1 to v1.0.0.

## Known limitations (v1.x roadmap)

- HA mode (hot-standby) — v1.5
- In-process egress allowlist for plugins — v1.4
- Per-route CSP nonces — v1.3
- OAuth 2.1 for MCP — v1.1
- Windows agent — v1.2

## Changelog summary

Full changelog: `git log v0.0.1..v1.0.0 --oneline`

Phase summary:
- P0: Specifications (17 docs)
- P1: Foundation (crypto, migrations, auth, API skeleton, panel shell)
- P2: Single-host MVP (gRPC, PKI, agent, sites, deployments, job queue)
- P3: Databases & Backups (PG/MySQL/MariaDB/Valkey, restic)
- P4: Email & DNS (PowerDNS, Postfix, Dovecot, Rspamd)
- P5: Multi-runtime (6 runtimes, blue/green, daemons, cron)
- P6: Multi-server (SSH install, metrics, site move, rate limiting)
- P7: Templates & Plugins (Wasmtime, MCP, Namecheap, GitHub, 13 templates)
- P8: Hardening & Beta (installer, CSP/HSTS, fuzzing, k6, acceptance CLI)
- P9: General Availability (indexes, contract tests, SLSA provenance, release workflow)
