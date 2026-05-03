# Changelog

All notable changes to Tundra will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.4.0] - 2026-05-03 — Email & DNS (P4)

### Added

#### DNS providers (`tundra-agent-providers`)
- `PowerDnsProvider` — zone CRUD via PowerDNS HTTP API, DNSSEC NSEC3 enable, SOA serial bump, record upsert/delete; 2 tests
- `UnboundProvider` — recursor with forward zones and access control (opt-in); 1 test

#### Mail providers (`tundra-agent-providers`)
- `PostfixProvider` — PostgreSQL-backed virtual mailbox/alias maps (`pgsql:` map type), postsuper hold/release/delete stubs; 1 test
- `DovecotProvider` — auth-sql Postgres, Maildir storage, quota plugin; 1 test
- `RspamdProvider` — DKIM key deploy (decrypted key → `/etc/rspamd/dkim/`), ARC sealing, greylisting, RBL; 1 test
- `RoundcubeProvider` — webmail vhost provisioning (opt-in); 1 test

#### Domain + DNS schema (`migrations/`, `tundrad-domain`, `tundrad-repo`)
- Migration `20260503000070_domains.sql`: `domains`, `dns_zones`, `dns_records` (type CHECK 12 types), `ns_history`
- Domain types: `Domain`, `DnsRecord`, `DnsManagedBy` enum; `DomainRepo` + `DnsRecordRepo` (list/find/create/update/delete/`batch_replace` atomic TX)
- RBAC resources: `Domain`, `DnsRecord`

#### Domain + DNS REST (`tundrad-api`)
- `GET/POST /api/v1/domains`, `GET/DELETE /api/v1/domains/:id`
- `GET/POST /api/v1/domains/:id/dns-records`, `PUT/DELETE /api/v1/domains/:id/dns-records/:record_id`
- `POST /api/v1/domains/:id/dns-records/batch` — atomic zone replace (preserves `is_managed` records)

#### Mail schema + DKIM (`migrations/`, `tundrad-domain`, `tundrad-repo`)
- Migration `20260503000080_mail.sql`: `mail_domains`, `dkim_keys` (`private_key_encrypted bytea`), `mailboxes` (Argon2id + SHA512-CRYPT support), `aliases`, `mail_queue`, `mail_log`
- `EncryptedDkimPrivateKey` family (`tundra:v1:dkim_key:private_key`)
- Domain types: `MailDomain`, `DkimKey`, `Mailbox`, `Alias`, `MailQueueEntry`
- Repos: `MailDomainRepo`, `DkimKeyRepo` (rotate = deactivate + insert, `get_private_key_pem`), `MailboxRepo` (Argon2id hash, reset_password), `AliasRepo`, `MailQueueRepo`
- RBAC resources: `MailDomain`, `Mailbox`, `Alias`, `MailQueue`

#### Mail REST (`tundrad-api`)
- `GET/POST /api/v1/mail/domains`, `GET/DELETE /api/v1/mail/domains/:id`, `POST /:id/regenerate-dkim`
- `GET /api/v1/mail/domains/:id/mailboxes`, `GET /api/v1/mail/domains/:id/aliases`
- `POST /api/v1/mail/mailboxes`, `DELETE /api/v1/mail/mailboxes/:id`, `POST /:id/reset-password`
- `POST /api/v1/mail/aliases`, `DELETE /api/v1/mail/aliases/:id`
- `GET /api/v1/mail/queue`, `POST /queue/hold`, `POST /queue/release`, `POST /queue/delete`
- Mail domain create auto-generates DKIM keypair (stub RSA, audit logged)

#### Panel — Domains UI
- Domains list (apex, dns_managed_by badge, auto_renew, expiry)
- Add Domain form (apex, dns_managed_by, auto_renew, notes)
- Domain detail with DNS zone editor: record table, lock icon for managed records, inline Add Record form, confirm-Delete

#### Panel — Mail UI
- Mail Domains list (tab nav: Domains/Mailboxes/Queue, active/webmail badges)
- Add Mail Domain wizard (Step 1: domain+MX+SPF → Step 2: DMARC+DNS preview)
- Mail Domain detail (Regenerate DKIM → public key modal, mailbox quota bars, alias list)
- Diagnostics page (DNS checks MX/SPF/DKIM/DMARC, simulate pass after 1s, Send test email stub)
- Mail Queue (hold/release/delete per-message actions)

