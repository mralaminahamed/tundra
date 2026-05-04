# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project

Tundra is a self-hosted, Rust-based server-management platform — a modern alternative to Plesk and cPanel. Single static binary per component, spec-first discipline, no licensing fees.

**Author:** Al Amin Ahamed — GitHub/X `@mralaminahamed` · `mrabir.ahamed@gmail.com`
**Specs:** All 17 specification documents live in `docs/`. Read `docs/01-architecture/tundra-technical-implementation-plan-v3.md` first when starting work on a new area.

---

## Build & Development Commands

### Rust workspace

```bash
cargo check --workspace                                        # fast type-check, no codegen
cargo build --workspace                                        # debug build
cargo build --release --workspace                              # release build
cargo test --workspace                                         # all tests
cargo test -p tundrad-api                                      # single crate
cargo test -p tundrad-api auth::tests::login_rate_limit        # single test
cargo fmt --all                                                # format
cargo fmt --all -- --check                                     # CI format check
cargo clippy --workspace --all-targets -- -D warnings          # lint (must be clean)
cargo deny check                                               # license + advisory audit
cargo llvm-cov --workspace                                     # coverage report
```

### Panel (always run from `panel/`)

```bash
pnpm install                   # install deps (generates pnpm-lock.yaml)
pnpm typecheck                 # tsc --noEmit (must be clean)
pnpm lint                      # eslint src (must be clean)
pnpm lint:fix                  # auto-fix lint
pnpm format:check              # prettier check
pnpm test --run                # vitest one-shot
pnpm test                      # vitest watch
pnpm dev                       # dev server (proxies /api → localhost:7400)
pnpm build                     # production build to dist/
```

### Database migrations

```bash
sqlx migrate run               # apply pending migrations (DATABASE_URL must be set)
sqlx migrate add <name>        # create new migration file in migrations/
```

---

## Architecture

### Component topology

| Binary | Crate | Role |
|--------|-------|------|
| `tundrad` | `tundrad-bin` | Control plane — HTTP API, gRPC server, DB authority, job dispatcher, event bus |
| `tundra-agent` | `tundra-agent-bin` | Per-node agent — provisioning, telemetry, log shipping |
| `tundra` | `tundra-cli` | Operator CLI |
| (SPA) | `panel/` | React 19 UI served by `tundrad` at `/_app/` |

Single-host mode: `tundrad` ↔ `tundra-agent` over Unix domain socket.
Multi-host mode: mTLS gRPC over port 7447 (`proto/tundra/v1/agent.proto`).

### Control-plane crate boundaries

```
tundrad-domain      Pure domain types + business logic — zero I/O, no DB
tundrad-repo        SQLx repositories; all DB access; owns transactional boundaries
tundrad-api         Axum 0.8 HTTP routes and request/response DTOs
tundrad-grpc        Tonic 0.13 gRPC service implementations
tundrad-auth        Sessions, API tokens, TOTP, WebAuthn, RBAC enforcement
tundrad-crypto      Master key, HKDF, AES-256-GCM, EncryptedField<T> SQLx type
tundrad-jobs        Background job types (deploy, backup, cert renewal, …)
tundrad-events      Valkey pub/sub event bus (publish side lives in handlers)
tundrad-acme        instant-acme wrapper for Let's Encrypt / ZeroSSL
tundrad-plugin-host Wasmtime sandbox, capability gate, WIT host-call dispatch
tundrad-config      figment-based layered config (TOML → env vars → secrets)
tundrad-telemetry   tracing-subscriber setup, OTLP export
tundra-shared       Types shared across tundrad + agent (UUIDs, enums, DTOs)
tundra-test-harness TestEnv (Postgres + Valkey containers), typed factories
```

Agent crates follow the same split: `tundra-agent-rpc` (Tonic client), `tundra-agent-reconciler` (desired→actual), `tundra-agent-providers` (one Provider trait impl per managed service), `tundra-agent-metrics`, `tundra-agent-logs`.

