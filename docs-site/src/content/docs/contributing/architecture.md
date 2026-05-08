---
title: Architecture
description: Component topology, data flow, and key design decisions.
sidebar:
  order: 3
---

## Component topology

```
┌──────────────────────────────────────────────────────────┐
│  Client tier                                              │
│  Browser (React SPA)  │  AI editor (MCP)  │  tundra CLI  │
└────────────┬──────────┴────────┬──────────┴───────┬───────┘
             │ HTTPS REST + WS   │ MCP / HTTP        │ CLI
             ▼                   ▼                   ▼
┌──────────────────────────────────────────────────────────┐
│  tundrad (control plane)                                  │
│  ┌─────────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │  Axum HTTP  │  │  Tonic   │  │  Job dispatcher    │  │
│  │  API + SPA  │  │  gRPC    │  │  + Event bus       │  │
│  └─────────────┘  └──────────┘  └────────────────────┘  │
│  PostgreSQL 18              Valkey 8                      │
└────────────────────┬─────────────────────────────────────┘
                     │ mTLS gRPC :7447
          ┌──────────┴──────────┐
          ▼                     ▼
  ┌───────────────┐    ┌───────────────┐
  │ tundra-agent  │    │ tundra-agent  │
  │ (server-01)   │    │ (server-02)   │
  │ Caddy         │    │ Caddy         │
  │ PHP-FPM       │    │ PHP-FPM       │
  │ systemd       │    │ systemd       │
  └───────────────┘    └───────────────┘
```

## Key design decisions

### Spec-first API
`proto/openapi.yaml` is written before any handler code. `tests/openapi_drift.rs` fails CI if code diverges from spec.

### Domain layer isolation
`tundrad-domain` has zero I/O. Business rules live here. `tundrad-repo` handles all DB access. `tundrad-api` is a thin adapter between HTTP and the domain.

### EncryptedField\<T\>
Any column holding a secret uses `EncryptedField<T>` — a SQLx custom type that AES-256-GCM-encrypts on write and decrypts on read. Keys are HKDF-derived per column family from the master key and never stored in the DB.

### Audit chain
`audit_log` has a sha3-256 chain hash trigger: each row hashes itself + the previous row's hash. Tamper detection runs on export.

### Up-only migrations
SQLx migrations are strictly forward-only. Reverting a bad migration means: rollback the binary, then write a new forward migration to fix the schema.

### Plugin isolation
Plugins run in Wasmtime with fuel + memory limits + epoch interrupts. All host calls go through a capability gate — plugins cannot access resources not listed in their manifest.

## Database schema modules

| Module | Tables |
|--------|--------|
| Identity & Access | operators, sessions, passkeys, api_tokens, operator_roles, permissions |
| Internal | audit_log, jobs, locks, settings |
| Servers | servers, agent_credentials, services, packages, firewall_rules |
| Sites | sites, applications, deployments, env_vars, releases |
| Certificates | acme_accounts, certificates |
| Databases | database_servers, databases, db_users, db_grants |
| Backups | backup_targets, backup_jobs, backup_snapshots, backup_restores, backup_locks |
| Domains | domains, dns_zones, dns_records, ns_history |
| Mail | mail_domains, dkim_keys, mailboxes, aliases, mail_queue, mail_log |
| Deployments | site_aliases, site_health_checks, site_moves |
| Scheduling | daemons, scheduled_tasks |
| Multiserver | server_metrics_state, maintenance_windows |
| Metrics | metrics_samples (partitioned), alert_rules, alert_deliveries |
| Plugins | plugins, plugin_capabilities, plugin_settings, plugin_kv, plugin_mcp_* |
| WordPress | plugin_wordpress_installations, plugin_wordpress_plugins, plugin_wordpress_themes |
