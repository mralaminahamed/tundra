---
title: Self-Hosting Overview
description: Deployment options for running Tundra in production.
sidebar:
  order: 1
---

Tundra offers two deployment paths:

## Systemd (recommended for production)

The `install.sh` one-liner installs and configures everything as systemd services. This is the preferred method for production — it gives you the full systemd hardening surface (sandboxing, capability drops, filesystem protections).

→ [Systemd install guide](/tundra/self-hosting/systemd/)

## Docker Compose

For operators who prefer containerized deployments, the `docs/09-deployment-bundle/` directory contains three compose stacks:

| Stack | Purpose |
|-------|---------|
| `dev/` | Source-mounted, hot-reload (cargo-watch + Vite HMR) |
| `prod/` | Production-grade with Caddy TLS, Docker secrets |
| `e2e/` | CI test stack with tmpfs state and POST /test/reset |

→ [Docker Compose guide](/tundra/self-hosting/docker-compose/)

## Architecture decisions

- **PostgreSQL 18 only** — no SQLite or MySQL support for the control plane
- **rustls only** — no OpenSSL anywhere in the dependency tree (`deny.toml` enforces this)
- **Up-only migrations** — no down migrations; reverting requires a new forward migration
- **Master key** — 32-byte AES key + BLAKE3 integrity trailer; must be backed up offline