#### E2e tests
- `dns-zone-edit.spec.ts` — domains list/add, DNS zone editor record CRUD
- `mail-domain-setup.spec.ts` — mail domain setup, mailbox list, DKIM regeneration, diagnostics, queue actions

## [0.3.0] - 2026-05-03 — Databases & Backups (P3)

### Added

#### Database engine providers (`tundra-agent-providers`)
- `PostgresProvider` — cluster init, pg_dump, create_database, grant_privileges, perf profiles (Small/Medium/Large/Custom)
- `MysqlProvider` — MySQL 8.4 LTS equivalent; `mysqldump` shell stub
- `MariaDbProvider` — MariaDB 11.4 LTS equivalent
- `ValkeyProvider` — per-instance creation; persistence modes (None/Aof/Rdb)

#### Database schema + domain + repo (`migrations/`, `tundrad-domain`, `tundrad-repo`)
- Migration `20260503000050_databases.sql`: `database_servers` (FK→servers), `databases` (FK→applications), `db_users`, `db_grants`
- `EncryptedDbSuperuserPassword` + `EncryptedDbUserPassword` families (AES-256-GCM, HKDF)
- Domain types: `DatabaseServer`, `Database`, `DbUser`, `DbGrant`, enums `DbEngine`, `DbServerStatus`
- `DatabaseServerRepo`, `DatabaseRepo`, `DbUserRepo` with runtime sqlx queries; `set_grant` upsert; `get_decrypted_password` (decrypt-on-demand)

#### Database REST API (`tundrad-api`)
- 14 endpoints: CRUD for database-servers, databases, db-users; `grant`/`revoke` privileges; connection-string endpoint (step-up required, audit logged)
- New RBAC resources: `DatabaseServer`, `Database`, `DbUser`

#### Panel — Databases UI (`panel/`)
- Database Servers: list + add form (engine select auto-fills default port) + detail (databases on server, users on server)
- Databases: list + new form (server select, charset/collation) + detail with inline grant form (privilege checkboxes)

#### Backup schema + restic + repo (`migrations/`, `tundrad-backup`, `tundrad-repo`)
- Migration `20260503000060_backups.sql`: `backup_targets`, `backup_jobs`, `backup_snapshots`, `backup_restores`, `backup_locks`
- `EncryptedBackupRepoPassword` family (`tundra:v1:backup_target:repo_password`)
- `tundrad-backup` crate: `ResticClient` (CLI stub — init/backup/forget-prune/restore/check), `RetentionPolicy` (to_restic_flags), `BackupTarget` (restic_repo_url per kind: s3/local/sftp/b2/wasabi/r2)
- `BackupTargetRepo`, `BackupJobRepo`, `BackupSnapshotRepo`, `BackupRestoreRepo`

#### Backup REST API (`tundrad-api`)
- 18 endpoints: targets (list/get/create/delete/test), jobs (list/get/create/delete/run-now), snapshots (list/get), two-step restore (initiate→preview, confirm within 10-min window, cancel)
- New RBAC resources: `BackupTarget`, `BackupJob`, `BackupSnapshot`

#### Panel — Backups UI (`panel/`)
- Backup Targets: list (kind/default badges, per-row Test) + 2-step wizard (dynamic config fields per kind)
- Backup Jobs: list (schedule, last_status badge, Run now) + form (scope/target/schedule/retention)
- Backup Snapshots: list + per-row Restore button → preview modal → Confirm restore (preview-then-confirm)

#### Self-backup tools (`tundrad-self-backup`)
- `tundra-self-backup` binary: pg_dump → data-dir copy → SHA-256 checksums → manifest.json → tar → GPG encrypt
- `tundra-restore` binary: GPG decrypt → checksum verify → manifest validate → recreate DB → pg_restore → restore data dir → verify master key → systemctl lifecycle
- 3 checksum round-trip tests

#### E2e tests (`panel/e2e/`)
- `create-database.spec.ts` — DB server and database CRUD, grant flow
- `backup-roundtrip.spec.ts` — target/job/snapshot list, run-now, two-step restore preview-then-confirm
- `self-backup.spec.ts` — settings page, run-now, verify-latest

## [0.2.0] - 2026-05-03 — Single-host MVP (P2)

### Added