### API surfaces

- **REST** — `POST /api/v1/…`, OpenAPI 3.1 spec at `proto/openapi.yaml` (spec-first; code conforms to spec, not reverse). Error envelope: `{"error":{"code":"resource.verb","message":"…","request_id":"req_…","details":{…}}}`.
- **gRPC** — `tundra.agent.v1.Agent` service, mTLS only, defined in `proto/tundra/v1/agent.proto`.
- **WebSocket** — `/ws/v1/events`, multiplexed per-session subscriptions (`site:<id>:logs`, `deployment:<id>`, …).

### Database

PostgreSQL 18 only. `migrations/` contains the canonical DDL (up-only, managed by sqlx-cli).
Key conventions enforced in every table: `uuidv7()` PK, `created_at`/`updated_at timestamptz`, `BEFORE UPDATE` trigger for `updated_at`. Soft-deletable tables also have `deleted_at timestamptz NULL`.

Encrypted columns use `tundrad_crypto::EncryptedField<T>` — a SQLx custom type that encrypts on write and decrypts on read using AES-256-GCM with HKDF-derived per-column-family keys. Any field holding a secret must use this type; plaintext secrets in the DB are a security bug.

### Frontend

React 19 SPA. Routing: TanStack Router 1.x (file-based under `panel/src/routes/`). Server state: TanStack Query 5.x. Client state: Zustand 5.x. Forms: React Hook Form + Zod for simple forms; Formik + Yup for multi-step wizards. Styling: Tailwind CSS 4 + shadcn/ui (components are owned/copied into `panel/src/components/ui/`, not imported from npm). Real-time: native WebSocket forwarded by `tundrad`. Types generated from `proto/openapi.yaml` via `openapi-typescript`.

---

## Hard Constraints

These are non-negotiable and must never be violated:

1. **No `openssl-sys`** — `rustls` only throughout the entire dep tree. `deny.toml` bans `openssl`, `openssl-sys`, `openssl-probe`. Any new dep that transitively requires OpenSSL must be replaced or feature-flagged out.

2. **Up-only migrations** — never write a `down` migration. Reverting a deploy means code revert + a new forward migration. The Database Spec §8 explains why.

3. **`EncryptedField<T>` discipline** — every column holding a secret (passwords, API keys, TOTP secrets, private keys, env var values with `is_secret=true`) must be `bytea` + `EncryptedField<T>`. The list is enumerated in `docs/01-architecture/tundra-database-schema-v1.md` §9.

4. **Spec-first REST** — new endpoints must be designed in `proto/openapi.yaml` first. The contract test (`tests/openapi_drift.rs`) fails if code diverges from spec.

5. **Audit every mutation** — every state-changing handler writes a row to `audit_log` before returning. Actor is taken from the authenticated principal, never from the request body.

6. **TLS 1.3 only** — `rustls` is configured with explicit AEAD cipher list. No plaintext fallback anywhere.

7. **`publish = false`** on all binary crates. Library crates are workspace-internal only.

---

## Testing Conventions

From `docs/04-quality/tundra-test-plan-v1.md`:

- Integration tests use `tundra-test-harness::TestEnv` which spins real Postgres + Valkey containers. **Never mock the database.**
- Every new route gets rows in `tests/authz_matrix.rs` covering unauthenticated (→ 401), wrong-role (→ 403), and correct-role (→ 2xx) cases.
- Snapshot tests for generated configs (Nginx blocks, systemd units) use `insta`.
- Property tests for parsers and serializers use `proptest`.
- Coverage is measured with `cargo-llvm-cov`; module floors are defined in the test plan.

For the frontend, component tests use React Testing Library + MSW for HTTP mocking. E2E uses Playwright. Every route must pass `axe-core` WCAG 2.1 AA.

---

## Security Rules

From `docs/03-security/tundra-security-audit-v1.md`:

- Argon2id parameters: `m=64MiB, t=3, p=1`. Never downgrade.
- API token format: `tnd_<env>_<random>`. Store SHA-256 only, never plaintext.
- Step-up authentication required for sensitive ops (server deletion, master-key rotation, admin token issuance): assert `session.last_full_auth_at > now() - interval '5 minutes'`.
- Secret-bearing struct fields must derive `#[redact]` so they don't leak via `Debug`.
- No `format!()` into SQL — parameterized queries only.
- No `unwrap()` in HTTP handlers — use `?` + explicit error mapping.

---

## Relevant Skills

Use these skills for the corresponding tasks when working in this repository:

| When | Skill |
|------|-------|
| Before implementing a new feature or build phase | `/superpowers:writing-plans` |
| Executing a written implementation plan | `/superpowers:executing-plans` |
| Implementing any feature (spec mandates TDD) | `/superpowers:test-driven-development` |
| Any bug, test failure, or unexpected behavior | `/superpowers:systematic-debugging` |
| Before claiming work done or opening a PR | `/superpowers:verification-before-completion` |
| 2+ independent tasks that can parallelize | `/superpowers:dispatching-parallel-agents` |
| After completing a major implementation chunk | `/superpowers:requesting-code-review` |
| Finishing a phase and deciding how to integrate | `/superpowers:finishing-a-development-branch` |
| Reviewing changed code for reuse and quality | `/simplify` |
| Reviewing code for security issues | `/security-review` |

---

## Phase Status

| Phase | Status | Notes |
|-------|--------|-------|
| P0 — Bootstrap | ✅ Done | `cargo check`, `pnpm typecheck`, all lints pass |
| P1 — Foundation | ✅ Done | Crypto, migrations, domain, repo, auth, API skeleton, config, telemetry, panel shell |
| P2 — Single-host MVP | ✅ Done | proto+gRPC, PKI/mTLS, agent crates, server enrolment, sites+deployments, job queue, Valkey events, panel UI, Playwright e2e |
| P3 — Databases & Backups | ✅ Done | DB engine providers (PG/MySQL/MariaDB/Valkey), database schema+REST+panel, restic backup module, preview-then-confirm restore, self-backup+restore tools, e2e specs |
| P4 — Email & DNS | ✅ Done | PowerDNS/Unbound/Postfix/Dovecot/Rspamd/Roundcube providers, domain+DNS schema+REST+panel, mail schema+DKIM+REST+panel, diagnostics, e2e specs |
| P5 — Multi-runtime | ✅ Done | Node/Python/Go/Rust/Ruby/.NET providers, systemd Appendix B templates, blue/green deploy, daemons+cron schema+REST+panel, site wizard enhancements, starter templates, e2e specs |
| P6 — Multi-server | ✅ Done | SSH installer wizard, server_metrics_state, cross-server site move (7-stage pipeline), per-agent rate limiting + circuit breaker, maintenance windows, multi-server fleet panel, e2e specs |
| P7 — Templates & Plugins | ✅ Done | Wasmtime plugin host (tundra-plugin-sdk + WIT), MCP server plugin (stdio+HTTP, scope/session model), Namecheap + GitHub plugins, 13 YAML templates + gallery, metrics_samples partitioning, alert rule evaluator, alerts panel, e2e specs |
| P8 — Production hardening | ✅ Done | Nginx/PHP-FPM provisioning, Let's Encrypt ACME, billing, acceptance CLI (`tundra acceptance run`), getting-started + security docs, beta tag |
| P9 — General Availability | ✅ Done | Beta feedback triage, contract tests, SLSA provenance + release workflow, docs index + UPGRADING, red-team §9 walk, v1.0.0 GA tag |

Full phase breakdown: `docs/01-architecture/tundra-technical-implementation-plan-v3.md` §11.1.
Build prompts for each phase: `docs/08-build-prompts/tundra-claude-code-prompts-v1.md`.
