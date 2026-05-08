---
title: Introduction
description: What Tundra is, what it does, and when to use it.
sidebar:
  order: 1
---

Tundra is a self-hosted server management platform — a modern, open-source alternative to Plesk and cPanel. It ships as a single static binary per component, has no licensing fees, and gives you full control over your infrastructure.

## What Tundra manages

- **Sites** — PHP, Node.js, Python, Go, Rust, Ruby, .NET with blue/green deployments
- **WordPress** — full WP-CLI lifecycle: install, configure, plugins, themes, staging, cloning
- **Servers** — multi-server fleet with SSH agent install and mTLS gRPC mesh
- **Databases** — PostgreSQL, MySQL, MariaDB, Valkey with CRUD and access control
- **Domains & DNS** — zone management, 30 provider-ready DNS templates
- **Mail** — Postfix + Dovecot + Rspamd + DKIM, managed per domain
- **Backups** — restic-backed, GPG-encrypted, preview-then-confirm restore
- **Plugins** — Wasmtime sandbox with MCP AI integration

## Architecture overview

```
Browser / AI editor
       │
       ▼
  Panel (React SPA)
       │  REST + WebSocket
       ▼
  tundrad  ──────── PostgreSQL 18
  (control plane)── Valkey 8
       │  mTLS gRPC
       ▼
  tundra-agent  (per managed server)
       │
       ▼
  Site workloads, PHP-FPM, Caddy, systemd
```

**Single-host mode** (most common): `tundrad` and `tundra-agent` run on the same machine over a Unix socket.  
**Multi-host mode**: mTLS gRPC over port 7447. The agent on each server connects back to the control plane.

## Components

| Binary | Role |
|--------|------|
| `tundrad` | Control plane — HTTP API, panel SPA, job dispatcher, event bus |
| `tundra-agent` | Per-node agent — provisioning, telemetry, log shipping |
| `tundra` | Operator CLI — migrations, master-key, acceptance tests |

## System requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| OS | Ubuntu 24.04 / Debian 12 / RHEL 9 | Ubuntu 24.04 LTS |
| CPU | 1 vCPU | 2+ vCPU |
| RAM | 512 MB | 2 GB |
| Disk | 5 GB | 20 GB SSD |
| PostgreSQL | 18 | 18 |

## Next steps

- [Quick Install](/tundra/getting-started/quick-install/) — install on a VPS in under 5 minutes
- [Add Your First Server](/tundra/getting-started/first-server/) — enroll a managed server
- [Deploy a Site](/tundra/getting-started/first-site/) — deploy your first web app