#### gRPC + Proto (`tundra-proto`, `tundrad-grpc`)
- `proto/tundra/v1/agent.proto`: `Agent` service — `Heartbeat`, `ReportStatus`, `StreamEvents`, `ExecuteAction`, `StreamLogs`
- `tundra-proto` build crate with `tonic-build` codegen for both server and client stubs
- `tundrad-grpc`: `AgentServiceImpl` stub registered on the Axum router

#### PKI / Agent CA (`tundrad-pki`)
- `TundraCA`: self-signed root CA (rcgen 0.13) with 10-year validity; persisted to `data/ca/ca.pem` + `ca-key.pem`
- `sign_agent_cert`: issues 1-year leaf cert per server with `tundra-agent://server-<id>` SAN URI
- `SetupToken`: 32-byte CSPRNG, `tnd_setup_<base64url>`, 24 h TTL; hash-only storage (SHA-256)

#### Agent crates (6 crates)
- `tundra-agent-rpc`: Tonic gRPC client stub
- `tundra-agent-reconciler`: `Provider` trait — `observe`/`reconcile`/`destroy` with `Spec`/`State` associated types; `ReconcileLoop` with `desired_state` map and `reconcile_all` tick
- `tundra-agent-providers`: `DeployPipeline` — 6-stage atomic deploy (clone→build→release-dir→env-write→symlink-swap→prune); rolling 5-release window
- `tundra-agent-metrics`: `MetricsScraper` stub
- `tundra-agent-logs`: `LogShipper` stub
- `tundra-agent-bin`: agent binary wiring all providers + reconcile loop

#### Server enrolment
- Migration `20260503000010_servers.sql`: `servers`, `agent_credentials`, `services`, `packages`, `firewall_rules`
- `ServerRepo`: create (generates setup token), enrol (verifies token + stores cert), list, find, delete
- REST: `GET/POST /api/v1/servers`, `GET/DELETE /api/v1/servers/:id`, `POST /api/v1/servers/:id/enrol`

#### Sites, Applications, Deployments
- Migration `20260503000020_sites.sql`: `sites`, `applications`, `deployments`, `env_vars`, `releases`, `site_aliases`, `site_health_checks`
- `SiteRepo`: `create_with_application` (atomic TX), list deployments, trigger deploy
- REST: `GET/POST /api/v1/sites`, `GET/DELETE /api/v1/sites/:id`, `GET /api/v1/sites/:id/deployments`, `POST /api/v1/sites/:id/deploy`

#### ACME + Certificates
- Migration `20260503000030_certificates.sql`: `acme_accounts`, `certificates`

#### Job queue
- `JobQueue`: `enqueue`, `dispatch` (`SELECT … FOR UPDATE SKIP LOCKED`), `ack`, `fail` with exponential retry

#### Event bus
- `EventBus` (fred 10.x): `publish`, `subscribe` on typed channels (`deployment:<id>`, `site:<id>:logs`, …)

#### Panel UI
- Servers list, Add Server form (enrolment command flow), Server detail
- Sites list, 4-step Create Site wizard (Formik + Yup), Site detail with deployments table
- `api-types.ts`: TypeScript interfaces for Server, Site, Deployment, response types

#### E2e tests
- Playwright 1.45 config; 4 spec files: setup-wizard, add-server, create-site, deploy-rollback

## [0.1.0] - 2026-05-03 — Foundation (P1)

### Added

#### Cryptography (`tundrad-crypto`)
- `MasterKey`: 64-byte file (32-byte key + 32-byte BLAKE3 trailer); integrity-checked on load; refuses to start on mismatch
- `KeyRing`: process-global singleton with lazy HKDF-SHA256 per-column-family key derivation; family keys live in memory only
- `EncryptedField<T, F>`: SQLx `bytea` custom type — `[ver][nonce][ct+tag]` envelope, family marker trait
- Well-known families: `TotpSecretFamily`, `RecoveryCodesFamily`, `EnvVarFamily`, `PluginSettingsFamily`
- `hash_password` / `verify_password`: Argon2id m=64 MiB, t=3, p=1

#### Database (`migrations/`)
- 4 SQL migrations: bootstrap extensions (pgcrypto, citext, pg_trgm, btree_gin), Identity & Access schema, internal tables, seed system roles
- Tables: `operators`, `sessions`, `passkeys`, RBAC quad, `audit_log` with chain-hash trigger (sha3-256 via pgcrypto), `api_tokens`, `jobs`, `locks`, `settings`
- Seed: owner/admin/operator/readonly roles with full permission matrix

