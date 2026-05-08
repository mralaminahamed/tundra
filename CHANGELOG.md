# Changelog

All notable changes to Tundra will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

#### Setup wizard (`tundrad-api`, `panel/`)
- `GET /api/v1/setup/status` — public endpoint; returns `{needs_setup, version}`
- `POST /api/v1/setup/init` — creates first Owner account + optional instance name; guards against re-init (409)
- `/` root route auto-redirects to `/setup` on fresh install, `/login` when initialized
- Setup wizard: split-panel layout (dark brand panel + white form), 2-step flow (Account → Configure), password strength bar, live confirm-password checkmark, sidebar preview, animated Done screen with next-step cards

#### WordPress management (`tundrad-api`, `tundra-agent-providers`, `panel/`)
- WP-CLI provisioner: zip extract → wp-cli install → DB create → config write → `wp core install`; reprovision endpoint
- Per-install MySQL DB isolation: auto-generated credentials, `wordpress` database + scoped user
- `PATCH /api/v1/sites/:id/wordpress/:install_id/settings` — site URL, blog name, tagline, reading/discussion/permalink settings
- `GET/POST/DELETE /api/v1/sites/:id/wordpress/:install_id/plugins` — WP.org search + install/activate/deactivate/delete via WP-CLI
- `GET/POST/DELETE /api/v1/sites/:id/wordpress/:install_id/themes` — theme management via WP-CLI
- `GET/PATCH /api/v1/sites/:id/wordpress/:install_id/php` — PHP version management + FPM pool reload
- WordPress clone + staging: full DB dump → file copy → new credentials → GUID rewrite
- phpMyAdmin-style SQL editor (dark/light mode, CodeMirror syntax highlighting, MySQL config)
- Disk usage tracking (`disk_usage_mb`), SSL active + PHP version surfaced in API and UI
- WordPress detail: 9 nested sub-routes (Overview / Plugins / Themes / Users / PHP / Database / Security / Backups / Danger)
- 3-step install wizard; per-install plugin/theme manager; danger zone (delete, reset password)

#### File manager (`tundrad-api`, `panel/`)
- `GET /api/v1/sites/:id/files` — directory listing with size, mtime, type
- `GET /api/v1/sites/:id/files/content` — file read
- `PUT /api/v1/sites/:id/files/content` — file write (CodeMirror editor)
- `POST /api/v1/sites/:id/files/upload` — multipart upload
- `GET /api/v1/sites/:id/files/download` — file/directory download (zip on-the-fly)
- `POST /api/v1/sites/:id/files/copy|move` — copy and move with progress
- `DELETE /api/v1/sites/:id/files` — delete file or directory tree
- Right-click context menu (Edit / Rename / Copy / Move / Delete)
- 51 SVG file-type icons in `panel/src/components/icons/file-types.tsx`
- API-driven sidebar directory tree (replaces hardcoded `DIR_TREE`)

#### Panel — Sites (`panel/`)
- Site detail redesigned with 10 nested sub-routes (Overview / Files / Deployments / Databases / PHP / Logs / Analytics / SSL / Backups / Settings / Danger)
- Create New Site wizard: 7 source types (Blank / WordPress / Template / GitHub / GitLab / Bitbucket / ZIP), `VersionSelect` combobox with grouped branches, EOL/security badges, live PHP versions
- `AppStep` locks runtime type when template or WordPress is selected
- Runtime version lists updated to May 2026 (PHP 8.1–8.4, Node 20/22, Python 3.11–3.13, Go 1.22–1.24)

