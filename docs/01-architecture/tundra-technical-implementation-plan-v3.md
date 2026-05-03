# Tundra — Technical Implementation Plan

> **A self-hosted, Rust-based server-management platform.**
> A modern alternative to Plesk and cPanel, built for full operator control, latest stable tooling, and native deployment of WordPress, Laravel, Node.js, Python, Go, and Rust applications.

---

**Author:** Al Amin Ahamed
**GitHub:** [@mralaminahamed](https://github.com/mralaminahamed)
**X:** [@mralaminahamed](https://x.com/mralaminahamed)

**Document Version:** v3.0
**Document Date:** May 2026
**Status:** Implementation-Ready Specification
**Supersedes:** `tundra-technical-implementation-plan-v2.md`

---

## 1. Executive Summary

### 1.1 Project Background

Plesk and cPanel are the dominant commercial server-management solutions for VPS infrastructure, but both impose practical constraints that have not improved over the past decade:

- High licensing cost relative to the underlying VPS (frequently exceeding the cost of the server itself for small deployments).
- Restricted database engines and versions, typically locked to vendor-approved MySQL/MariaDB releases with limited PostgreSQL support.
- Slow upstream version tracking — PHP, Node.js, Python, and database engines lag official releases by months.
- Closed-source service stack — limited ability to swap web servers, queue runners, or process managers.
- Constrained deployment models — application deployment is essentially restricted to traditional CGI/PHP-FPM patterns; modern deployment ergonomics (zero-downtime, atomic releases, container-based, edge-built) are absent.
- Email and DNS modules are bundled but inflexible.

**Tundra** is a self-hosted server-management platform written in Rust that replaces Plesk and cPanel for personal and team infrastructure use. It runs on Vultr, Hetzner, DigitalOcean, OVH, or any bare-metal/VPS host, and manages a single server or a fleet from a unified control plane.

### 1.2 The Name

The name **Tundra** was chosen deliberately. A tundra is a vast, ordered, low-noise environment where every component endures harsh conditions and operates with minimal supervision — qualities that map directly onto the engineering goals of the platform:

- **Vast** — built to manage one server or hundreds without architectural change.
- **Ordered** — declarative state, idempotent reconciliation, no configuration drift.
- **Resilient** — written in Rust for memory safety and operational robustness.
- **Low-noise** — minimal background overhead (sub-100 MB RSS), no surprise reboots, no hidden licensing fees.

The name is also a quiet acknowledgement of Rust's cultural association with cold, durable, systems-grade infrastructure.

### 1.3 Design Goals

1. **Latest stable tooling, always.** PHP 8.4, Node.js 24 LTS, Python 3.13, Go 1.24, Rust 1.95, PostgreSQL 18, MySQL 8.4, MariaDB 11.x — all installable and switchable per application.
2. **Native deployment, not just hosting.** Each application runs under its own systemd unit, dedicated Linux user, and isolated runtime — no shared PHP-FPM pools, no global Node version conflicts.
3. **Modern deployment ergonomics.** Git-based deploys, zero-downtime atomic releases, environment-variable management, build-step pipelines, deploy hooks — comparable to Laravel Cloud, Vercel, and Ploi.io.
4. **Dual-mode architecture.** Runs as a single-server agent (panel and worker on the same host) or as a control plane managing many remote agents — without a code rewrite.
5. **Memory-safe and performance-conscious.** Written in Rust, deployed as a single static binary per component, with sub-second response times even on 1 vCPU servers.
6. **Unrestricted resources.** Unlimited domains, subdomains, email accounts, databases, FTP users, SSL certificates, and applications — subject only to underlying server capacity.
7. **Complete service coverage.** Web (Nginx/Caddy), database (PostgreSQL/MySQL/MariaDB/Redis/Valkey), mail (Postfix/Dovecot/Rspamd), DNS (PowerDNS/CoreDNS), SSL (Let's Encrypt/ZeroSSL), firewall (nftables), backups (Restic/Borg).
8. **Specification-first.** Every subsystem has a written specification before its implementation. The eight companion documents (see §1.5) anchor the schema, API, deployment, security, and test contracts.

### 1.4 Non-Goals (v1.0)

- **Not a multi-tenant SaaS.** Designed for personal and internal team use; no billing, customer accounts, or reseller hierarchies in v1.
- **Not a Kubernetes alternative.** Tundra manages traditional Linux servers; container orchestration is a *feature* of v1 (via Docker), not a core architectural model.
- **Not Windows-compatible.** Linux-only (Ubuntu 24.04 LTS and Debian 12+ are the supported targets for v1).

### 1.5 What Changed in v3

v2 was the first complete, coherent specification under the Tundra name. v3 reframes that specification in light of the eight technical companion documents produced in May 2026:

- `tundra-database-schema-v1.md` — the canonical schema (73 tables across 14 modules).
- `tundra-api-specification-v1.md` — REST + gRPC + WebSocket surface.
- `tundra-deployment-runbook-v1.md` — engineering-grade install, upgrade, recovery.
- `tundra-deployment-overview-v1.md` — operator-facing install and routine ops.
- `tundra-security-audit-v1.md` — STRIDE threat model and controls catalog.
- `tundra-security-overview-v1.md` — operator-facing security model.
- `tundra-test-plan-v1.md` — engineering test pyramid, harnesses, CI gates.
- `tundra-acceptance-checklist-v1.md` — operator-facing UAT.

This document is now the **architectural anchor**. Detail that previously lived here in long form — the full schema DDL, the full API surface, the full security analysis, the full systemd units — has moved into the companions. v3 retains the architectural essentials (component topology, technology stack, functional module breakdown, roadmap, risks, comparison) and points readers at the right companion when they need depth.

The result: this document stays readable end-to-end in one sitting, while the depth lives in the documents whose audience genuinely needs it.

---

## 2. System Architecture Overview

### 2.1 Component Topology

Tundra consists of four primary components, each a separate Rust binary:

| Component | Binary | Role |
|-----------|--------|------|
| Control Plane API | `tundrad` | The central HTTP/gRPC API, web UI backend, database authority. Single instance per cluster. |
| Node Agent | `tundra-agent` | Runs on every managed server. Executes provisioning, deployment, and monitoring tasks. |
| CLI | `tundra` | Operator-facing command-line tool. Interacts with the API. |
| Web UI | `tundra-ui` | Single-page React application served as static assets by `tundrad`. |

### 2.2 Deployment Modes

**Mode A — Single-Server (default).** `tundrad` and `tundra-agent` run on the same host and communicate over a Unix domain socket. The agent is started as a systemd-managed sibling of the panel.

```
+------------------------------------------+
|              Single VPS Host             |
|                                          |
|  +-----------+      +------------------+ |
|  |  tundrad  |<---->|  tundra-agent    | |
|  | (panel)   | UDS  |  (local exec)    | |
|  +-----------+      +------------------+ |
|        |                   |             |
|        v                   v             |
|  +-----------+      +------------------+ |
|  | PostgreSQL|      | Managed Services | |
|  +-----------+      | (Nginx, PHP-FPM, | |
|                     |  Postgres, ...)  | |
|                     +------------------+ |
+------------------------------------------+
```

**Mode B — Multi-Server (control plane + nodes).** `tundrad` and remote `tundra-agent` instances communicate over gRPC with mutual TLS. Each agent's client certificate is bound to its server UUID; the control plane rejects RPCs whose target server doesn't match the cert SAN.

```
+----------------------+         +----------------------+
|   Control Plane VPS  |  mTLS   |   Managed Node #1    |
|   +----------------+ |  gRPC   | +----------------+   |
|   |    tundrad     |<+--------+>|  tundra-agent  |   |
|   +----------------+ |  :7447  | +----------------+   |
|   +----------------+ |         | +----------------+   |
|   |  PostgreSQL    | |         | | App + Services |   |
|   +----------------+ |         | +----------------+   |
+----------------------+         +----------------------+
                                            ^
                                            |
                                 +----------------------+
                                 |   Managed Node #2    |
                                 | +----------------+   |
                                 | |  tundra-agent  |<-+
                                 | +----------------+   |
                                 | +----------------+   |
                                 | | App + Services |   |
                                 | +----------------+   |
                                 +----------------------+
```

The same binaries are used in both modes; the mode is determined by configuration. A single-server install can be promoted to a control plane later without data loss.

### 2.3 Communication Layers

| Edge | Protocol | Auth | Purpose |
|------|----------|------|---------|
| Browser ↔ `tundrad` | HTTPS (HTTP/2) | Session cookie + CSRF | Web UI |
| CLI ↔ `tundrad` | HTTPS (HTTP/2) | API token (Bearer) | Automation, scripting |
| External integrations ↔ `tundrad` | HTTPS REST + Webhooks | API token, HMAC-signed webhooks | Git push, CI/CD, monitoring |
| `tundrad` ↔ `tundra-agent` (single-host) | Unix domain socket + bincode | OS-level (root only) | Internal RPC |
| `tundrad` ↔ `tundra-agent` (multi-host) | gRPC over mTLS | X.509 client certificate | Remote provisioning, deploy, telemetry |
| `tundra-agent` ↔ system | systemd D-Bus, `nftables`, `iproute2`, file system | root | Service management |

Full surface specification: `tundra-api-specification-v1.md` covers the REST + gRPC + WebSocket contracts, including authentication header semantics, idempotency, pagination, error envelope, and rate limits.

### 2.4 Data Storage

| Store | Technology | Purpose |
|-------|------------|---------|
| Primary database | PostgreSQL 18 | All panel state — operators, servers, sites, applications, certificates, audit logs (73 tables; see schema spec) |
| Cache & rate limiting | Valkey 8 (Redis-compatible) | Session storage, deploy queue, real-time event pub/sub |
| Object storage (optional) | Local filesystem or S3-compatible (MinIO, R2, Spaces) | Backup destination, deployment artifacts |
| Time-series (optional) | VictoriaMetrics or Prometheus | Per-node and per-app metrics |

PostgreSQL 18 is mandatory; SQLite is intentionally not supported as a panel store because the multi-server use case requires concurrent write durability and replication.

The full schema — table-by-table DDL, indexes, partitioning strategy for `metrics_samples`, encrypted-column discipline, soft-delete conventions, migration policy — lives in **`tundra-database-schema-v1.md`**. This document no longer reproduces it.

---

## 3. Technology Stack

### 3.1 Core Stack

| Layer | Technology | Version (May 2026) | Justification |
|-------|------------|---------------------|---------------|
| Systems language | Rust | 1.95.0 (stable) | Memory safety, performance, single static binary |
| Async runtime | Tokio | 1.x | De facto standard, mature ecosystem |
| HTTP framework | Axum | 0.8.x | Tokio-native, type-safe routing, Tower middleware |
| gRPC | Tonic | 0.13.x | Idiomatic gRPC for inter-component RPC |
| Serialization | serde, bincode, prost | latest | JSON for HTTP, bincode for internal RPC, protobuf for gRPC |
| Database access | SQLx | 0.8.x | Compile-time-checked queries against PostgreSQL |
| Migrations | sqlx-cli | 0.8.x | Versioned, up-only SQL migrations |
| Async tasks | Tokio + custom queue | n/a | Background jobs, deploy queue, scheduled tasks |
| Configuration | figment | latest | Layered config from TOML, env vars, secrets |
| Logging | tracing + tracing-subscriber | latest | Structured, contextual logs with OTLP export |
| TLS | rustls | latest | Memory-safe TLS without OpenSSL dependency |
| Process supervision | systemd (host) + Tokio (in-proc) | n/a | OS-native; no reinvented wheels |
| Plugin sandbox | Wasmtime | latest stable | WASM isolation with fuel/memory/epoch limits |

### 3.2 Frontend Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | React | 19.x |
| Build tooling | Vite | 8.x |
| Language | TypeScript | 5.7+ (strict mode) |
| Routing | TanStack Router | 1.x |
| Data fetching | TanStack Query | 5.x |
| State (UI) | Zustand | 5.x |
| Styling | TailwindCSS | 4.x |
| Component library | shadcn/ui (Radix primitives) | latest |
| Icons | Lucide React | latest |
| Forms (simple) | React Hook Form + Zod | latest |
| Forms (wizards) | Formik + Yup | latest |
| Charts | Recharts | latest |
| Real-time | Native WebSocket (forwarded by `tundrad`) | n/a |

Full UI specification — design tokens, component patterns, route map, accessibility baseline (WCAG 2.2 AA), wizard flows: **`tundra-frontend-ui-spec-v1.md`**.

### 3.3 Managed Runtimes (offered to applications)

These are versions Tundra installs and offers to applications. Multiple versions can coexist; each application selects its runtime.

| Runtime | Versions Offered | Source |
|---------|------------------|--------|
| PHP | 8.1, 8.2, 8.3, 8.4 (default) | Ondřej Surý's PPA / Sury Debian repo |
| Node.js | 20 LTS, 22 LTS, 24 LTS (default) | NodeSource repo |
| Python | 3.10, 3.11, 3.12, 3.13 (default) | Deadsnakes PPA / source |
| Go | 1.22, 1.23, 1.24 (default) | Official Go releases |
| Rust | stable (rustup-managed) | rustup |
| Ruby | 3.2, 3.3, 3.4 (default) | rbenv / ruby-build |
| .NET | 8 LTS, 9 (default) | Microsoft repo |

### 3.4 Managed Services

| Service | Engine | Versions |
|---------|--------|----------|
| Web server (primary) | Nginx | 1.27+ |
| Web server (alternative) | Caddy | 2.8+ |
| Reverse proxy / edge | Nginx with Brotli + HTTP/3 | latest |
| PHP execution | PHP-FPM (per-app pool) | matches PHP version |
| Database — relational | PostgreSQL | 16, 17, 18 (default) |
| Database — relational | MySQL | 8.4 LTS |
| Database — relational | MariaDB | 11.4 LTS |
| Cache / KV | Valkey | 8.x (Redis 7 fork, BSD-licensed) |
| Search | MeiliSearch / Typesense | latest stable |
| Mail — SMTP | Postfix | distribution version |
| Mail — IMAP/POP3 | Dovecot | distribution version |
| Mail — Anti-spam | Rspamd | latest |
| Mail — DKIM/DMARC | OpenDKIM + Rspamd | latest |
| DNS — authoritative | PowerDNS Authoritative | 4.9+ |
| DNS — recursor (optional) | PowerDNS Recursor or Unbound | latest |
| SSL — ACME client | Internal Rust ACME client (`instant-acme`) | latest |
| Firewall | nftables | distribution version |
| Backup | Restic | 0.17+ |
| Container runtime (optional) | Docker Engine + Compose v2 | latest stable |
| Process manager (apps) | systemd (template units) | host version |

### 3.5 Operating System Support

| OS | Status | Notes |
|----|--------|-------|
| Ubuntu 24.04 LTS | Tier 1 (primary) | Reference platform; all features tested |
| Ubuntu 22.04 LTS | Tier 1 | Supported through 2027 |
| Debian 12 (Bookworm) | Tier 1 | Server-default friendly |
| Debian 13 (Trixie) | Tier 1 (after release) | |
| AlmaLinux 9 / Rocky 9 | Tier 2 | Supported but not reference |
| Other distros | Unsupported | Not in v1 scope |

---

## 4. Functional Module Breakdown

This section enumerates every user-facing module of Tundra. The detail here is intentionally kept at the *capability* level; the engineering depth (data entities, RPC surface, agent reconciliation contracts) is referenced into the companion documents at the end of each subsection.

### 4.1 Server Management

Provision and manage one or many physical or virtual Linux servers.

**Capabilities.** Add a new server by IP address and SSH credentials (one-time bootstrap); automated installation of `tundra-agent`, base packages, and security hardening; server health dashboard (CPU, memory, disk, network, load average, uptime); server-level package version management (PHP, Node.js, Python versions installed); server-level firewall rules (nftables-based); SSH key management — operator keys synced to all managed servers; sudo policy management for application users; reboot, shutdown, power-cycle (where supported by the underlying provider API — Vultr, DigitalOcean, Hetzner); system update scheduling with maintenance windows; kernel upgrade detection and reboot-required notifications.

Schema: `servers`, `agent_credentials`, `services`, `packages`, `firewall_rules`, `server_metrics_state`. Full DDL in `tundra-database-schema-v1.md` §3.2. Agent enrolment and certificate lifecycle in `tundra-deployment-runbook-v1.md` §5.

### 4.2 Domain & DNS Management

Unlimited domain registration, DNS zone hosting, subdomain management.

**Capabilities.** Unlimited primary domains and subdomains; authoritative DNS zone hosting via PowerDNS; full DNS record support (A, AAAA, CNAME, MX, TXT, SRV, CAA, NS, PTR, SVCB, HTTPS, ALIAS); DNSSEC signing (NSEC3, automatic key rotation); glue record management for delegated nameservers; per-zone editor with validation, syntax highlighting, dry-run preview; bulk import via BIND zone file or AXFR transfer; bulk export; automatic SOA serial increment on edit; optional registrar API integration (Namecheap, Cloudflare, Porkbun) for nameserver updates and renewal alerts.

Schema: `domains`, `dns_records`, `dns_zones`, `domain_registrations`, `ns_history`. DDL in `tundra-database-schema-v1.md` §3.4.

### 4.3 Site & Application Management

Host and deploy web applications of any supported stack.

**Application types (v1.0).**

| Type | Runtime | Deployment Pattern |
|------|---------|--------------------|
| Static site | None | Upload / Git push / build artifact |
| PHP / WordPress | PHP-FPM | Document-root + PHP-FPM pool |
| Laravel | PHP-FPM + queue + scheduler | Atomic releases, supervised queue worker, cron |
| Symfony / generic PHP framework | PHP-FPM | Atomic releases |
| Node.js | systemd unit | Atomic releases, port-bound, reverse-proxied |
| Next.js (custom server) | systemd unit | Build step + `node server.js` |
| Python (Django, FastAPI, Flask) | systemd unit (gunicorn/uvicorn) | venv + atomic releases |
| Go | systemd unit | Build step → static binary → reverse-proxied |
| Rust | systemd unit | Build step → static binary → reverse-proxied |
| Ruby on Rails | systemd unit (Puma) | bundler + atomic releases |
| Docker / Compose | Docker | `docker compose up -d --build` orchestrated by agent |

**Capabilities.** One-click application creation from templates (§4.10); custom application creation with full control over build and run commands; **atomic deployments** — each deploy is a new directory under `releases/`, and `current` is a symlink swap, so rollback is `O(1)`; Git-based deploys with webhook triggers from GitHub, GitLab, Bitbucket, Gitea (or any Git provider); SSH-key-based deploy keys per repository; build pipeline with configurable `pre-build`, `build`, `post-build`, `pre-deploy`, `post-deploy` hooks; environment variable management (encrypted at rest with AES-256-GCM; per-environment scopes); health check (HTTP probe + exit-code probe) post-deploy with automatic rollback on failure; zero-downtime reload for PHP-FPM and reverse-proxied services; per-app PHP-FPM pool with isolated user, file descriptor limits, memory limit, opcache settings; per-app systemd unit for non-PHP runtimes; log streaming (stdout/stderr) over WebSocket; resource quotas per application (CPU shares via cgroups v2, memory limits, disk quota).

Schema: `sites`, `applications`, `deployments`, `env_vars`, `scheduled_tasks`, `releases`, `site_aliases`, `site_health_checks`. DDL in `tundra-database-schema-v1.md` §3.3. Deploy lifecycle (RPC `DeploySite` + progress stream) in `tundra-api-specification-v1.md` §3.2 and §4.4.

### 4.4 Database Management

Provision, manage, and back up databases for hosted applications.

**Capabilities.** Create unlimited PostgreSQL, MySQL, MariaDB, and Valkey instances; multiple major-version coexistence (PostgreSQL 16/17/18 simultaneously, etc.) via apt repositories; per-database user creation with scoped privileges; connection string generation with auto-rotation of credentials; web-based query console (read-only by default; explicit toggle for write); pgvector / extension management for PostgreSQL; per-database performance tuning profiles (Small/Medium/Large/Custom) with auto-tuned `shared_buffers`, `work_mem`, `max_connections`; scheduled logical backups (`pg_dump`, `mysqldump`) and base backups (`pg_basebackup`); point-in-time recovery via WAL archiving (PostgreSQL); replication setup (primary/replica, logical replication); database import from SQL dump or external host (with progress streaming); read-only TLS connection endpoint exposed on a dedicated subdomain (optional).

Schema: `database_servers`, `databases`, `db_users`, `db_grants`. DDL in `tundra-database-schema-v1.md` §3.5.

### 4.5 Email Hosting

Full mail-server functionality with modern anti-spam and authentication.

**Capabilities.** Unlimited mailboxes per domain; unlimited aliases, forwards, and catch-alls; IMAP, POP3, SMTP, Submission (587), SMTPS (465); per-mailbox quota; webmail interface (Roundcube installed on demand, served on `webmail.<domain>`); Sieve filters with web UI; DKIM signing per domain (auto-generated, auto-published in DNS if domain is on Tundra DNS); DMARC and SPF record helpers (one-click insertion of correct records); greylisting, RBL checks, Bayesian filtering via Rspamd; ARC sealing for forwarded mail; TLS with automatic Let's Encrypt certificates for IMAP/SMTP hostnames; mail queue inspection and management; bounce log viewer; per-mailbox vacation auto-responder; optional smarthost configuration (route outbound through Mailgun/SES/Postmark for IP-reputation-sensitive sending).

Schema: `mail_domains`, `mailboxes`, `aliases`, `mail_queue`, `mail_log`, `dkim_keys`, `mail_bridges`. DDL in `tundra-database-schema-v1.md` §3.6.

### 4.6 SSL Certificate Management

Frictionless TLS for all hosted services.

**Capabilities.** Automatic Let's Encrypt issuance via internal ACME client (using `instant-acme` Rust crate); ZeroSSL as alternative ACME provider (account-key-pinned); wildcard certificates via DNS-01 challenge (when domain DNS is managed by Tundra); HTTP-01 challenge for non-DNS-managed domains; automatic renewal at T-30 days; alerting at T-14 if renewal fails; manual certificate upload (BYO certificate + private key); per-site HSTS toggle and HSTS preload registration helper; OCSP stapling enabled by default; per-site cipher-suite profile (Modern / Intermediate / Custom — Mozilla SSL config presets); certificate transparency log monitoring (alerts on unexpected issuance).

Schema: `certificates`, `acme_accounts`. DDL in `tundra-database-schema-v1.md` §3.10. Cryptographic posture (TLS 1.3 only, AEAD cipher restriction) in `tundra-security-audit-v1.md` §5.2.

### 4.7 File Manager & FTP/SFTP

File access for operators and clients without requiring shell login.

**Capabilities.** Web-based file manager: tree navigation, upload/download, edit (with syntax highlighting via Monaco), permissions; per-site SFTP user with chrooted home directory; SSH-key-only authentication (passwords disabled by default; toggleable); per-user upload quota; optional FTP/FTPS via vsftpd (off by default; opt-in for legacy compatibility); audit log of all file-manager actions.

### 4.8 Cron / Scheduled Tasks

Manage scheduled tasks per application without editing system crontabs.

**Capabilities.** Per-application scheduled task editor (cron syntax with human-readable preview and validation); common presets (Every minute, Hourly, Daily at 3 AM, Weekly, Custom); last-run timestamp, exit code, runtime, output captured to log; one-click run-now and pause/resume; maximum-runtime guard (kill task if it exceeds N minutes); lock guard to prevent overlapping runs; failure alerting (email/webhook on non-zero exit code); for Laravel applications, automatic registration of `php artisan schedule:run` every minute.

Schema: `scheduled_tasks`. DDL in `tundra-database-schema-v1.md` §3.3.

### 4.9 Queue Workers / Daemons

Manage long-running per-application processes (queue workers, websocket servers, message consumers).

**Capabilities.** Define daemon (command, working directory, environment, user, restart policy, max instances); translation to systemd template unit `tundra-daemon@<id>.service`; process inspection (PID, memory, CPU, restart count); stdout/stderr log capture with rotation; log streaming over WebSocket; restart, stop, scale (number of replicas); crash backoff with jitter; per-daemon resource limits (cgroups v2).

### 4.10 One-Click Application Templates

Bootstrap common applications with sensible defaults.

**Built-in templates (v1.0).**

| Template | Stack | Notes |
|----------|-------|-------|
| WordPress | PHP 8.4 + MySQL 8.4 | wp-cli-driven install, salt-key generation, default security plugins optional |
| WordPress Multisite | PHP 8.4 + MySQL 8.4 | Subdirectory or subdomain mode |
| WooCommerce-ready WordPress | PHP 8.4 + MySQL 8.4 + Valkey | Object cache configured, HPOS-enabled by default |
| Laravel (skeleton) | PHP 8.4 + PostgreSQL 18 + Valkey | Composer install, key generate, migrate, queue worker, scheduler |
| Statamic | PHP 8.4 | |
| Symfony skeleton | PHP 8.4 + PostgreSQL 18 | |
| Next.js | Node.js 24 + PostgreSQL 18 | Build step `npm run build`, run `npm start` |
| Nuxt 3 | Node.js 24 | Static export or SSR |
| Astro | Node.js 24 | Static export by default |
| SvelteKit | Node.js 24 | Adapter-node deployment |
| Strapi | Node.js 24 + PostgreSQL 18 | |
| Directus | Node.js 24 + PostgreSQL 18 | |
| Ghost | Node.js 24 + MySQL 8.4 | |
| Django | Python 3.13 + PostgreSQL 18 | gunicorn + uvicorn workers |
| FastAPI | Python 3.13 + PostgreSQL 18 | uvicorn |
| Rails | Ruby 3.4 + PostgreSQL 18 + Valkey | Puma + Sidekiq |
| Phoenix | Elixir + PostgreSQL 18 | Future scope; not v1.0 |
| Static (Hugo / Zola / Jekyll) | None | Build step at deploy |

Templates are versioned YAML manifests — adding a new template does not require a panel rebuild.

### 4.11 Backups

Comprehensive, automated, verifiable backups.

**Capabilities.** Per-application backup (files + database); per-server backup (full system snapshot of `/var`, `/etc`, mail spools, databases); Restic-based deduplicated, encrypted, incremental backups; backup destinations — local disk, S3, Backblaze B2, Wasabi, MinIO, any S3-compatible target, SFTP, or rsync.net; schedule per backup job (hourly/daily/weekly/custom cron); retention policy — keep N hourly + N daily + N weekly + N monthly + N yearly (Restic forget policy); restore — one-click restore to original location, restore to alternative location, browse-and-extract individual files; backup verification job (random 5% of snapshots verified weekly); off-site replication (mirror to second destination); encrypted credentials at rest (panel database) and in transit (TLS to backup target); backup health dashboard (last successful run, size, deduplication ratio).

Schema: `backup_targets`, `backup_jobs`, `backup_snapshots`, `backup_restores`, `backup_locks`. DDL in `tundra-database-schema-v1.md` §3.7. Self-backup procedure (Tundra backing up itself, off-host) in `tundra-deployment-runbook-v1.md` §7 and the operator companion `tundra-deployment-overview-v1.md` §6. Verification cadence in `tundra-acceptance-checklist-v1.md` §10–11.

### 4.12 Monitoring & Alerting

Visibility into server, service, and application health.

**Capabilities.** Per-server metrics (CPU, memory, swap, disk usage, disk I/O, network, load); per-service metrics (PHP-FPM pool status, Nginx requests, PostgreSQL connections, MySQL threads, Valkey memory); per-application metrics (process memory, CPU time, request count via Nginx logs); real-time charts (last 1h, 24h, 7d, 30d); configurable alert rules (threshold, duration, severity); alert channels (email, Slack, Discord, Telegram, generic webhook, PagerDuty); health-check probes (HTTP/TCP/Ping) from the control plane to all managed sites; synthetic uptime monitoring with public status page (optional, on subdomain); log aggregation — per-application log streaming, full-text search over the last 7 days (configurable); audit log — every panel action with actor, timestamp, IP, before/after diff.

Schema: `metrics_samples` (partitioned monthly), `alert_rules`, `alert_deliveries`, `event_subscriptions`, `audit_log`. DDL in `tundra-database-schema-v1.md` §3.11–3.12. Audit chain integrity (BLAKE3-over-canonical-JSON, tamper-evident) in `tundra-security-audit-v1.md` §4.5.

### 4.13 Operator & Access Management

Role-based access for operators (panel-level), not end-user accounts.

**Capabilities.** Operator accounts with email + password (Argon2id, m=64MiB t=3 p=1); mandatory 2FA — TOTP, WebAuthn (FIDO2 hardware keys preferred); recovery codes (one-time use, 10 generated); roles — Owner (full), Admin (full except billing/operator management), Operator (manage assigned servers/sites), Read-only; per-resource ACL (assign specific servers, sites, or domains to a non-Owner operator); API tokens with scopes (read, deploy, write, admin) and expiry; IP allow-listing per operator (optional); brute-force protection (rate limit, account lockout, exponential backoff); SSO via OIDC (optional, v1.5 — not v1.0); audit log of every login, action, and configuration change.

Schema: `operators`, `sessions`, `passkeys`, `api_tokens`, `roles`, `permissions`, `role_permissions`, `operator_roles`, `auth_events`. DDL in `tundra-database-schema-v1.md` §3.1. Authn/authz model (sign-in flows, step-up, RBAC enforcement, scope grants) in `tundra-security-audit-v1.md` §6–7.

### 4.14 CLI & API

Full-featured command-line and HTTP API for automation.

**Capabilities.** `tundra` CLI written in Rust, distributed as a single static binary (Linux x86_64, ARM64, macOS Universal, Windows x86_64); authenticated via `tundra login` (OAuth-style device flow) or environment variable `TUNDRA_API_TOKEN`; full surface coverage — every UI action has a CLI equivalent; JSON output mode for piping (`--output json`); watch mode for streaming logs and deploy progress; HTTP REST API documented via OpenAPI 3.1 specification; gRPC API (future, v1.5) for high-throughput automation.

Surface specification: `tundra-api-specification-v1.md`.

### 4.15 Plugins (introduced in v1.0)

Third-party extensibility through Wasm-sandboxed plugins.

**Capabilities.** Sandbox via Wasmtime with fuel/memory/epoch limits; capability-based interface (declared in plugin manifest, granted by operator, revocable); host APIs for DB-read, KV, declared-SQL, HTTP-outbound, FS, secrets, events, jobs, locks; plugin-exposed REST endpoints under `/api/v1/plugins/:plugin_id/`; signed plugin manifests; per-plugin disk quota; capability audit on every host call.

Schema: `plugins`, `plugin_capabilities`, `plugin_settings`, `plugin_jobs`, `plugin_events`, `plugin_kv`, `plugin_registry_entries`, `plugin_data_quotas`. DDL in `tundra-database-schema-v1.md` §3.8. Sandbox model + WIT contracts in `tundra-plugin-architecture-plan-v1.md`. Threat analysis in `tundra-security-audit-v1.md` §4.4 and §9.4.

---

## 5. Detailed Architecture — Internal Components

### 5.1 The `tundrad` Binary

Responsibilities:

1. **HTTP API server** — serves the OpenAPI-described REST endpoints, OAuth/session endpoints, WebSocket endpoints for real-time streams, and static assets for the React UI.
2. **gRPC server** (multi-server mode) — accepts mTLS connections from `tundra-agent` instances on remote nodes.
3. **Database authority** — owns the PostgreSQL panel database; all writes flow through it.
4. **Job dispatcher** — enqueues background jobs (deployments, backups, health checks) onto Valkey-backed queues, durable jobs onto the `jobs` table.
5. **Event bus** — publishes events (deploy started, alert fired, certificate renewed) to a Valkey pub/sub channel for live UI updates.
6. **Plugin host** — loads, sandboxes, and dispatches capability-checked calls to plugins.

Internal layout (Rust crate workspace, abridged; the full layout — including the test harness crates referenced by `tundra-test-plan-v1.md` — lives in §11.3):

```
tundrad/
├── crates/
│   ├── tundrad-bin/             # Binary entry point
│   ├── tundrad-api/             # Axum HTTP routes, request/response DTOs
│   ├── tundrad-grpc/            # Tonic gRPC service definitions
│   ├── tundrad-domain/          # Pure domain types and business logic (no I/O)
│   ├── tundrad-repo/            # SQLx repositories, transactional boundaries
│   ├── tundrad-jobs/            # Background job definitions (deploy, backup, etc.)
│   ├── tundrad-events/          # Event bus publisher/subscriber
│   ├── tundrad-acme/            # ACME / Let's Encrypt client wrapper
│   ├── tundrad-auth/            # Sessions, tokens, 2FA, RBAC
│   ├── tundrad-crypto/          # Master-key, HKDF, AEAD wrappers, EncryptedField<T>
│   ├── tundrad-plugin-host/     # Wasmtime, capability checks, fuel/memory limits
│   ├── tundrad-config/          # Layered configuration loader
│   └── tundrad-telemetry/       # Tracing, metrics export
├── migrations/                  # SQLx migrations (canonical DDL)
├── proto/                       # Protobuf definitions for tundra-agent gRPC
└── ui/                          # tundra-ui React source (built into static assets)
```

### 5.2 The `tundra-agent` Binary

Responsibilities:

1. **Provisioning executor** — installs packages, configures services, writes systemd units, deploys files.
2. **Telemetry collector** — gathers system and service metrics, ships them to `tundrad`.
3. **Log shipper** — tails application logs and forwards them on demand to `tundrad` (over WebSocket bridged through gRPC).
4. **Service watchdog** — observes systemd unit states and reports failures.

Architectural notes:

- The agent is **idempotent and declarative.** `tundrad` sends a desired-state document for the node ("I want PHP 8.3 and 8.4 installed, these PHP-FPM pools active, this Nginx config rendered, this systemd unit running"). The agent reconciles current state to desired state. This avoids drift and supports retry semantics.
- Provisioning is **transactional where possible.** Multi-step changes are written to staging directories and atomically swapped (e.g., new Nginx config validated with `nginx -t` before the swap; rolled back if reload fails).
- The agent runs as **root** (required for systemd, package management, file ownership, firewall). It exposes no public network surface — only Unix socket (single-host) or mTLS gRPC inbound from the control plane.
- The agent supports **offline operation** for already-provisioned services. If the control plane is unreachable, applications continue to run; the agent reconnects and reconciles when the control plane returns.

Each managed service is a `Provider` trait implementation. Adding a new managed service (e.g., RabbitMQ or Mosquitto) is a self-contained PR against the `tundra-agent-providers` crate.

### 5.3 The `tundra` CLI

Distributed as a single static binary built with `--target x86_64-unknown-linux-musl` (and equivalents for ARM64 / macOS / Windows). Wraps the same OpenAPI client used by the web UI, generated from the spec at build time.

```
tundra
├── login                  # Device-flow authentication
├── server
│   ├── add | list | inspect | remove
│   └── ssh                # ssh into a managed server
├── site
│   ├── create | list | inspect | remove
│   └── deploy
├── domain ...
├── db ...
├── mail ...
├── cert ...
├── backup
│   ├── run | restore | list
└── logs <site>            # tail logs
```

### 5.4 The `tundra-ui` React Application

Single-page application served as static assets by `tundrad` from `/_app`. All API calls go through `/api/v1/...` on the same origin (no CORS). Tokens stored in `HttpOnly`, `Secure`, `SameSite=Strict` cookies. WebSocket endpoint at `/api/v1/events` for live updates, log streaming, deploy progress. Strict CSP: `default-src 'self'; script-src 'self'; ...`. No inline scripts except a Vite-injected nonce. Dark mode and light mode (defaults to system preference).

Full UI specification — design tokens, component patterns, route map, accessibility, wizard flows: **`tundra-frontend-ui-spec-v1.md`**.

---

## 6. Database Schema — Anchor Section

The full schema is the subject of its own document. This section anchors the high-level shape so a reader of the architecture plan understands what exists without paging out to the schema doc:

- **PostgreSQL 18** is the only supported panel store. Native `uuidv7()` primary keys for time-ordered IDs.
- **73 tables across 14 modules**: Identity & Access, Servers, Sites, Domains, Databases, Mail, Backups, Plugins, Migrations, Certificates, Real-Time, Metrics, Internal, Federation.
- **Encrypted columns** for every secret-bearing field (operator TOTP, recovery codes, integration secrets, env-var secrets, DKIM private keys, ACME account keys, certificate private keys, agent credentials material). AES-256-GCM under HKDF-derived data keys, master key in a single 0400 file.
- **Append-only audit** with BLAKE3-over-canonical-JSON chain hashes; 90-day online + 7-year archive.
- **Partitioned `metrics_samples`** by month, detached and Parquet-archived after 90 days.
- **Up-only migrations** managed by `sqlx-cli`. Reverting a deploy is code-revert + new migration, never down-migration.

Full DDL, index strategy, soft-delete discipline, partitioning policy, encryption surface, migration policy: **`tundra-database-schema-v1.md`** (999 lines, the single source of truth for the schema).

---

## 7. Security Architecture — Anchor Section

Security is fully specified across two companion documents:

- **`tundra-security-audit-v1.md`** — the engineering threat model. STRIDE per asset (operator identities, master key, agent fleet, plugin sandbox, audit log, workload data); attack trees for the four highest-impact compromises (Owner session, agent host, master key, plugin escape); cryptographic design (Argon2id parameters, HKDF info strings, AEAD nonce discipline, BLAKE3 chain, TLS 1.3 cipher restrictions); authentication & session management; RBAC model with resource-scoped grants; operational security (systemd hardening directives, file permissions, network exposure, outbound egress); test posture (SAST, dependency hygiene, fuzzing, regression suite); and a known-gaps roadmap.

- **`tundra-security-overview-v1.md`** — the operator-facing summary. What Tundra protects and how, what's the operator's responsibility, indicators of compromise, incident response procedures, vulnerability reporting.

The architectural commitments at the level of this plan:

- **Memory safety end-to-end** in the Rust components.
- **mTLS for the agent fleet** with per-agent client certs bound to the server UUID via SAN.
- **Wasm sandbox for plugins** with capability-based host access, fuel/memory/epoch limits, declared-SQL only.
- **Encrypted-at-rest secrets** via centralized `EncryptedField<T>` in SQLx.
- **Append-only audit** with tamper-evident chain hashing.
- **Step-up authentication** for sensitive operations (master-key rotation, server deletion, admin token issuance with cluster-admin scope).

---

## 8. Deployment & Application Lifecycle — Anchor Section

Deployment of Tundra itself, and operation of Tundra after deployment, is specified across two companions:

- **`tundra-deployment-runbook-v1.md`** — the engineering edition. Manual install procedure, full hardened systemd unit, master-key rotation, agent CA rotation, cross-server site migration, PostgreSQL maintenance, troubleshooting trees ("the panel is unreachable", "an agent is offline", "a deploy is stuck", "PostgreSQL is bloated"), self-backup anatomy, manual restore.

- **`tundra-deployment-overview-v1.md`** — the operator edition. One-line installer, first-time setup, adding servers, upgrades, operator management, self-backup configuration, restore procedure, "when to read the engineering edition."

The architectural commitments at the level of this plan:

- **Single-binary deployment** for each component.
- **systemd-native** process supervision; no reinvented supervisor.
- **Atomic upgrades** of `tundrad` with automatic rollback on health-check failure within 60 seconds.
- **Off-host self-backup** as a hard requirement, encrypted to operator-supplied GPG public key.
- **24-hour trust-on-overlap** for agent CA rotation.
- **5-minute target install time** on a fresh 1 vCPU / 2 GB Vultr instance (validated by the acceptance checklist).

---

## 9. Backup & Disaster Recovery — Anchor Section

Backups are functional capability §4.11. Disaster recovery — restoring Tundra itself after catastrophic failure — is specified in `tundra-deployment-runbook-v1.md` §7 (engineering) and `tundra-deployment-overview-v1.md` §6 (operator), with the verification cadence in `tundra-acceptance-checklist-v1.md` §11.

The architectural commitments:

- **The self-backup target must not be managed by Tundra itself.** No backup of Tundra is allowed to live only in storage Tundra controls.
- **Self-backup is encrypted** to an operator-supplied GPG public key. The matching private key must not live on the control-plane host.
- **The master key is included in the self-backup** but a separate offline-encrypted copy is also required.
- **Quarterly restore drill** is mandatory (operator acceptance checklist §11).

---

## 10. Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| `tundrad` cold start | < 300 ms | From systemd `start` to `READY` notification |
| `tundrad` baseline RSS | < 100 MB | Idle, single-server mode, no plugins |
| `tundrad` baseline RSS | < 200 MB | Idle, control plane managing 50 nodes |
| Panel API p95 latency (uncached) | < 80 ms | On 2 vCPU / 4 GB host with 50 sites |
| Panel API p95 latency (cached) | < 20 ms | |
| Deploy queue dispatch latency | < 500 ms | From `POST /sites/:id/deployments` to agent receiving `DeploySite` |
| Live log first-byte latency | < 250 ms | From log emission on agent to delivery via WebSocket |
| Agent metrics ingestion | 1000 servers @ 10s heartbeat | Sustained, RSS growth < 5% / 24h |
| Site provisioning end-to-end | < 90 s | Including TLS issuance via HTTP-01 |

Validated continuously by the load and performance suites in `tundra-test-plan-v1.md` §9 (criterion micro-benches per-PR; k6 load tests weekly; 24-hour memory-leak sweep monthly).

---

## 11. Implementation Roadmap

### 11.1 Phase Breakdown

| Phase | Duration | Scope |
|-------|----------|-------|
| **Phase 0 — Specifications** | 4 weeks | ✅ Complete (May 2026). Architecture plan v3, database schema, API specification, deployment runbooks, security audit, test plan, frontend UI spec, plugin architecture, brand guidelines. |
| **Phase 1 — Foundation** | 4 weeks | Workspace setup, CI gate definitions per `tundra-test-plan-v1.md` §7, panel DB schema, auth, RBAC, audit log, base Axum API skeleton, base React UI |
| **Phase 2 — Single-host MVP** | 8 weeks | `tundra-agent` base, server provisioning, site creation (PHP/Laravel), Nginx + PHP-FPM rendering, Let's Encrypt issuance, deploy from Git, environment vars |
| **Phase 3 — Databases & Backups** | 4 weeks | PostgreSQL/MySQL/MariaDB/Valkey provisioning, database & user management, query console, Restic-based backups, restore |
| **Phase 4 — Email & DNS** | 6 weeks | Postfix/Dovecot/Rspamd provisioning, mailbox management, webmail install, PowerDNS integration, zone editor, DNSSEC |
| **Phase 5 — Multi-runtime** | 5 weeks | Node.js, Python, Go, Rust, Ruby application types; systemd template units; reverse proxy; blue/green for non-PHP |
| **Phase 6 — Multi-server** | 6 weeks | mTLS gRPC channel, control-plane mode, agent provisioning over SSH, server health, cross-server deploys |
| **Phase 7 — Templates & Plugins** | 5 weeks | One-click templates (WordPress, Laravel, Next.js, Django, …), Docker provider, scheduled tasks, daemons, monitoring + alerting; Wasm plugin host MVP |
| **Phase 8 — Hardening & Beta** | 4 weeks | Security audit (external), fuzz testing, load testing, documentation polish, installer polish, beta release |
| **Phase 9 — General Availability** | 3 weeks | Bug fixes from beta, v1.0 release, post-launch support |

**Total: ~45 weeks (~10.5 months) from start of Phase 1.** With one assisting developer, ~6 months.

The Phase 0 specification effort (this plan plus the eight companions plus the frontend UI spec, plugin architecture plan, and brand guidelines) is complete. Phase 1 starts from a written contract for every subsystem rather than from a sketch — which is the entire point of the spec-first discipline.

### 11.2 Milestones

| Milestone | Target | Definition of Done |
|-----------|--------|---------------------|
| M0 — Hello-Tundra | End of Phase 1 | Operator can log in, see dashboard, manually add a server placeholder |
| M1 — First Site Live | End of Phase 2 | A real Laravel site deployed via Git push, with TLS, on a fresh Vultr VPS, in under 5 minutes from `tundra server add` to publicly accessible HTTPS site |
| M2 — Database Self-Sufficiency | End of Phase 3 | Create PG18 + MySQL 8.4, run a Laravel migration through the panel, take and restore a backup |
| M3 — Mail & DNS Live | End of Phase 4 | Send and receive email on a Tundra-hosted domain with passing SPF, DKIM, DMARC; full DNS zone editing via UI |
| M4 — All Runtimes Online | End of Phase 5 | Node.js, Python, Go, Rust apps each deployable via the panel |
| M5 — Multi-Server | End of Phase 6 | A control plane managing 3 nodes; deploy targeting a specific node works |
| M6 — Plugins & Templates | End of Phase 7 | One-click WordPress, Laravel, Next.js, Django, Rails — all working end-to-end. At least one Wasm plugin loaded and exercised. |
| M7 — Beta | End of Phase 8 | Self-installable from a single command on a fresh Ubuntu 24.04 server; the operator acceptance checklist passes end-to-end on a fresh install |
| M8 — v1.0 GA | End of Phase 9 | Public release |

### 11.3 Repository Layout

```
tundra/
├── Cargo.toml                     # Workspace root
├── README.md
├── LICENSE
├── crates/
│   ├── tundrad-bin/
│   ├── tundrad-api/
│   ├── tundrad-grpc/
│   ├── tundrad-domain/
│   ├── tundrad-repo/
│   ├── tundrad-jobs/
│   ├── tundrad-events/
│   ├── tundrad-acme/
│   ├── tundrad-auth/
│   ├── tundrad-crypto/
│   ├── tundrad-plugin-host/
│   ├── tundrad-config/
│   ├── tundrad-telemetry/
│   ├── tundra-agent-bin/
│   ├── tundra-agent-rpc/
│   ├── tundra-agent-reconciler/
│   ├── tundra-agent-providers/
│   ├── tundra-agent-metrics/
│   ├── tundra-agent-logs/
│   ├── tundra-cli/
│   ├── tundra-shared/             # types shared across components
│   └── tundra-test-harness/       # integration test harness used by tests/
├── proto/
│   └── tundra/v1/agent.proto
├── migrations/
├── ui/                            # React app (separate package.json)
├── installer/
│   └── install.sh                 # one-line installer
├── docs/
│   ├── architecture/              # this plan + companions
│   ├── runbooks/
│   └── api/
└── .github/
    └── workflows/
        ├── ci.yml
        ├── release.yml
        └── nightly.yml
```

---

## 12. Cost & Resource Footprint

### 12.1 Self-Hosted Cost (Operator's Perspective)

There is no licensing fee. The cost is the underlying infrastructure:

| Deployment Size | Recommended Spec | Approximate Monthly Cost (Vultr / Hetzner) |
|-----------------|-------------------|---------------------------------------------|
| Single-server, 1–3 sites | 1 vCPU / 2 GB / 50 GB | USD 6 – 8 |
| Single-server, up to 10 sites | 2 vCPU / 4 GB / 80 GB | USD 12 – 18 |
| Single-server, heavy workload | 4 vCPU / 8 GB / 160 GB | USD 24 – 40 |
| Control plane only | 2 vCPU / 4 GB / 80 GB | USD 12 – 18 |
| Managed app node | depends on apps | varies |

For comparison: a typical Plesk Web Pro license is around USD 15 / month *on top of* the underlying VPS. cPanel pricing is similar or higher. Tundra eliminates that recurring fee entirely.

### 12.2 Development Cost

Not applicable — Tundra is a personal/internal tool. Time is the only cost.

---

## 13. Open Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Mail deliverability — IP reputation on cheap VPS | High | High | Smarthost integration (Mailgun/SES/Postmark) is a first-class feature; documented as recommended for production |
| ACME rate limits when bulk-creating sites | Medium | Medium | Use Let's Encrypt staging in tests; ZeroSSL fallback; certificate caching |
| Major version upgrade pain (e.g., PHP 8.4 → 8.5) | Medium | Medium | Multi-version coexistence by design; per-app version selection; documented upgrade paths |
| Compromise of master key | Low | Critical | TPM sealing where available (v2 roadmap); offline backup mandatory; audit and alerting on key file access; recovery procedure in `tundra-deployment-runbook-v1.md` §4 |
| `tundra-agent` crash leaves services running | Low | Low | systemd manages services directly; agent crash does not stop sites; agent restarts on its own systemd unit |
| Drift between agent and control plane in network partition | Medium | Low | Reconciliation is idempotent; agent retries with exponential backoff; full reconcile on reconnect |
| Long-running deploys block the queue | Medium | Low | Per-application deploy lock; concurrent deploys across applications; configurable timeout |
| Database backup window during peak traffic | Low | Medium | Logical backups use replicas where configured; off-peak scheduling; throughput throttling for `pg_dump` |
| Single-developer maintenance burden | High | Medium | Heavy use of stable, well-supported upstream tools; small dependency surface; comprehensive test suite per `tundra-test-plan-v1.md`; spec-first discipline reduces bus factor |
| Wasmtime CVE in plugin sandbox | Low | High | Pin to vetted release; track via `cargo-deny`; defence in depth — `tundrad` runs unprivileged; documented in `tundra-security-audit-v1.md` §4.4 |
| Spec-implementation drift over time | Medium | Medium | Contract tests in CI verify implementation against `tundra-api-specification-v1.md` (OpenAPI replay) and against migration files (schema) |

---

## 14. Comparison Matrix

| Capability | Tundra v1.0 | Plesk Obsidian | cPanel | Cloudron | CyberPanel | Ploi.io |
|------------|-------------|----------------|--------|----------|------------|---------|
| Self-hosted | ✓ | ✓ | ✓ | ✓ | ✓ | partial |
| Open availability | personal / OSS-leaning | commercial | commercial | freemium | OSS | commercial |
| Latest PHP within days of release | ✓ | delayed | delayed | delayed | mixed | ✓ |
| Per-app PHP version | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Native Node.js apps | ✓ | partial | partial | ✓ | partial | ✓ |
| Native Python apps | ✓ | partial | partial | ✓ | partial | ✓ |
| Native Go / Rust apps | ✓ | ✗ | ✗ | partial | ✗ | partial |
| PostgreSQL 18 | ✓ | partial | ✗ | ✓ | ✗ | ✓ |
| Atomic deploys + rollback | ✓ | ✗ | ✗ | partial | ✗ | ✓ |
| Git-based deploys | ✓ | partial | partial | partial | partial | ✓ |
| Built-in mail server | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Built-in DNS | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Backup with restic-grade dedup | ✓ | partial | partial | ✓ | partial | partial |
| Multi-server control plane | ✓ | partial | ✗ | ✗ | ✗ | ✓ |
| Wasm plugin sandbox | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Single static binary install | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Memory safety (Rust) | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Spec-first documentation | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

Tundra's distinguishing positions are: **memory safety, native multi-runtime support, modern deployment ergonomics, sandboxed third-party extensibility, and the latest upstream tooling with no licensing layer — all anchored in a spec-first documentation discipline.**

---

## 15. Documentation Suite Map

The Tundra documentation set as of v3 of this plan:

### 15.1 Architecture & Specifications

| Document | Audience | Purpose |
|----------|----------|---------|
| `tundra-technical-implementation-plan-v3.md` *(this document)* | Both | Architectural anchor; entry point for new readers |
| `tundra-database-schema-v1.md` | Engineering | Canonical PostgreSQL 18 schema |
| `tundra-api-specification-v1.md` | Engineering | REST + gRPC + WebSocket surface |
| `tundra-frontend-ui-spec-v1.md` | Engineering | Panel UI design tokens, components, route map |
| `tundra-plugin-architecture-plan-v1.md` | Engineering | Wasm sandbox, capability system, WIT contracts |
| `tundra-additional-core-plugins-v1.md` | Engineering | Namecheap, GitHub, MCP-server core plugins |

### 15.2 Operations

| Document | Audience | Purpose |
|----------|----------|---------|
| `tundra-deployment-runbook-v1.md` | Engineering | Manual install, master-key rotation, troubleshooting trees |
| `tundra-deployment-overview-v1.md` | Operator | One-line install, routine ops, restore |

### 15.3 Security

| Document | Audience | Purpose |
|----------|----------|---------|
| `tundra-security-audit-v1.md` | Engineering | STRIDE threat model, controls catalog, attack trees |
| `tundra-security-overview-v1.md` | Operator | Plain-language security model, IoCs, incident response |

### 15.4 Quality & Acceptance

| Document | Audience | Purpose |
|----------|----------|---------|
| `tundra-test-plan-v1.md` | Engineering | Test pyramid, harnesses, CI gates |
| `tundra-acceptance-checklist-v1.md` | Operator | UAT, post-install/post-upgrade smoke, quarterly drill |

### 15.5 Migration

| Document | Audience | Purpose |
|----------|----------|---------|
| `tundra-plesk-migration-plan-v1.md` | Engineering | Plesk-source migration plugin, six-state machine, mail bridge |

### 15.6 Brand

| Document | Audience | Purpose |
|----------|----------|---------|
| `tundra-brand-guidelines-v1.md` + `tundra-brand-assets-v1.zip` | Both | Marks, lockups, typography, colour, OG cards |

### 15.7 Reading Order Recommendations

**For a new engineer joining the project:**

1. This document (architecture).
2. `tundra-database-schema-v1.md` (data model).
3. `tundra-api-specification-v1.md` (the contract you'll implement against).
4. `tundra-test-plan-v1.md` (how you'll verify your work).
5. `tundra-security-audit-v1.md` (the threat model your code must respect).
6. The runbooks and acceptance checklist last, as you near release.

**For a new operator deploying Tundra:**

1. `tundra-deployment-overview-v1.md` (install + first-time setup).
2. `tundra-acceptance-checklist-v1.md` (verify it works).
3. `tundra-security-overview-v1.md` (what's your responsibility).
4. The engineering runbook only when you hit something that needs it.

**For a security reviewer:**

1. `tundra-security-audit-v1.md` (the threat model).
2. This document §6–9 (architectural commitments).
3. `tundra-database-schema-v1.md` §9 (encryption surface).
4. `tundra-test-plan-v1.md` §10 (security testing posture).

---

## 16. Appendix A — Sample Nginx Server Block (Generated)

```nginx
# /etc/nginx/sites-available/<public_id>.conf
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    return 301 https://example.com$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    http3 on;
    server_name example.com;

    ssl_certificate     /etc/tundra/certs/<public_id>/fullchain.pem;
    ssl_certificate_key /etc/tundra/certs/<public_id>/privkey.pem;
    ssl_protocols TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;

    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    root /srv/sites/<public_id>/current/public;
    index index.php index.html;

    access_log /srv/sites/<public_id>/shared/logs/nginx-access.log;
    error_log  /srv/sites/<public_id>/shared/logs/nginx-error.log;

    client_max_body_size 64m;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php8.4-fpm-<public_id>.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }
}
```

---

## 17. Appendix B — Sample systemd Unit (Generated, Node.js Application)

```ini
# /etc/systemd/system/tundra-app@<public_id>.service
[Unit]
Description=Tundra application <domain>
After=network.target

[Service]
Type=simple
User=tundra-<public_id>
Group=tundra-<public_id>
WorkingDirectory=/srv/sites/<public_id>/current
EnvironmentFile=/srv/sites/<public_id>/shared/.env
ExecStart=/usr/local/tundra/runtimes/node-24/bin/node server.js
Restart=on-failure
RestartSec=2
TimeoutStopSec=15

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ReadWritePaths=/srv/sites/<public_id>/shared
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
RestrictNamespaces=true
LockPersonality=true
MemoryDenyWriteExecute=true
RestrictRealtime=true
SystemCallArchitectures=native
SystemCallFilter=@system-service

# Resources
MemoryMax=512M
CPUQuota=150%

[Install]
WantedBy=multi-user.target
```

The hardened systemd unit for `tundrad` itself — including the Wasmtime exception for `MemoryDenyWriteExecute` — lives in `tundra-deployment-runbook-v1.md` §3.

---

## 18. Appendix C — Glossary

| Term | Meaning |
|------|---------|
| Control Plane | The host running `tundrad`. In single-server mode, this is also the application host. |
| Node / Managed Server | A host running `tundra-agent` and hosting applications. |
| Site | A logical hosting unit: a domain + application + TLS + reverse-proxy config. |
| Application | The deployable code that runs behind a Site. |
| Release | A specific deployed version of an application (timestamped directory). |
| Deployment | The act of producing a new Release; a row in `deployments`. |
| Reconciliation | The agent-side process of bringing observed state in line with the desired state declared by `tundrad`. |
| Provider (agent) | A pluggable module inside `tundra-agent` that knows how to manage one specific service (Nginx, Postfix, etc.). |
| Plugin | A Wasm-sandboxed third-party extension loaded by `tundrad`. Distinct from agent providers. |
| Master Key | The 32-byte AES-256 key (with a BLAKE3 trailer for integrity) used to derive AEAD data keys for encrypted columns. |
| Self-backup | Tundra's backup of itself (operator database, master key, internal CA). Must live off-host. |

---

## 19. Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.0 | May 2026 | Al Amin Ahamed | Initial complete specification under interim project name |
| v2.0 | May 2026 | Al Amin Ahamed | Rebranded to **Tundra**. Renamed all components, config paths, environment variables, system users, systemd units, and crate prefixes throughout. No architectural changes. |
| v3.0 | May 2026 | Al Amin Ahamed | Reframed as the architectural anchor. Compressed the schema/API/security/deployment/test sections into anchor sections that delegate to the eight new technical companions (`tundra-database-schema-v1.md`, `tundra-api-specification-v1.md`, `tundra-deployment-runbook-v1.md`, `tundra-deployment-overview-v1.md`, `tundra-security-audit-v1.md`, `tundra-security-overview-v1.md`, `tundra-test-plan-v1.md`, `tundra-acceptance-checklist-v1.md`). Added §1.5 ("What changed in v3"), §15 ("Documentation suite map" with reading-order recommendations for engineers, operators, security reviewers). Added §4.15 (Plugins) as a first-class functional module. Added Wasmtime to the core stack. Updated Vite to 8.x; added Formik/Yup for wizards. Refreshed roadmap to acknowledge Phase 0 (specification) is complete. Refreshed risks table to include Wasmtime CVE and spec-implementation drift. |

**Companion Documents (current suite):**

- `tundra-database-schema-v1.md`
- `tundra-api-specification-v1.md`
- `tundra-deployment-runbook-v1.md`
- `tundra-deployment-overview-v1.md`
- `tundra-security-audit-v1.md`
- `tundra-security-overview-v1.md`
- `tundra-test-plan-v1.md`
- `tundra-acceptance-checklist-v1.md`
- `tundra-plesk-migration-plan-v1.md`
- `tundra-plugin-architecture-plan-v1.md`
- `tundra-additional-core-plugins-v1.md`
- `tundra-frontend-ui-spec-v1.md`
- `tundra-brand-guidelines-v1.md` + `tundra-brand-assets-v1.zip`

**Planned Follow-up Documents:**

- `tundra-incident-response-playbook-v1.md` — step-by-step response procedures with comms templates
- `tundra-key-ceremony-v1.md` — formal procedure for master-key generation, rotation, and offline backup
- `tundra-load-test-runbook-v1.md` — full k6 script catalogue, environment topology, baselines
- `tundra-template-authoring-guide-v1.md` — how to build new one-click application templates