#### Domain types (`tundrad-domain`)
- `Operator`, `OperatorRole`, `NewOperator`
- `Session`, `NewSession`
- `AuditEntry`, `NewAuditEntry`, `AuditActor`

#### Repository layer (`tundrad-repo`)
- `OperatorRepo`: find by id/email, create, record login, TOTP secret management, soft delete
- `SessionRepo`: create, find by token (SHA-256 hash lookup), touch, record_full_auth, revoke, revoke_all_for_operator
- `AuditLogRepo`: append (chain hash from DB trigger), cursor-paginated list
- Runtime SQLx query API — no live DB required at compile time

#### Authentication (`tundrad-auth`)
- `SessionService`: password authentication (Argon2id verify), session lifecycle
- `AuthzService`: `Action` × `Resource` permission matrix; `require_step_up` (5-minute window)
- TOTP: RFC 6238 HMAC-SHA1 with hand-rolled base32; `generate_secret`, `verify`, `generate_recovery_codes`, `totp_uri`
- API tokens: `tnd_<env>_<base64url>` format; `mint_token`, `hash_token`
- HIBP: k-anonymity range check via SHA-1 prefix
- 20 unit tests covering all components

#### HTTP API (`tundrad-api`)
- `GET /healthz`, `GET /readyz` (live DB probe)
- `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`
- `GET/POST /api/v1/operators`, `GET /api/v1/operators/me`, `DELETE /api/v1/operators/{id}`
- `GET/POST /api/v1/operators/me/tokens`, `DELETE /api/v1/operators/me/tokens/{id}`
- `GET /api/v1/audit-log` (cursor pagination)
- `AuthSession` extractor (cookie-based session resolution)
- Canonical error envelope: `{"error":{"code","message","request_id","details"}}`

#### Configuration & telemetry (`tundrad-config`, `tundrad-telemetry`)
- figment layered config: TOML → `TUNDRA_`-prefixed env vars → `DATABASE_URL`
- tracing-subscriber setup: human-readable (dev) or JSON lines (prod); OTLP endpoint accepted (full wiring in P2)

#### Daemon binary (`tundrad-bin`)
- `tundrad serve`: loads config → verifies master key → runs migrations → starts Axum server
- `tundrad migrate`: applies pending migrations
- `tundrad master-key generate|verify`

#### Panel UI shell (`panel/`)
- Tailwind v4 `@theme` with full Tundra palette (Ink, Paper, Lichen, Rust, Aurora color scales)
- TanStack Router v1 file-based routing; dark mode via `[data-theme="dark"]`
- Routes: `/login`, `/dashboard`, `/operators`, `/audit-log`; `_auth` layout with redirect guard
- Owned shadcn-style components: `Button`, `Input`
- Zustand auth store with `persist` middleware; `ofetch` API client; `sonner` toasts

#### Test harness (`tundra-test-harness`)
- `TestEnv::new()`: starts real PostgreSQL 18 + Valkey containers via testcontainers; applies migrations
- `seed_operator` factory for seeding test data

#### Integration tests
- `tundrad-auth/tests/auth_flow.rs`: password auth success, wrong password, unknown email, refresh, revoke
- `tundrad-repo/tests/audit_chain.rs`: chain-hash non-null, forward-chaining, newest-first ordering

#### Documentation
- README.md in all 22 crates covering role, API, constraints, build instructions

## [0.0.1] - 2026-05-03 — Bootstrap

### Added
- Workspace scaffold per `tundra-technical-implementation-plan-v3.md` §11.3
- Toolchain pinned to Rust 1.95, Node 22
- `rustfmt.toml`, `.clippy.toml`, ESLint 9, Prettier 3 configured
- CI skeleton (lint, deps, unit-rust, unit-ts, build-binaries, build-panel)
- `deny.toml` with Apache-2.0/MIT/BSD-3-Clause/ISC/Unicode-DFS-2016 allowlist; openssl-sys banned
- `panel/` React 19 + Vite + TypeScript 5.7 strict + Tailwind 4 + TanStack Router/Query scaffold
- Apache-2.0 LICENSE, README, CHANGELOG