#### DNS templates (`templates/dns/`, `panel/`)
- 30 YAML DNS templates across 5 categories (web, email, deploy, security, utility)
- Providers: Cloudflare, ProtonMail, Fastmail, Resend, Postmark, Fly.io, Render, Railway, Vercel, Netlify, GitHub Pages, Google Workspace, Microsoft 365, Zoho, Amazon SES, Mailgun, BIMI, DMARC enforce, MTA-STS, CAA (Let's Encrypt + ZeroSSL), parked domain, subdomain delegation, Google Site Verification
- `TemplatePicker` + `TemplateImportModal` components with category filter and variable substitution
- Site DNS tab wired to template picker; domain detail/create redesigned with wizard-style layout

#### Platform & operator settings (`migrations/`, `tundrad-api`, `panel/`)
- Migration `20260508000182_operator_profile_fields.sql`: `phone`, `timezone`, `job_title` columns on `operators`
- Migration `20260508000183_platform_settings.sql` + `20260508000184_platform_settings_extra_sections.sql`: key/value settings store
- `PATCH /api/v1/operators/me` — self-edit profile fields
- 5 settings pages: General / SMTP / Notifications / Security / Backups; branding, DNS defaults, security-policy sections
- Clickable profile card in nav footer; logout → `/login`

#### Installer improvements (`installer/`)
- `TUNDRA_BINARIES_DIR` env var: skip GitHub download, inject local binaries (for testing)
- Step 16: self-registers local server via `psql` INSERT + writes `agent.toml`
- Fixed: Caddy APT repository setup (Step 4), `valkey-server` vs `valkey` service name per distro, `zstd` in prerequisites, `tundra-agent.service` systemd unit, `C.UTF-8` locale fallback
- Ubuntu 24.04 + systemd Docker test image (`docker/Dockerfile.installer-test`)
- `installer/test.sh`: stub or real-binary test runner with `--real-bins` and `--shell` flags; verifies binaries, configs, services, DB, uuidv7(), migrations, server row, master key

#### Deployment bundle (`docs/09-deployment-bundle/`)
- `prod/scripts/entrypoint.sh`: reads Docker secret files at runtime, exports `DATABASE_URL` + `VALKEY_URL` before exec-ing tundrad
- `entrypoint.sh` wired into `dockerfiles/Dockerfile.tundrad` runtime stage

#### E2E + CI (`panel/e2e/`, `.github/workflows/`)
- `e2e/scripts/run.sh`: full lifecycle runner — `up / down / reset / test / full / logs / status`; `--multi` for agent-2 profile
- `.github/workflows/e2e.yml`: 3-shard Playwright CI on push/PR/weekly; builds prod Docker images, merges blob reports, uploads HTML artifact (14-day retention)
- `setup-wizard.spec.ts`: 8 tests covering brand panel, field validation, password strength, confirm checkmark, full 2-step flow, 409 guard, auth redirects
- `e2e/.env.example`: env template with ports, URLs, timeout, project, log level

#### GitHub community files (`.github/`)
- `ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml`, `config.yml` (private advisory link, blank issues disabled)
- `PULL_REQUEST_TEMPLATE.md`: type checklist + hard-constraint checklist (authz matrix, migrations, EncryptedField, audit_log)
- `SECURITY.md`: supported versions, 48h response SLA, private advisory link
- `CODEOWNERS`: owner review required for crypto / auth / migrations / installer / CI / plugin-host
- `dependabot.yml`: weekly Cargo + npm + Actions updates; patches grouped, majors blocked
- `CONTRIBUTING.md`: quick start, hard constraints table, commit style, route/migration checklists

#### Migrations
- `20260509000187_add_uuidv7.sql`: `uuidv7()` PL/pgSQL function (moved out of bootstrap migration)
- `20260508000185_domains_site_id.sql` + `20260508000186_domains_backfill_site_id.sql`: `domains.site_id` FK + backfill

### Fixed
- Migration checksum mismatch: bootstrap migration reverted to original; `uuidv7()` in dedicated migration
- `TUNDRAD_CONFIG` → `TUNDRA_CONFIG` in prod, e2e, dev compose files (wrong var caused silent fallback to defaults)
- pnpm `9` → `10.33.2` in `Dockerfile.panel-ui` and dev compose (matches `package.json` `packageManager` field)
- `DnsRecordRow` `#[sqlx(rename = "type")]` removed; column alias `type AS record_type` used correctly
- Rust timestamp `new Date()` failure: non-standard `+00:00:00` timezone suffix and microseconds normalized
- `sites.status` not updated when WordPress provisioning completes
- `db_name` / `db_user` not persisted after WP provisioning
- Unused `SessionRepo` import in `setup.rs`
- E2E test credentials: `helpers.ts` `loginAs` default changed from `admin@example.com / Test1234!` to `owner@example.com / correct horse battery staple` (matches `tundrad.e2e.toml` seed)

### Changed
- `templates/` restructured: 13 site YAMLs → `templates/sites/`, 30 DNS YAMLs → `templates/dns/`
- Panel icon system migrated from emoji and `react-icons` to owned SVG components in `panel/src/components/icons/`
- README features section updated: file manager, WordPress management, 43 templates, DNS templates, setup wizard added

---

## [1.0.0] - 2026-05-04 — General Availability (P9)

### Added

#### Release engineering
- SLSA Level 3 provenance via `slsa-framework/slsa-github-generator` — binary digests attached to GitHub releases
- `release.yml` workflow: cross-compilation for `linux/amd64` + `linux/arm64`, GHCR image push (`ghcr.io/mralaminahamed/tundra/{tundrad,tundra-agent}`)
- `tundra-self-backup` + `tundra-restore` binaries included in release artifacts

#### Contract tests + quality gates
- `tests/openapi_drift.rs` — replays OpenAPI 3.1 spec against live server; fails CI on drift
- Error envelope shape, pagination meta, and MCP init handshake covered by contract suite

#### Security hardening
- Step-up enforcement (`session.last_full_auth_at > now() - 5 min`) on sensitive ops (server delete, master-key rotate, admin token issuance)
- CSP `default-src 'self'` + HSTS preload + CSRF double-submit middleware
- Redaction pipeline: `#[redact]` derive on all secret-bearing structs; verified by audit

#### Performance + reliability
- `cargo-fuzz` targets: `fuzz_audit_canonicaliser`, `fuzz_manifest_parser`
- `criterion` benchmarks wired into nightly CI
- `k6` load test scripts for sites-list endpoint
- Missing indexes for dashboard aggregate queries added (`20260504000135_missing_indexes.sql`)
- `tundra acceptance run --section all` command — operator-facing post-install acceptance suite

#### Documentation
- `docs/UPGRADING.md` — migration policy, major-version upgrade notes
- `guidelines/` index with 6 audience-grouped guides (operator, developer, API, MCP, plugin, local-dev)
- Security red-team walk (`guidelines/security-redteam-v1.md`)

### Changed
- All migration filenames stripped of phase prefix (`p6-`, `p7-`, etc.)
- `migrations/` moved back to repo root; `database/` kept for Rust seeders only

---

## [0.7.0] - 2026-05-04 — Templates & Plugins (P7)

### Added

#### Plugin system (`tundrad-plugin-host`, `tundra-plugin-sdk`)
- Wasmtime 22 sandbox: per-plugin fuel + memory limits (`sandbox_fuel_per_invocation`, `sandbox_memory_max_bytes`), epoch interrupt
- WIT contracts (`tundra-plugin-sdk`): `tundra:plugin/http`, `tundra:plugin/kv`, `tundra:plugin/events`, `tundra:plugin/audit`
- Plugin lifecycle: install, enable, disable, uninstall; capability gate per host-call
- Migrations: `plugin_*` tables (capabilities, settings, jobs, events, kv, data_quotas, plugin_templates)
- REST: `GET/POST /api/v1/plugins`, enable/disable/uninstall endpoints

#### Official plugins
- `tundrad-plugin-namecheap`: registrar NS update + renewal + DNS sync
- `tundrad-plugin-github`: GitHub App auth, webhook HMAC, repo-driven deploy trigger, PR preview environments
- `tundrad-plugin-wordpress`: WordPress install wizard, plugin/theme REST, WP.org integration, template ownership
- `tundrad-plugin-mcp`: Model Context Protocol server — stdio + HTTP transports, scope/session model, full tool catalog with JSON Schemas
- Scaffold crates: cloudflare, mailgun, slack, discord, s3-backup

#### MCP server (`tundrad-plugin-mcp`)
- `tundra mcp serve|tokens|sessions|audit` CLI stubs
- `plugin_mcp_*` tables: sessions, tool invocations, tokens, audit pipeline
- Settings → AI Agents (MCP) panel page

#### Templates
- 13 built-in YAML templates: WordPress, WooCommerce, Laravel, Next.js, Nuxt, Remix, Django, FastAPI, Rails, Node API, Static, Go API, Rust API
- `GET /api/v1/templates` — template registry endpoint
- Templates gallery panel page + create-from-template wizard branch
- `source_config.template_id` persisted on site creation

#### Monitoring + alerts
- `metrics_samples` table partitioned by week (pg_partman)
- `alert_rules` + `alert_deliveries` migration
- Alert rule evaluator (threshold, comparison, cooldown)
- Alert REST endpoints + panel alerts page with active alerts and rule CRUD

#### E2e tests
- `plugins-gallery.spec.ts`, `templates-gallery.spec.ts`, `mcp-settings.spec.ts`

---

## [0.6.0] - 2026-05-04 — Multi-server (P6)

### Added

#### Agent install + fleet management (`tundrad-api`, `tundra-agent-bin`)
- SSH-based agent install wizard: fingerprint confirmation, one-shot enrolment token, remote bootstrap over SSH
- `server_metrics_state` table: latest CPU/RAM/disk snapshot per server
- Maintenance windows: scheduled downtime with reason, affects alert suppression

#### Cross-server site move (`tundrad-api`, `tundra-agent-reconciler`)
- 7-stage atomic move pipeline: snapshot → push → verify → cut-over → DNS update → cleanup → confirm
- `site_moves` table with per-stage status and rollback support

#### Reliability
- Per-agent rate limiting (token bucket, configurable burst)
- Circuit breaker per managed service (half-open probe, trip threshold)

#### Panel
- Multi-server fleet list: group by region, agent status badges, bulk actions
- Maintenance window scheduler

#### E2e tests
- `multi-server-deploy.spec.ts`, `cross-server-move.spec.ts`

---

## [0.5.0] - 2026-05-04 — Multi-runtime (P5)

### Added

#### Runtime providers (`tundra-agent-providers`)
- `NodeProvider` — nvm-based version management, npm/yarn/pnpm install, `npm run build`
- `PythonProvider` — pyenv + virtualenv, `pip install -r requirements.txt`
- `GoProvider` — toolchain download, `go build`
- `RustProvider` — `rustup` toolchain, `cargo build --release`
- `RubyProvider` — rbenv + bundler
- `DotnetProvider` — .NET SDK install, `dotnet publish`

#### Blue/green deployments
- `DeployPipeline`: 6-stage atomic deploy (clone → build → release-dir → env-write → symlink-swap → prune)
- Rolling 5-release window; instant rollback via symlink swap

#### Daemons + scheduled tasks (`migrations/`, `tundrad-api`, `panel/`)
- Migration `20260503000090_daemons.sql`: `daemons` (process supervisor config per site)
- Migration `20260503000095_scheduled_tasks.sql`: `scheduled_tasks` (cron-style, timezone-aware)
- Full CRUD REST for daemons and scheduled tasks
- Panel: daemons list + form (command, env, restart policy), scheduled tasks list + form (cron expression, run-now)

#### Templates
- 6 starter templates: Static, Next.js, Django, FastAPI, Rails, Node API

#### E2e tests
- `runtime-deploy.spec.ts` (per-runtime deploy specs), `daemons-scheduled-tasks.spec.ts`

---

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

---

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

---

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

---

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

---

## [0.0.1] - 2026-05-03 — Bootstrap

### Added
- Workspace scaffold per `tundra-technical-implementation-plan-v3.md` §11.3
- Toolchain pinned to Rust 1.95, Node 22
- `rustfmt.toml`, `.clippy.toml`, ESLint 9, Prettier 3 configured
- CI skeleton (lint, deps, unit-rust, unit-ts, build-binaries, build-panel)
- `deny.toml` with Apache-2.0/MIT/BSD-3-Clause/ISC/Unicode-DFS-2016 allowlist; openssl-sys banned
- `panel/` React 19 + Vite + TypeScript 5.7 strict + Tailwind 4 + TanStack Router/Query scaffold
- Apache-2.0 LICENSE, README, CHANGELOG

[Unreleased]: https://github.com/mralaminahamed/tundra/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/mralaminahamed/tundra/compare/v0.7.0...v1.0.0
[0.7.0]: https://github.com/mralaminahamed/tundra/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/mralaminahamed/tundra/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/mralaminahamed/tundra/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/mralaminahamed/tundra/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/mralaminahamed/tundra/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/mralaminahamed/tundra/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/mralaminahamed/tundra/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/mralaminahamed/tundra/releases/tag/v0.0.1
