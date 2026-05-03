# Tundra — Technical Implementation Plan

> **A self-hosted, Rust-based server management platform**  
> A modern alternative to Plesk and cPanel, built for full control, latest tooling, and native deployment of WordPress, Laravel, Node.js, Python, Go, and Rust applications.

---

**Author:** Al Amin Ahamed  
**GitHub:** [@mralaminahamed](https://github.com/mralaminahamed)  
**X:** [@mralaminahamed](https://x.com/mralaminahamed)

**Document Version:** v2.0  
**Document Date:** May 2026  
**Status:** Implementation-Ready Specification

---

## 1. Executive Summary

### 1.1 Project Background

Plesk and cPanel are the dominant commercial server-management solutions for VPS infrastructure, but both impose significant practical constraints:

- **High licensing cost** relative to the underlying VPS (often exceeding the cost of the server itself for small-scale deployments)
- **Restricted database engines and versions** — typically locked to vendor-approved MySQL/MariaDB releases, with limited PostgreSQL support
- **Slow upstream version tracking** — PHP, Node.js, Python, and database engines lag behind official releases by months
- **Closed-source service stack** — limited ability to swap out web servers, queue runners, or process managers
- **Constrained deployment models** — application deployment is essentially restricted to traditional CGI/PHP-FPM patterns; modern deployment patterns (zero-downtime, blue-green, container-based, edge-built) are absent
- **Email and DNS modules are bundled but inflexible** — adding modern providers (e.g., Mailgun relays, custom DNSSEC chains) is non-trivial

**Tundra** is a self-hosted server-management platform written in Rust that replaces Plesk and cPanel for personal and team infrastructure use. It is designed to run on Vultr, Hetzner, DigitalOcean, OVH, or any bare-metal/VPS host, and to manage a single server or a fleet of servers from a unified control plane.

### 1.2 The Name

The name **Tundra** was chosen deliberately. A tundra is a vast, ordered, low-noise environment where every component endures harsh conditions and operates with minimal supervision — qualities that map directly onto the engineering goals of the platform:

- **Vast** — built to manage one server or hundreds without architectural change
- **Ordered** — declarative state, idempotent reconciliation, no configuration drift
- **Resilient** — written in Rust for memory safety and operational robustness
- **Low-noise** — minimal background overhead (sub-100 MB RSS), no surprise reboots, no hidden licensing fees

The name is also a quiet acknowledgement of Rust's cultural association with cold, durable, systems-grade infrastructure.

### 1.3 Design Goals

1. **Latest stable tooling, always.** PHP 8.4, Node.js 24 LTS, Python 3.13, Go 1.24, Rust 1.95, PostgreSQL 18, MySQL 8.4, MariaDB 11.x — all installable and switchable per application.
2. **Native deployment, not just hosting.** Each application runs under its own systemd unit, dedicated Linux user, and isolated runtime — no shared PHP-FPM pools, no global Node version conflicts.
3. **Modern deployment ergonomics.** Git-based deploys, zero-downtime atomic releases, environment-variable management, build-step pipelines, deploy hooks — comparable to Laravel Cloud, Vercel, and Ploi.io.
4. **Dual-mode architecture.** Runs as a single-server agent (panel and worker on the same host) or as a control plane managing many remote agents — without a code rewrite.
5. **Memory-safe and performance-conscious.** Written in Rust, deployed as a single static binary per component, with sub-second response times even on 1 vCPU servers.
6. **Unrestricted resources.** Unlimited domains, subdomains, email accounts, databases, FTP users, SSL certificates, and applications — subject only to underlying server capacity.
7. **Complete service coverage.** Web (Nginx/Caddy), database (PostgreSQL/MySQL/MariaDB/Redis/Valkey), mail (Postfix/Dovecot/Rspamd), DNS (PowerDNS/CoreDNS), SSL (Let's Encrypt/ZeroSSL), firewall (nftables), backups (Restic/Borg).

### 1.4 Non-Goals (v1.0)

- **Not a multi-tenant SaaS.** Designed for personal and internal team use; no billing, customer accounts, or reseller hierarchies in v1.
- **Not a Kubernetes alternative.** Tundra manages traditional Linux servers; container orchestration is a feature of v1 (via Docker), not a core architectural model.
- **Not Windows-compatible.** Linux-only (Ubuntu 24.04 LTS and Debian 12+ are the supported targets for v1).

---

## 2. System Architecture Overview

### 2.1 Component Topology

Tundra consists of four primary components, each a separate Rust binary:

| Component | Binary Name | Role |
|-----------|-------------|------|
| Control Plane API | `tundrad` | The central HTTP/gRPC API, web UI backend, database authority. Single instance per cluster. |
| Node Agent | `tundra-agent` | Runs on every managed server. Executes provisioning, deployment, and monitoring tasks. |
| CLI | `tundra` | Operator-facing command-line tool. Interacts with the API. |
| Web UI | `tundra-ui` | Single-page React application served as static assets by `tundrad`. |

### 2.2 Deployment Modes

**Mode A — Single-Server (default)**

```
+------------------------------------------+
|              Single VPS Host             |
|                                          |
|  +------------+    +------------------+  |
|  |   tundrad   |<-->|   tundra-agent    |  |
|  | (panel API)|    | (local executor) |  |
|  +------------+    +------------------+  |
|        |                    |            |
|        v                    v            |
|  +-----------+    +------------------+   |
|  | PostgreSQL|    | Managed Services |   |
|  | (panel DB)|    | (Nginx, PHP-FPM, |   |
|  +-----------+    |  PostgreSQL, ...) |  |
|                   +------------------+   |
+------------------------------------------+
```

In single-server mode, `tundrad` and `tundra-agent` run on the same host and communicate over a Unix domain socket. The agent is started as a systemd-managed child of the panel.

**Mode B — Multi-Server (Control Plane + Nodes)**

```
+----------------------+         +----------------------+
|   Control Plane VPS  |         |   Managed Node #1    |
|                      |         |                      |
|  +----------------+  |  mTLS   |  +----------------+  |
|  |    tundrad      |<-+-gRPC----|->|  tundra-agent   |  |
|  +----------------+  |  :7443  |  +----------------+  |
|  +----------------+  |         |  +----------------+  |
|  |  PostgreSQL    |  |         |  | App + Services |  |
|  +----------------+  |         |  +----------------+  |
+----------------------+         +----------------------+
                                            ^
                                            |
                                 +----------------------+
                                 |   Managed Node #2    |
                                 |  +----------------+  |
                                 |  |  tundra-agent   |<-+
                                 |  +----------------+
                                 |  +----------------+  |
                                 |  | App + Services |  |
                                 |  +----------------+  |
                                 +----------------------+
```

The same binaries are used in both modes; mode is determined entirely by configuration. A single-server install can be promoted to a control plane later without data loss.

### 2.3 Communication Layers

| Edge | Protocol | Auth | Purpose |
|------|----------|------|---------|
| User browser ↔ `tundrad` | HTTPS (HTTP/2) | Session cookie + CSRF | Web UI |
| CLI ↔ `tundrad` | HTTPS (HTTP/2) | API token (Bearer) | Automation, scripting |
| External integrations ↔ `tundrad` | HTTPS REST + Webhooks | API token, HMAC-signed webhooks | Git push, CI/CD, monitoring |
| `tundrad` ↔ `tundra-agent` (single-host) | Unix domain socket + bincode | OS-level (root only) | Internal RPC |
| `tundrad` ↔ `tundra-agent` (multi-host) | gRPC over mTLS | X.509 client certificate | Remote provisioning, deploy, telemetry |
| `tundra-agent` ↔ system | systemd D-Bus, `nftables`, `iproute2`, file system | root privileges | Service management |

### 2.4 Data Storage

| Store | Technology | Purpose |
|-------|------------|---------|
| Primary database | PostgreSQL 18 | All panel state — users, servers, sites, applications, certificates, audit logs |
| Cache & rate limiting | Valkey 8 (Redis-compatible) | Session storage, deploy queue, real-time event pub/sub |
| Object storage (optional) | Local filesystem or S3-compatible (MinIO, R2, Spaces) | Backup destination, deployment artifacts |
| Time-series (optional) | VictoriaMetrics or Prometheus | Per-node and per-app metrics |

PostgreSQL 18 is mandatory; SQLite is intentionally not supported as a panel store because the multi-server use case requires concurrent write durability and replication.

---

## 3. Technology Stack

### 3.1 Core Stack

| Layer | Technology | Version (May 2026) | Justification |
|-------|------------|--------------------|----|
| Systems language | Rust | 1.95.0 (stable) | Memory safety, performance, single static binary |
| Async runtime | Tokio | 1.x | De facto standard, mature ecosystem |
| HTTP framework | Axum | 0.8.x | Tokio-native, type-safe routing, built on Tower middleware |
| gRPC | Tonic | 0.13.x | Idiomatic gRPC for inter-component RPC |
| Serialization | serde, bincode, prost | latest | JSON for HTTP, bincode for internal RPC, protobuf for gRPC |
| Database access | SQLx | 0.8.x | Compile-time checked queries against PostgreSQL |
| Migrations | sqlx-cli | 0.8.x | Versioned, reversible SQL migrations |
| Async tasks | Tokio + Apalis (or custom) | latest | Background jobs, deploy queue, scheduled tasks |
| Configuration | figment | latest | Layered config from TOML, env vars, secrets |
| Logging | tracing + tracing-subscriber | latest | Structured, contextual logs with OpenTelemetry export |
| TLS | rustls | latest | Memory-safe TLS without OpenSSL dependency |
| Process supervision | systemd (host) + Tokio (in-proc) | n/a | OS-native; no reinvented wheels |

### 3.2 Frontend Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | React | 19.x |
| Build tooling | Vite | 6.x |
| Language | TypeScript | 5.7+ (strict mode) |
| Routing | TanStack Router | 1.x |
| Data fetching | TanStack Query | 5.x |
| State (UI) | Zustand | 5.x |
| Styling | TailwindCSS | 4.x |
| Component library | shadcn/ui (Radix primitives) | latest |
| Icons | Lucide React | latest |
| Forms | React Hook Form + Zod | latest |
| Charts | Recharts | latest |
| Real-time | Native WebSocket (forwarded by `tundrad`) | n/a |

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
| SSL — ACME client | Internal Rust ACME client (instant-acme) | latest |
| Firewall | nftables | distribution version |
| Backup | Restic | 0.17+ |
| Container runtime (optional) | Docker Engine + Compose v2 | latest stable |
| Process manager (apps) | systemd (template units) | host version |

### 3.5 Operating System Support

| OS | Status | Notes |
|----|--------|-------|
| Ubuntu 24.04 LTS | Tier 1 (primary) | Reference platform, all features tested |
| Ubuntu 22.04 LTS | Tier 1 | Supported through 2027 |
| Debian 12 (Bookworm) | Tier 1 | Server-default friendly |
| Debian 13 (Trixie) | Tier 1 (after release) | |
| AlmaLinux 9 / Rocky 9 | Tier 2 | Supported but not reference |
| Other distros | Unsupported | Not in v1 scope |

---

## 4. Functional Module Breakdown

This section enumerates every user-facing module of Tundra and the subsystems it implies.

### 4.1 Server Management

**Purpose:** Provision and manage one or many physical or virtual Linux servers.

**Capabilities:**

- Add a new server by IP address and SSH credentials (one-time bootstrap)
- Automated installation of `tundra-agent`, base packages, security hardening
- Server health dashboard: CPU, memory, disk, network, load average, uptime
- Server-level package version management (PHP, Node.js, Python versions installed)
- Server-level firewall rules (nftables-based)
- SSH key management — operator keys synced to all managed servers
- Sudo policy management for application users
- Reboot, shutdown, power-cycle (where supported by the underlying provider API — Vultr, DigitalOcean, Hetzner)
- System update scheduling with maintenance windows
- Kernel upgrade detection and reboot-required notifications

**Key data entities:** `Server`, `ServerCredential`, `InstalledPackage`, `FirewallRule`, `MaintenanceWindow`

### 4.2 Domain & DNS Management

**Purpose:** Unlimited domain registration, DNS zone hosting, subdomain management.

**Capabilities:**

- Add unlimited primary domains and subdomains
- Authoritative DNS zone hosting via PowerDNS
- Full DNS record support: A, AAAA, CNAME, MX, TXT, SRV, CAA, NS, PTR, ALIAS (CNAME flattening)
- DNSSEC signing (NSEC3, automatic key rotation)
- Glue record management for delegated nameservers
- Per-zone editor with validation, syntax highlighting, dry-run preview
- Bulk import via BIND zone file or AXFR transfer
- Bulk export
- Automatic SOA serial increment on edit
- Optional integration with registrar APIs (Namecheap, Cloudflare, Porkbun) for nameserver updates and renewal alerts

**Key data entities:** `Domain`, `DnsZone`, `DnsRecord`, `DnssecKey`, `RegistrarAccount`

### 4.3 Site & Application Management

**Purpose:** Host and deploy web applications of any supported stack.

**Application types (v1.0):**

| Type | Runtime | Deployment Pattern |
|------|---------|--------------------|
| Static site | None | Upload / Git push / build artifact |
| PHP / WordPress | PHP-FPM | Document-root + PHP-FPM pool |
| Laravel | PHP-FPM + queue + scheduler | Atomic releases, supervised queue worker, cron |
| Symfony / generic PHP framework | PHP-FPM | Atomic releases |
| Node.js | systemd unit | Atomic releases, port-bound, reverse-proxied |
| Next.js (custom server) | systemd unit | Build step + `node server.js` |
| Python (Django, FastAPI, Flask) | systemd unit (gunicorn / uvicorn) | venv + atomic releases |
| Go | systemd unit | Build step → static binary → reverse-proxied |
| Rust | systemd unit | Build step → static binary → reverse-proxied |
| Ruby on Rails | systemd unit (Puma) | bundler + atomic releases |
| Docker / Compose | Docker | `docker compose up -d --build` orchestrated by agent |

**Capabilities:**

- One-click application creation from templates (covered in §4.10)
- Custom application creation with full control over build and run commands
- **Atomic deployments:** each deploy is a new directory under `releases/`, and `current` is a symlink swap. Rollback is `O(1)`.
- Git-based deploys: webhook triggers from GitHub, GitLab, Bitbucket, Gitea, or any Git provider; SSH-key-based deploy keys per repository
- Build pipeline: configurable `pre-build`, `build`, `post-build`, `pre-deploy`, `post-deploy` hooks
- Environment variable management (encrypted at rest with AES-256-GCM; per-environment scopes)
- Health check (HTTP probe + exit-code probe) post-deploy with automatic rollback on failure
- Zero-downtime reload for PHP-FPM and reverse-proxied services
- Per-app PHP-FPM pool with isolated user, file descriptor limits, memory limit, opcache settings
- Per-app systemd unit for non-PHP runtimes
- Log streaming (stdout/stderr) over WebSocket
- Resource quotas per application (CPU shares via cgroups v2, memory limits, disk quota)

**Key data entities:** `Site`, `Application`, `Deployment`, `Release`, `EnvironmentVariable`, `BuildHook`, `HealthCheck`

### 4.4 Database Management

**Purpose:** Provision, manage, and back up databases for hosted applications.

**Capabilities:**

- Create unlimited PostgreSQL, MySQL, MariaDB, and Valkey instances
- Multiple major-version coexistence (PostgreSQL 16/17/18 simultaneously, etc.) via apt repositories
- Per-database user creation with scoped privileges
- Connection string generation with auto-rotation of credentials
- Web-based query console (read-only by default; explicit toggle for write)
- pgvector / extension management for PostgreSQL
- Per-database performance tuning profiles (Small/Medium/Large/Custom) — auto-tuned `shared_buffers`, `work_mem`, `max_connections`
- Scheduled logical backups (`pg_dump`, `mysqldump`) and base backups (`pg_basebackup`)
- Point-in-time recovery via WAL archiving (PostgreSQL)
- Replication setup (primary/replica, logical replication)
- Database import from SQL dump or external host (with progress streaming)
- Read-only TLS connection endpoint exposed on a dedicated subdomain (optional)

**Key data entities:** `DatabaseServer`, `Database`, `DatabaseUser`, `BackupJob`, `BackupArtifact`

### 4.5 Email Hosting

**Purpose:** Full mail-server functionality with modern anti-spam and authentication.

**Capabilities:**

- Unlimited mailboxes per domain
- Unlimited aliases, forwards, and catch-alls
- IMAP, POP3, SMTP, Submission (587), SMTPS (465)
- Per-mailbox quota
- Webmail interface (Roundcube installed on demand, served on `webmail.<domain>`)
- Sieve filters with web UI
- DKIM signing per domain (auto-generated, auto-published in DNS if domain is on Tundra DNS)
- DMARC and SPF record helpers (one-click insertion of correct records)
- Greylisting, RBL checks, Bayesian filtering via Rspamd
- ARC sealing for forwarded mail
- TLS with automatic Let's Encrypt certificates for IMAP/SMTP hostnames
- Mail queue inspection and management
- Bounce log viewer
- Per-mailbox vacation auto-responder
- Optional smarthost configuration (route outbound through Mailgun/SES/Postmark for IP-reputation-sensitive sending)

**Key data entities:** `MailDomain`, `Mailbox`, `MailAlias`, `MailForward`, `SieveFilter`, `MailQueueEntry`

### 4.6 SSL Certificate Management

**Purpose:** Frictionless TLS for all hosted services.

**Capabilities:**

- Automatic Let's Encrypt issuance via internal ACME client (using `instant-acme` Rust crate)
- ZeroSSL as alternative ACME provider (account-key-pinned)
- Wildcard certificates via DNS-01 challenge (when domain DNS is managed by Tundra)
- HTTP-01 challenge for non-DNS-managed domains
- Automatic renewal at T-30 days; alerting at T-14 if renewal fails
- Manual certificate upload (BYO certificate + private key)
- Per-site HSTS toggle and HSTS preload registration helper
- OCSP stapling enabled by default
- Per-site cipher-suite profile (Modern / Intermediate / Custom — Mozilla SSL config presets)
- Certificate transparency log monitoring (alerts on unexpected issuance)

**Key data entities:** `Certificate`, `AcmeAccount`, `RenewalJob`

### 4.7 File Manager & FTP/SFTP

**Purpose:** File access for operators and clients without requiring shell login.

**Capabilities:**

- Web-based file manager: tree navigation, upload/download, edit (with syntax highlighting via Monaco), permissions
- Per-site SFTP user with chrooted home directory
- SSH-key-only authentication (passwords disabled by default; toggleable)
- Per-user upload quota
- Optional FTP/FTPS via vsftpd (off by default; opt-in for legacy compatibility)
- Audit log of all file-manager actions

**Key data entities:** `SftpUser`, `FileManagerSession`, `FileAuditEntry`

### 4.8 Cron / Scheduled Tasks

**Purpose:** Manage scheduled tasks per application without editing system crontabs.

**Capabilities:**

- Per-application scheduled task editor (cron syntax with human-readable preview and validation)
- Common presets (Every minute, Hourly, Daily at 3 AM, Weekly, Custom)
- Last-run timestamp, exit code, runtime, output captured to log
- One-click run-now and pause/resume
- Maximum-runtime guard (kill task if it exceeds N minutes)
- Lock guard to prevent overlapping runs
- Failure alerting (email/webhook on non-zero exit code)
- For Laravel applications, automatic registration of `php artisan schedule:run` every minute

**Key data entities:** `ScheduledTask`, `TaskRun`

### 4.9 Queue Workers / Daemons

**Purpose:** Manage long-running per-application processes (queue workers, websocket servers, message consumers).

**Capabilities:**

- Define daemon: command, working directory, environment, user, restart policy, max instances
- Translates to systemd template unit `tundra-daemon@<id>.service`
- Process inspection (PID, memory, CPU, restart count)
- Stdout/stderr log capture with rotation
- Log streaming over WebSocket
- Restart, stop, scale (number of replicas)
- Crash backoff with jitter
- Per-daemon resource limits (cgroups v2)

**Key data entities:** `Daemon`, `DaemonInstance`

### 4.10 One-Click Application Templates

**Purpose:** Bootstrap common applications with sensible defaults.

**Built-in templates (v1.0):**

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

Templates are versioned YAML manifests (see §6.6) — adding a new template does not require a panel rebuild.

### 4.11 Backups

**Purpose:** Comprehensive, automated, verifiable backups.

**Capabilities:**

- Per-application backup (files + database)
- Per-server backup (full system snapshot of `/var`, `/etc`, mail spools, databases)
- Restic-based deduplicated, encrypted, incremental backups
- Backup destinations: local disk, S3, Backblaze B2, Wasabi, MinIO, any S3-compatible target, SFTP, or rsync.net
- Schedule per backup job (hourly/daily/weekly/custom cron)
- Retention policy: keep N hourly + N daily + N weekly + N monthly + N yearly (Restic forget policy)
- Restore: one-click restore to original location, restore to alternative location, browse-and-extract individual files
- Backup verification job (random 5% of snapshots verified weekly)
- Off-site replication (mirror to second destination)
- Encrypted credentials at rest (panel database) and at transit (TLS to backup target)
- Backup health dashboard: last successful run, size, deduplication ratio

**Key data entities:** `BackupJob`, `BackupTarget`, `BackupRun`, `BackupArtifact`, `RestoreRun`

### 4.12 Monitoring & Alerting

**Purpose:** Visibility into server, service, and application health.

**Capabilities:**

- Per-server metrics: CPU, memory, swap, disk usage, disk I/O, network, load
- Per-service metrics: PHP-FPM pool status, Nginx requests, PostgreSQL connections, MySQL threads, Valkey memory
- Per-application metrics: process memory, CPU time, request count (via Nginx logs)
- Real-time charts (last 1h, 24h, 7d, 30d)
- Configurable alert rules: threshold, duration, severity
- Alert channels: Email, Slack, Discord, Telegram, Generic Webhook, PagerDuty
- Health-check probes (HTTP/TCP/Ping) from the control plane to all managed sites
- Synthetic uptime monitoring with public status page (optional, on subdomain)
- Log aggregation: per-application log streaming, full-text search over the last 7 days (configurable)
- Audit log: every panel action with actor, timestamp, IP, before/after diff

**Key data entities:** `MetricSeries`, `AlertRule`, `AlertNotification`, `HealthProbe`, `AuditLogEntry`

### 4.13 User & Access Management

**Purpose:** Role-based access for operators (panel-level), not end-user accounts.

**Capabilities:**

- Operator accounts with email + password (bcrypt + Argon2id rotation)
- Mandatory 2FA: TOTP, WebAuthn (FIDO2 hardware keys preferred)
- Recovery codes (one-time use, 10 generated)
- Roles: Owner (full), Admin (full except billing/operator management), Operator (manage assigned servers/sites), Read-only
- Per-resource ACL: assign specific servers, sites, or domains to a non-Owner operator
- API tokens with scopes (read, deploy, write, admin) and expiry
- IP allow-listing per operator (optional)
- Brute-force protection: rate limit, account lockout, exponential backoff
- SSO via OIDC (optional, v1.5 — not v1.0)
- Audit log of every login, action, and configuration change

**Key data entities:** `Operator`, `Role`, `ApiToken`, `Session`, `AuthEvent`

### 4.14 CLI & API

**Purpose:** Full-featured command-line and HTTP API for automation.

**Capabilities:**

- `tundra` CLI written in Rust, distributed as a single static binary (Linux x86_64, ARM64, macOS Universal, Windows x86_64)
- Authenticated via `tundra login` (OAuth-style device flow) or environment variable `TUNDRA_API_TOKEN`
- Full surface coverage: every UI action has a CLI equivalent
- JSON output mode for piping (`--output json`)
- Watch mode for streaming logs and deploy progress
- HTTP REST API documented via OpenAPI 3.1 specification
- gRPC API (future, v1.5) for high-throughput automation

---

## 5. Detailed Architecture — Internal Components

### 5.1 The `tundrad` Binary

Responsibilities:

1. **HTTP API server** — serves the OpenAPI-described REST endpoints, OAuth/session endpoints, WebSocket endpoints for real-time streams, and static assets for the React UI.
2. **gRPC server** (multi-server mode) — accepts mTLS connections from `tundra-agent` instances on remote nodes.
3. **Database authority** — owns the PostgreSQL panel database; all writes flow through it.
4. **Job dispatcher** — enqueues background jobs (deployments, backups, health checks) onto Valkey-backed queues.
5. **Event bus** — publishes events (deploy started, alert fired, certificate renewed) to a Valkey pub/sub channel for live UI updates.

Internal layout (Rust crate workspace):

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
│   ├── tundrad-config/          # Layered configuration loader
│   └── tundrad-telemetry/       # Tracing, metrics export
├── migrations/                 # SQLx migrations
├── proto/                      # Protobuf definitions for tundra-agent gRPC
└── ui/                         # tundra-ui React source (built into static assets)
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
- The agent supports **offline operation** for already-provisioned services. If the control plane is unreachable, applications continue to run; the agent will reconnect and reconcile when the control plane returns.

Internal layout:

```
tundra-agent/
├── crates/
│   ├── tundra-agent-bin/
│   ├── tundra-agent-rpc/         # gRPC server, accepts directives from tundrad
│   ├── tundra-agent-reconciler/  # Desired-state reconciliation engine
│   ├── tundra-agent-providers/
│   │   ├── pkg/                 # apt/dnf wrappers
│   │   ├── nginx/               # Nginx config rendering and reload
│   │   ├── caddy/
│   │   ├── php-fpm/             # Pool template rendering, reload
│   │   ├── postgres/            # Cluster init, role/db creation, backup
│   │   ├── mysql/
│   │   ├── valkey/
│   │   ├── postfix/
│   │   ├── dovecot/
│   │   ├── rspamd/
│   │   ├── powerdns/
│   │   ├── nftables/
│   │   ├── systemd/             # Unit file generation, dbus interaction
│   │   └── docker/              # Optional Docker provider
│   ├── tundra-agent-metrics/
│   └── tundra-agent-logs/
└── proto/
```

Each provider is a trait implementation:

```rust
#[async_trait]
pub trait Provider: Send + Sync {
    type Spec: Serialize + DeserializeOwned;
    type State: Serialize + DeserializeOwned;

    async fn observe(&self) -> Result<Self::State>;
    async fn reconcile(&self, desired: &Self::Spec) -> Result<ReconcileOutcome>;
    async fn destroy(&self, spec: &Self::Spec) -> Result<()>;
}
```

This makes adding a new managed service (say, RabbitMQ or Mosquitto) a self-contained PR against the `tundra-agent-providers` crate.

### 5.3 The `tundra` CLI

Distributed as a single static binary built with `--target x86_64-unknown-linux-musl` (and equivalent for ARM64 / macOS / Windows). Wraps the same OpenAPI client used by the web UI, generated from the spec at build time.

```
tundra
├── login                    # Device-flow authentication
├── server
│   ├── add | list | inspect | remove
│   └── ssh                  # ssh into a managed server
├── site
│   ├── create | list | inspect | remove
│   └── deploy
├── domain ...
├── db ...
├── mail ...
├── cert ...
├── backup
│   ├── run | restore | list
└── logs <site>              # tail logs
```

### 5.4 The `tundra-ui` React Application

- Single-page application served as static assets by `tundrad` from `/_app`.
- All API calls go through `/api/v1/...` on the same origin (no CORS).
- Tokens stored in `HttpOnly`, `Secure`, `SameSite=Strict` cookies.
- WebSocket endpoint at `/api/v1/events` for live updates, log streaming, deploy progress.
- Strict CSP: `default-src 'self'; script-src 'self'; ...`. No inline scripts except a Vite-injected nonce.
- Dark mode and light mode (defaults to system preference).

---

## 6. Database Schema (PostgreSQL 18)

This section presents the canonical schema. All tables include `id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`. UUIDs use `uuidv7()` for time-ordered keys (PostgreSQL 18 native function).

### 6.1 Identity & Access

```sql
CREATE TABLE operators (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id       UUID NOT NULL DEFAULT uuidv7() UNIQUE,
    email           CITEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,                  -- argon2id
    full_name       TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('owner','admin','operator','readonly')),
    totp_secret     BYTEA,                          -- encrypted with master key
    webauthn_creds  JSONB NOT NULL DEFAULT '[]',
    recovery_codes  BYTEA,                          -- encrypted JSON array
    last_login_at   TIMESTAMPTZ,
    last_login_ip   INET,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operator_id     BIGINT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    token_hash      BYTEA NOT NULL UNIQUE,
    ip              INET NOT NULL,
    user_agent      TEXT,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE api_tokens (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operator_id     BIGINT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    token_hash      BYTEA NOT NULL UNIQUE,
    scopes          TEXT[] NOT NULL,
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE resource_acl (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operator_id     BIGINT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    resource_type   TEXT NOT NULL,                  -- 'server','site','domain'
    resource_id     BIGINT NOT NULL,
    permission      TEXT NOT NULL CHECK (permission IN ('read','write','admin')),
    UNIQUE (operator_id, resource_type, resource_id)
);

CREATE TABLE auth_events (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operator_id     BIGINT REFERENCES operators(id) ON DELETE SET NULL,
    event_type      TEXT NOT NULL,                  -- 'login_success','login_failure','2fa_failure',...
    ip              INET NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6.2 Servers

```sql
CREATE TABLE servers (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id           UUID NOT NULL DEFAULT uuidv7() UNIQUE,
    name                TEXT NOT NULL,
    hostname            TEXT NOT NULL,
    ipv4                INET NOT NULL,
    ipv6                INET,
    provider            TEXT,                       -- 'vultr','digitalocean','hetzner','custom'
    provider_id         TEXT,                       -- provider-side server id
    region              TEXT,
    os                  TEXT NOT NULL,              -- 'ubuntu-24.04'
    status              TEXT NOT NULL DEFAULT 'provisioning',
                                                    -- 'provisioning','active','degraded','offline','disabled'
    agent_version       TEXT,
    agent_pubkey        BYTEA,                      -- for mTLS
    agent_last_seen_at  TIMESTAMPTZ,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_servers_status ON servers(status);

CREATE TABLE server_packages (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    server_id       BIGINT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,                  -- 'php','nodejs','python','postgresql'
    version         TEXT NOT NULL,                  -- '8.4','24.x','3.13','18'
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    installed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (server_id, name, version)
);

CREATE TABLE server_firewall_rules (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    server_id       BIGINT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    direction       TEXT NOT NULL CHECK (direction IN ('in','out')),
    protocol        TEXT NOT NULL CHECK (protocol IN ('tcp','udp','icmp','any')),
    port_range      INT4RANGE,
    source_cidr     CIDR,
    action          TEXT NOT NULL CHECK (action IN ('accept','drop','reject')),
    priority        INT NOT NULL DEFAULT 100,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6.3 Domains & DNS

```sql
CREATE TABLE domains (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id       UUID NOT NULL DEFAULT uuidv7() UNIQUE,
    name            TEXT NOT NULL UNIQUE,           -- 'example.com'
    is_dns_managed  BOOLEAN NOT NULL DEFAULT FALSE, -- true if PowerDNS hosts the zone
    registrar       TEXT,
    expires_at      TIMESTAMPTZ,
    auto_renew      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dns_zones (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    domain_id       BIGINT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    serial          BIGINT NOT NULL DEFAULT 1,
    refresh         INT NOT NULL DEFAULT 10800,
    retry           INT NOT NULL DEFAULT 3600,
    expire          INT NOT NULL DEFAULT 604800,
    minimum         INT NOT NULL DEFAULT 3600,
    dnssec_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (domain_id)
);

CREATE TABLE dns_records (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    zone_id         BIGINT NOT NULL REFERENCES dns_zones(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL,                  -- 'A','AAAA','CNAME','MX','TXT','SRV','CAA','NS','PTR','ALIAS'
    content         TEXT NOT NULL,
    ttl             INT NOT NULL DEFAULT 3600,
    priority        INT,                            -- for MX, SRV
    is_managed      BOOLEAN NOT NULL DEFAULT FALSE, -- true if generated by Tundra (e.g., DKIM)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dns_records_zone ON dns_records(zone_id);
```

### 6.4 Sites & Applications

```sql
CREATE TABLE sites (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id           UUID NOT NULL DEFAULT uuidv7() UNIQUE,
    server_id           BIGINT NOT NULL REFERENCES servers(id) ON DELETE RESTRICT,
    domain              TEXT NOT NULL UNIQUE,        -- canonical hostname
    aliases             TEXT[] NOT NULL DEFAULT '{}',
    application_type    TEXT NOT NULL,               -- 'static','php','laravel','nodejs','python','go','rust','docker','custom'
    runtime_version     TEXT,                        -- '8.4','24','3.13','1.24','1.95'
    document_root       TEXT NOT NULL,
    base_path           TEXT NOT NULL,               -- '/srv/sites/<public_id>'
    web_user            TEXT NOT NULL,               -- system user that owns files & runs FPM/daemon
    redirect_to_https   BOOLEAN NOT NULL DEFAULT TRUE,
    hsts_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
    status              TEXT NOT NULL DEFAULT 'provisioning',
                                                    -- 'provisioning','active','suspended','failed'
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE applications (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    site_id             BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    repository_url      TEXT,
    repository_branch   TEXT NOT NULL DEFAULT 'main',
    deploy_key_id       BIGINT,                     -- references deploy_keys
    build_command       TEXT,
    install_command     TEXT,
    start_command       TEXT,                       -- for non-PHP runtimes
    listen_port         INT,                        -- bound port for reverse proxy
    health_check_path   TEXT NOT NULL DEFAULT '/',
    health_check_status INT NOT NULL DEFAULT 200,
    UNIQUE (site_id)
);

CREATE TABLE environment_variables (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id  BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    key             TEXT NOT NULL,
    value_encrypted BYTEA NOT NULL,                 -- AES-256-GCM
    is_secret       BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (application_id, key)
);

CREATE TABLE deployments (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id       UUID NOT NULL DEFAULT uuidv7() UNIQUE,
    application_id  BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    commit_sha      TEXT,
    commit_message  TEXT,
    triggered_by    TEXT NOT NULL,                  -- 'manual','webhook','schedule'
    triggered_by_id BIGINT,                         -- operator id, if manual
    status          TEXT NOT NULL DEFAULT 'queued',
                                                    -- 'queued','running','succeeded','failed','rolled_back'
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    log             TEXT,                           -- captured stdout/stderr
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deployments_app_status ON deployments(application_id, status);

CREATE TABLE releases (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id  BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    deployment_id   BIGINT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    release_path    TEXT NOT NULL,                  -- '<base_path>/releases/<timestamp>'
    is_current      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_releases_current ON releases(application_id) WHERE is_current = TRUE;
```

### 6.5 Databases, Mail, Certs, Backups

```sql
CREATE TABLE database_servers (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    server_id       BIGINT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    engine          TEXT NOT NULL,                  -- 'postgres','mysql','mariadb','valkey'
    version         TEXT NOT NULL,                  -- '18','8.4','11.4','8'
    port            INT NOT NULL,
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (server_id, engine, version)
);

CREATE TABLE databases (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    database_server_id  BIGINT NOT NULL REFERENCES database_servers(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    charset             TEXT,
    collation           TEXT,
    UNIQUE (database_server_id, name)
);

CREATE TABLE database_users (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    database_server_id  BIGINT NOT NULL REFERENCES database_servers(id) ON DELETE CASCADE,
    username            TEXT NOT NULL,
    password_encrypted  BYTEA NOT NULL,
    UNIQUE (database_server_id, username)
);

CREATE TABLE database_grants (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    database_id     BIGINT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
    user_id         BIGINT NOT NULL REFERENCES database_users(id) ON DELETE CASCADE,
    privileges      TEXT[] NOT NULL,                -- ['ALL'] or ['SELECT','INSERT',...]
    UNIQUE (database_id, user_id)
);

CREATE TABLE mail_domains (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    domain_id       BIGINT NOT NULL REFERENCES domains(id) ON DELETE CASCADE UNIQUE,
    server_id       BIGINT NOT NULL REFERENCES servers(id) ON DELETE RESTRICT,
    dkim_selector   TEXT NOT NULL DEFAULT 'tundra',
    dkim_pubkey     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE mailboxes (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mail_domain_id  BIGINT NOT NULL REFERENCES mail_domains(id) ON DELETE CASCADE,
    local_part      TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    quota_bytes     BIGINT NOT NULL DEFAULT 1073741824, -- 1 GB
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (mail_domain_id, local_part)
);

CREATE TABLE mail_aliases (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mail_domain_id  BIGINT NOT NULL REFERENCES mail_domains(id) ON DELETE CASCADE,
    source          TEXT NOT NULL,                  -- 'sales' or '*'
    destination     TEXT[] NOT NULL,
    UNIQUE (mail_domain_id, source)
);

CREATE TABLE certificates (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    site_id         BIGINT REFERENCES sites(id) ON DELETE CASCADE,
    common_name     TEXT NOT NULL,
    san             TEXT[] NOT NULL DEFAULT '{}',
    issuer          TEXT NOT NULL,                  -- 'letsencrypt','zerossl','manual'
    cert_pem        TEXT NOT NULL,
    chain_pem       TEXT NOT NULL,
    key_pem_encrypted BYTEA NOT NULL,
    issued_at       TIMESTAMPTZ NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    auto_renew      BOOLEAN NOT NULL DEFAULT TRUE,
    last_renewed_at TIMESTAMPTZ
);

CREATE INDEX idx_certificates_expiring ON certificates(expires_at) WHERE auto_renew = TRUE;

CREATE TABLE backup_targets (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL,                  -- 's3','b2','sftp','local'
    config_encrypted BYTEA NOT NULL,                -- credentials JSON, encrypted
    repo_password_encrypted BYTEA NOT NULL          -- restic repo password
);

CREATE TABLE backup_jobs (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            TEXT NOT NULL,
    target_id       BIGINT NOT NULL REFERENCES backup_targets(id) ON DELETE RESTRICT,
    scope_type      TEXT NOT NULL,                  -- 'site','database','server','custom'
    scope_id        BIGINT,
    cron            TEXT NOT NULL,
    retention       JSONB NOT NULL,                 -- restic forget policy
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at     TIMESTAMPTZ,
    last_status     TEXT
);

CREATE TABLE backup_runs (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id          BIGINT NOT NULL REFERENCES backup_jobs(id) ON DELETE CASCADE,
    status          TEXT NOT NULL,
    snapshot_id     TEXT,
    bytes_added     BIGINT,
    bytes_total     BIGINT,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    error           TEXT
);
```

### 6.6 Templates & Misc

```sql
CREATE TABLE app_templates (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug            TEXT NOT NULL UNIQUE,           -- 'wordpress','laravel'
    name            TEXT NOT NULL,
    version         TEXT NOT NULL,
    manifest        JSONB NOT NULL,                 -- declarative spec
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE scheduled_tasks (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    site_id         BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    command         TEXT NOT NULL,
    cron            TEXT NOT NULL,
    timeout_seconds INT NOT NULL DEFAULT 300,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at     TIMESTAMPTZ,
    last_exit_code  INT
);

CREATE TABLE daemons (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    site_id         BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    command         TEXT NOT NULL,
    instances       INT NOT NULL DEFAULT 1,
    restart_policy  TEXT NOT NULL DEFAULT 'always',
    memory_limit_mb INT
);

CREATE TABLE audit_log (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operator_id     BIGINT REFERENCES operators(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,
    resource_type   TEXT NOT NULL,
    resource_id     BIGINT,
    ip              INET,
    diff            JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id, created_at DESC);
```

---

## 7. Security Architecture

Security is a primary design consideration; this section enumerates the controls.

### 7.1 Authentication

- **Operator passwords:** Argon2id with parameters tuned for ~250 ms hash time on the host.
- **2FA mandatory** for all operator accounts. TOTP (RFC 6238) and WebAuthn (level 2) both supported; a hardware key is strongly recommended for the Owner account.
- **Session tokens** are 32 random bytes, stored as SHA-256 hash; cookies are `HttpOnly`, `Secure`, `SameSite=Strict`. Sessions expire after 12 hours of inactivity (configurable).
- **API tokens** are scoped (read / deploy / write / admin), optionally time-limited, and revocable. Stored as SHA-256 hashes only.
- **Brute-force protection:** failed-login rate limiter via Valkey; account lockout after 10 failures in 15 minutes; CAPTCHA challenge above threshold.

### 7.2 Authorization

- Role-based: Owner > Admin > Operator > Read-only.
- Per-resource ACL: an Operator can be granted read/write/admin access to specific servers, sites, or domains. Permissions are evaluated at the API boundary in middleware before the request reaches the handler.
- All ACL decisions are recorded in the audit log.

### 7.3 Transport Security

- Panel HTTPS uses TLS 1.3 only (TLS 1.2 disabled). Strong cipher suites (Mozilla Modern profile).
- HSTS with preload-eligible parameters once the operator confirms.
- Inter-component gRPC uses **mutual TLS**: the control plane CA signs both `tundrad` server certs and `tundra-agent` client certs. Certificate rotation is automated; agents refresh certs at T-30 days.

### 7.4 At-Rest Encryption

- **Master key:** 32-byte key stored in `/etc/tundra/master.key` (mode `0400`, owned by `tundra`). Optionally backed by a hardware-bound key (TPM 2.0 sealing on supported hardware). Loss of master key = loss of all encrypted secrets; backup procedure documented.
- **Encrypted columns:** all `*_encrypted` columns use **AES-256-GCM** with a per-row 12-byte nonce stored alongside the ciphertext, authenticated with the row's `id`.
- **Database backups** include encrypted columns; the master key is **not** in the database backup. Restoration requires both the database backup and the master key backup.

### 7.5 Secrets in Application Environment

- Application environment variables are stored encrypted; rendered to a `0600` `.env` file owned by the application's system user only at deploy time.
- Environment variables are never logged.
- Deploy logs are scrubbed for any value matching a known secret.

### 7.6 Network Hardening

- **Default firewall posture:** `INPUT DROP`. Only the following ports are opened by default:
  - `22` (SSH) — restricted to operator-allowlisted IPs if configured
  - `80`, `443` (HTTP/HTTPS)
  - `25`, `587`, `465`, `143`, `993`, `110`, `995` — only on servers with mail role
  - `53` (DNS) — only on servers with DNS role
  - `7443` — only on the control plane node, restricted to managed-node IPs (multi-server mode)
- All other ports closed.
- **fail2ban-equivalent** built into `tundra-agent`: monitors SSH, mail auth, panel auth, FTP — bans abusive IPs at the nftables level.
- **Outbound egress** is unrestricted by default; operator can configure egress allow-list per server.

### 7.7 Application Isolation

- Each site runs as its own dedicated Linux user (`tundra-<public_id>`), home directory `/srv/sites/<public_id>`, no shell.
- Each PHP-FPM pool is scoped to that user — no shared pool across sites.
- Each non-PHP application runs as its own systemd service with `User=`, `Group=`, `ProtectSystem=strict`, `ProtectHome=true`, `PrivateTmp=true`, `NoNewPrivileges=true`, capability bounding set restricted to none unless explicitly granted, `MemoryMax=`, `CPUQuota=`.
- File permissions: `750` directories, `640` files, group-readable by `nginx`/`www-data` for static asset access only.
- No application user can read another application user's files.

### 7.8 Supply Chain

- Rust crates pinned in `Cargo.lock`; `cargo audit` runs in CI.
- Frontend dependencies pinned in `pnpm-lock.yaml`; `pnpm audit` and `osv-scanner` in CI.
- Release binaries signed with a GPG key; checksums (SHA-256, BLAKE3) published.
- SBOM generated per release (CycloneDX format).

### 7.9 Audit Log

Every state-changing API request produces an entry in `audit_log`: actor, action, resource, source IP, before/after diff. The audit log is append-only; deletion requires a database superuser and is itself logged at the OS level.

---

## 8. Deployment & Application Lifecycle

This section walks through what happens when an operator creates and deploys a Laravel application — illustrative of the full pipeline.

### 8.1 Site Creation

```
1. Operator: POST /api/v1/sites
   { server_id, domain, application_type: "laravel", runtime_version: "8.4" }

2. tundrad validates inputs, persists Site row (status=provisioning), enqueues
   ProvisionSiteJob.

3. Worker picks up job, sends gRPC ProvisionSite directive to tundra-agent
   on target server.

4. tundra-agent reconciles desired state:
     - Create system user 'tundra-<public_id>' with home /srv/sites/<public_id>
     - Create directory layout: releases/, shared/, current symlink (empty initially)
     - Render PHP-FPM pool config /etc/php/8.4/fpm/pool.d/<public_id>.conf
     - php-fpm reload (graceful)
     - Render Nginx server block /etc/nginx/sites-available/<public_id>.conf
     - nginx -t && nginx -s reload
     - Request Let's Encrypt certificate via HTTP-01 challenge
     - Re-render Nginx with TLS, reload
     - Open firewall ports 80/443 (idempotent)

5. Agent reports success; tundrad sets Site.status=active, publishes event,
   UI updates in real time.
```

### 8.2 First Deployment

```
1. Operator connects GitHub repo, generates deploy key, configures
   webhook https://panel.example.com/webhooks/git/<token>.

2. GitHub push event arrives:
     - HMAC validated against per-site secret
     - DeploymentJob enqueued

3. Worker (on the target server's agent) executes the deploy:
   a. Acquire deploy lock for application (Valkey lock, TTL 30 min)
   b. Determine release path: /srv/sites/<id>/releases/<UTC-timestamp>
   c. git clone --depth 1 --branch <branch> <repo> <release path>
   d. Symlink shared resources:
        ln -sfn ../shared/.env <release>/.env
        ln -sfn ../shared/storage <release>/storage
        ln -sfn ../shared/bootstrap_cache <release>/bootstrap/cache
   e. Run install command:
        composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader
   f. Run build commands (Laravel-specific):
        php artisan config:cache
        php artisan route:cache
        php artisan view:cache
        php artisan event:cache
        npm ci && npm run build   (if package.json present)
   g. Run migrations (configurable, default = on first deploy or --migrate flag):
        php artisan migrate --force
   h. Atomic switch: ln -sfn <release> /srv/sites/<id>/current.tmp && mv -Tf <id>/current.tmp <id>/current
   i. Reload PHP-FPM: systemctl reload-or-restart php8.4-fpm
   j. Run health check: GET https://example.com/up — expect 200 within 30s
   k. On failure: revert symlink to previous release, reload, mark deploy failed
   l. On success: prune releases beyond keep_count (default 5)
   m. Restart queue workers: systemctl restart tundra-daemon@<id>-queue.service
   n. Run post-deploy hooks (if any)

4. Worker reports status; tundrad updates Deployment + Release rows;
   UI displays deploy log streamed via WebSocket from agent.
```

### 8.3 Rollback

```
1. Operator clicks "Rollback to <release>".
2. Agent flips current symlink to chosen release directory, reloads PHP-FPM,
   restarts daemons. Total time: <2 seconds.
```

### 8.4 Zero-Downtime Guarantees

- For PHP-FPM applications: graceful reload (`USR2` signal) keeps existing requests draining on the old pool; new requests hit new pool with new code.
- For systemd-managed reverse-proxied applications (Node, Python, Go, Rust):
  - Two systemd unit instances `tundra-app@<id>-blue` and `tundra-app@<id>-green`
  - Nginx upstream switched between them
  - Deploy: spin up green with new release, health-check green, switch upstream, drain blue
- Database migrations are operator's responsibility to write backward-compatible. The panel surfaces a warning before deploys that include destructive migrations.

---

## 9. Backup & Disaster Recovery

### 9.1 Application Backup

A site backup includes:

1. **Files** — `/srv/sites/<id>/shared/` (uploads, runtime data) and the current release directory (excluding `.git`, `vendor`, `node_modules` by default; configurable).
2. **Database** — logical dump of the application's database (SQL or custom format).
3. **Environment** — encrypted `.env` snapshot.

All three are written to a single Restic snapshot tagged `site=<id>`, `domain=<name>`, `time=<UTC>`.

### 9.2 Server Backup

A full-server backup includes `/etc`, `/var/lib/postgresql`, `/var/lib/mysql`, `/var/spool/postfix`, `/var/vmail`, `/srv/sites`, panel database, and operator-defined custom paths.

### 9.3 Panel Backup

The control plane itself is backed up: PostgreSQL panel database + `/etc/tundra/master.key` + `/etc/tundra/config.toml`. **The master key is the single most important asset.** Operators are required to download and store the master key off-server during initial setup; the panel refuses to mark itself as initialized otherwise.

### 9.4 Restore Workflow

Restore procedures are documented as runbooks (separate document). Restore-to-original and restore-to-alternate-server are both first-class operations.

### 9.5 Disaster Recovery Tiers

| Tier | Scope | RTO | RPO |
|------|-------|-----|-----|
| Tier 1 | Single site failure | 5 min | 1 hour |
| Tier 2 | Single server failure | 30 min | 1 hour |
| Tier 3 | Control plane failure | 2 hours | 24 hours |
| Tier 4 | Region failure | 4 hours | 24 hours |

Tier 3 and 4 require off-site backup destinations to be configured; Tier 4 additionally requires a warm standby in a different region.

---

## 10. Performance Targets

| Metric | Target |
|--------|--------|
| Panel dashboard initial load | < 1.0 s on 1 vCPU / 1 GB server |
| Panel API p99 latency (read) | < 80 ms |
| Panel API p99 latency (write, single-host) | < 200 ms |
| `tundrad` memory footprint at idle | < 80 MB RSS |
| `tundra-agent` memory footprint at idle | < 30 MB RSS |
| Site creation (single-host) | < 30 s wall-clock |
| Atomic deploy (Laravel, ~50 MB repo) | < 90 s wall-clock excluding `composer install` |
| Atomic symlink swap | < 50 ms |
| Concurrent deployments per node | 4 (configurable) |
| Managed nodes per control plane | 200 (target for v1.0) |

---

## 11. Implementation Roadmap

### 11.1 Phase Breakdown

| Phase | Duration | Scope |
|-------|----------|-------|
| **Phase 0 — Foundation** | 4 weeks | Workspace setup, CI, panel DB schema, auth, RBAC, audit log, base Axum API skeleton, base React UI |
| **Phase 1 — Single-host MVP** | 8 weeks | `tundra-agent` base, server provisioning, site creation (PHP/Laravel), Nginx + PHP-FPM rendering, Let's Encrypt issuance, deploy from Git, environment vars |
| **Phase 2 — Databases & Backups** | 4 weeks | PostgreSQL/MySQL/MariaDB/Valkey provisioning, database & user management, query console, Restic-based backups, restore |
| **Phase 3 — Email & DNS** | 6 weeks | Postfix/Dovecot/Rspamd provisioning, mailbox management, webmail install, PowerDNS integration, zone editor, DNSSEC |
| **Phase 4 — Multi-runtime** | 5 weeks | Node.js, Python, Go, Rust, Ruby application types; systemd template units; reverse proxy; blue/green for non-PHP |
| **Phase 5 — Multi-server** | 6 weeks | mTLS gRPC channel, control-plane mode, agent provisioning over SSH, server health, cross-server deploys |
| **Phase 6 — Templates & Polish** | 4 weeks | One-click templates (WordPress, Laravel, Next.js, Django, …), Docker provider, scheduled tasks, daemons, monitoring + alerting |
| **Phase 7 — Hardening & Beta** | 4 weeks | Security audit, fuzz testing, load testing, documentation, installer polish, beta release |
| **Phase 8 — General Availability** | 3 weeks | Bug fixes from beta, v1.0 release, post-launch support |

**Total: ~44 weeks (~10 months) of single-developer effort.** With one assisting developer, ~6 months.

### 11.2 Milestones

| Milestone | Target Week | Definition of Done |
|-----------|-------------|---------------------|
| M0 — Hello-Tundra | Week 4 | Operator can log in, see dashboard, manually add a server placeholder |
| M1 — First Site Live | Week 12 | A real Laravel site deployed via Git push, with TLS, on a fresh Vultr VPS, in under 5 minutes from `tundra server add` to publicly accessible HTTPS site |
| M2 — Database Self-Sufficiency | Week 16 | Create PG18 + MySQL 8.4, run a Laravel migration through the panel, take and restore a backup |
| M3 — Mail & DNS Live | Week 22 | Send and receive email on a Tundra-hosted domain with passing SPF, DKIM, DMARC; full DNS zone editing via UI |
| M4 — All Runtimes Online | Week 27 | Node.js, Python, Go, Rust apps each deployable via the panel |
| M5 — Multi-Server | Week 33 | A control plane managing 3 nodes; deploy targeting a specific node works |
| M6 — Templates Complete | Week 37 | One-click WordPress, Laravel, Next.js, Django, Rails — all working end-to-end |
| M7 — Beta | Week 41 | Self-installable from a single command on a fresh Ubuntu 24.04 server; documentation complete |
| M8 — v1.0 GA | Week 44 | Public release |

### 11.3 Suggested Repository Layout

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
│   ├── tundrad-config/
│   ├── tundrad-telemetry/
│   ├── tundra-agent-bin/
│   ├── tundra-agent-rpc/
│   ├── tundra-agent-reconciler/
│   ├── tundra-agent-providers/
│   ├── tundra-agent-metrics/
│   ├── tundra-agent-logs/
│   ├── tundra-cli/
│   └── tundra-shared/              # types shared across components
├── proto/
│   └── tundra/v1/agent.proto
├── migrations/
├── ui/                            # React app (separate package.json)
├── installer/
│   └── install.sh                 # one-line installer
├── docs/
│   ├── architecture/
│   ├── runbooks/
│   └── api/
└── .github/
    └── workflows/
        ├── ci.yml
        ├── release.yml
        └── audit.yml
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

### 12.2 Development Cost (Solo Developer Estimate)

Not applicable — this is a personal/internal tool. Time is the only cost.

---

## 13. Open Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Mail deliverability — IP reputation on cheap VPS | High | High | Smarthost integration (Mailgun/SES/Postmark) is a first-class feature; documented as recommended for production |
| ACME rate limits when bulk-creating sites | Medium | Medium | Use Let's Encrypt staging in tests; ZeroSSL fallback; certificate caching |
| Major version upgrade pain (PHP 8.4 → 8.5) | Medium | Medium | Multi-version coexistence by design; per-app version selection; documented upgrade paths |
| Compromise of master key | Low | Critical | TPM sealing where available; offline backup mandatory; audit and alerting on key file access |
| `tundra-agent` crash leaving services running | Low | Low | systemd manages services directly; agent crash does not stop sites; agent restarts on its own systemd unit |
| Drift between agent and control plane in network partition | Medium | Low | Reconciliation is idempotent; agent retries with exponential backoff; full reconcile on reconnect |
| Long-running deploys blocking the queue | Medium | Low | Per-application deploy lock; concurrent deploys across applications; configurable timeout |
| Database backup window during peak traffic | Low | Medium | Logical backups use replicas where configured; off-peak scheduling; throughput throttling for `pg_dump` |
| Single-developer maintenance burden | High | Medium | Heavy use of stable, well-supported upstream tools; small dependency surface; comprehensive test suite |

---

## 14. Comparison Matrix

| Capability | Tundra v1.0 | Plesk Obsidian | cPanel | Cloudron | CyberPanel | Ploi.io |
|------------|------------------|----------------|--------|----------|------------|---------|
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
| Single static binary install | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Memory safety (Rust) | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

Tundra's distinguishing positions are: **memory safety, native multi-runtime support, modern deployment ergonomics, and the latest upstream tooling with no licensing layer.**

---

## 15. Appendix A — Sample Nginx Server Block (Generated)

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

## 16. Appendix B — Sample systemd Unit (Generated, Node.js Application)

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

---

## 17. Appendix C — Installer Sketch

A single-command bootstrap on a fresh Ubuntu 24.04 server:

```
curl -fsSL https://tundra.<domain>/install.sh | sudo bash
```

The installer:

1. Checks OS version and required packages (`curl`, `gpg`, `systemd`).
2. Downloads the latest signed `tundrad` and `tundra-agent` binaries; verifies SHA-256 + GPG signature.
3. Creates `tundra` system user with no shell.
4. Installs binaries to `/usr/local/bin/`.
5. Generates master key, prompts operator to download and store off-server.
6. Provisions a local PostgreSQL 18 cluster for panel data; runs migrations.
7. Provisions a local Valkey instance.
8. Generates an internal CA (`/etc/tundra/ca/`) used for agent mTLS.
9. Generates an initial Let's Encrypt certificate for the panel hostname (operator supplies hostname).
10. Writes systemd units `tundrad.service` and `tundra-agent.service`; enables and starts.
11. Prints the initial Owner setup URL with one-time bootstrap token.

Total bootstrap time on a fresh 1 vCPU / 2 GB Vultr instance: target < 5 minutes.

---

## 18. Appendix D — Glossary

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
| Master Key | The 32-byte AES key used to encrypt secrets at rest. |

---

## 19. Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.0 | May 2026 | Al Amin Ahamed | Initial complete specification under interim project name |
| v2.0 | May 2026 | Al Amin Ahamed | Rebranded to **Tundra**. Renamed all components: `forged` → `tundrad`, `forge-agent` → `tundra-agent`, `forge` CLI → `tundra` CLI, `forge-ui` → `tundra-ui`. Updated config paths (`/etc/tundra/`), environment variables (`TUNDRA_API_TOKEN`), system users (`tundra-<public_id>`), systemd units (`tundra-app@`, `tundra-daemon@`), and crate prefixes throughout. No architectural changes. |

**Next Documents (Planned):**

- `02-installation-runbook.md` — Step-by-step operator install guide
- `03-api-reference.md` — Full OpenAPI 3.1 documentation
- `04-agent-protocol.md` — gRPC `.proto` definitions and reconciliation contracts
- `05-security-hardening-guide.md` — Production hardening checklist
- `06-template-authoring-guide.md` — How to build new one-click application templates
- `07-disaster-recovery-runbooks.md` — Restore procedures for each tier
