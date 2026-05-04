# Tundra — Claude Code Prompts (Phase-by-Phase)

> The complete prompt suite for driving Claude Code through the Tundra build, end to end.
> Run **P0** once to bootstrap. Run each phase prompt (**P1 → P9**) in order. Run **PV** after every phase before advancing.

---

**Author:** Al Amin Ahamed
**GitHub:** [@mralaminahamed](https://github.com/mralaminahamed)
**X:** [@mralaminahamed](https://x.com/mralaminahamed)

**Document Version:** v1.0
**Document Date:** May 2026
**Status:** Implementation-ready prompt suite
**Audience:** The operator running Claude Code against an empty Tundra repo, working through the v3 roadmap

---

## How to Use This File

1. **Clone the Tundra repo** (or create it empty in the layout from `tundra-technical-implementation-plan-v3.md` §11.3) and place the **17 spec documents** in `docs/specs/` at the repo root. Claude Code will reference them by filename.
2. **Open Claude Code** in the repo root.
3. **Paste P0** as your first prompt. Wait for Claude Code to confirm it has read the docs (the "doc-read gate" — see §1 of P0). Reply `proceed` only after you've reviewed the confirmation block.
4. **Paste the next phase prompt** when P0 reports done. Each phase is self-contained but assumes prior phases have completed and committed.
5. **Run PV** after every phase before moving on. PV is the reusable audit prompt — it catches drift between the spec and the implementation.
6. **One phase per Claude Code session**, ideally. Long-running sessions accumulate context noise; a fresh session per phase keeps Claude Code focused.

### Conventions used in every prompt

- **Doc-read gate.** Each prompt's §1 lists the spec documents Claude Code must read before writing any code. Claude Code is instructed to output a confirmation block listing each doc's section headings or key claims, then **stop and wait for `proceed`**.
- **Reference, not inline.** Prompts cite the spec by filename and section (`tundra-database-schema-v1.md §3.1`). They do **not** repeat the spec inline. Claude Code is expected to consult the source when implementing.
- **Authorship.** Code, comments, and commit messages attribute Al Amin Ahamed personally (GitHub/X: `@mralaminahamed`). Not Codexpert Inc.
- **Strict typing.** Rust: `#![deny(unsafe_code)]` in non-FFI crates, `#![warn(clippy::all, clippy::pedantic)]`, `cargo clippy -- -D warnings` must pass. TypeScript: `strict: true`, no `any`, no `// @ts-expect-error` without justification comment.
- **`cargo build`, `cargo test`, `cargo clippy`, `pnpm typecheck`, `pnpm test`, `pnpm lint` must all pass** before Claude Code reports a phase done. The verify prompt re-checks.
- **Migrations are up-only.** Per `tundra-database-schema-v1.md` §8, no `down` migrations.
- **Commits are small, atomic, and descriptive.** Conventional Commits format. Each prompt explicitly states which commits to produce; reviewing the commit log should reconstruct the phase's narrative.
- **Test pyramid.** Per `tundra-test-plan-v1.md` §2: unit > integration > e2e in count. Every new module ships with unit tests; integration tests for handlers; e2e for operator-visible flows when the phase introduces them.
- **No placeholder code.** No `todo!()`, no `unimplemented!()`, no `// TODO: implement` left at end of phase. Stubs that need filling in later phases are listed in that phase's exit criteria.

---

## Spec Document Index (Reference Map)

Every prompt below references these by filename. Claude Code should expect them in `docs/specs/` at the repo root.

| #  | Filename                                     | Purpose                                                         |
|----|----------------------------------------------|-----------------------------------------------------------------|
| 1  | `tundra-technical-implementation-plan-v3.md` | Overall architecture; the entry point                           |
| 2  | `tundra-database-schema-v1.md`               | Canonical PostgreSQL 18 schema; 73 tables across 14 modules     |
| 3  | `tundra-api-specification-v1.md`             | REST + gRPC + WebSocket surface                                 |
| 4  | `tundra-deployment-runbook-v1.md`            | Engineering install, master-key rotation, troubleshooting trees |
| 5  | `tundra-deployment-overview-v1.md`           | Operator-facing install and routine ops                         |
| 6  | `tundra-security-audit-v1.md`                | STRIDE threat model, controls catalog, attack trees             |
| 7  | `tundra-security-overview-v1.md`             | Operator-facing security model                                  |
| 8  | `tundra-test-plan-v1.md`                     | Test pyramid, harnesses, CI gates                               |
| 9  | `tundra-acceptance-checklist-v1.md`          | UAT, post-install/post-upgrade smoke, quarterly drill           |
| 10 | `tundra-plesk-migration-plan-v1.md`          | Plesk-source migration plugin                                   |
| 11 | `tundra-plugin-architecture-plan-v1.md`      | Wasm sandbox, capability system, WIT contracts                  |
| 12 | `tundra-additional-core-plugins-v1.md`       | Namecheap, GitHub plugins (MCP §4 deferred to dedicated docs)   |
| 13 | `tundra-frontend-ui-spec-v1.md`              | Panel UI design tokens, components, route map                   |
| 14 | `tundra-brand-guidelines-v1.md`              | Marks, lockups, typography, colour, OG cards                    |
| 15 | `tundra-mcp-server-spec-v1.md`               | MCP server engineering reference                                |
| 16 | `tundra-mcp-server-operator-v1.md`           | MCP operator guide                                              |
| 17 | `tundra-mcp-server-cookbook-v1.md`           | MCP integration cookbook                                        |

---

## Phase Map

| Prompt | Phase                           | Roadmap milestone              | Approx. duration |
|--------|---------------------------------|--------------------------------|------------------|
| **P0** | Bootstrap                       | Pre-roadmap                    | 1 session        |
| **P1** | Foundation                      | M0 — Hello-Tundra              | 4 weeks          |
| **P2** | Single-host MVP                 | M1 — First Site Live           | 8 weeks          |
| **P3** | Databases & Backups             | M2 — Database Self-Sufficiency | 4 weeks          |
| **P4** | Email & DNS                     | M3 — Mail & DNS Live           | 6 weeks          |
| **P5** | Multi-runtime                   | M4 — All Runtimes Online       | 5 weeks          |
| **P6** | Multi-server                    | M5 — Multi-Server              | 6 weeks          |
| **P7** | Templates & Plugins (incl. MCP) | M6 — Plugins & Templates       | 5 weeks          |
| **P8** | Hardening & Beta                | M7 — Beta                      | 4 weeks          |
| **P9** | General Availability            | M8 — v1.0 GA                   | 3 weeks          |
| **PV** | Verify (reusable)               | After every phase              | 1 session        |

---

# P0 — Bootstrap

> Run this first. It establishes context, configures the repo, and gates all subsequent code on the doc-read confirmation.

```text
You are about to start work on the Tundra project — a self-hosted, Rust-based server-management platform written by Al Amin Ahamed (GitHub/X: @mralaminahamed). This is **prompt P0** of the build. The full prompt suite lives in `docs/specs/tundra-claude-code-prompts-v1.md`.

# 1. Doc-read gate (do this first; do not write code yet)

Read every file in `docs/specs/`:
- tundra-technical-implementation-plan-v3.md   (architecture; the entry point)
- tundra-database-schema-v1.md                 (the schema we will implement)
- tundra-api-specification-v1.md               (REST + gRPC + WebSocket surface)
- tundra-deployment-runbook-v1.md              (install, hardening, recovery)
- tundra-deployment-overview-v1.md             (operator-facing flow)
- tundra-security-audit-v1.md                  (threat model, controls)
- tundra-security-overview-v1.md               (operator security model)
- tundra-test-plan-v1.md                       (test pyramid, CI gates)
- tundra-acceptance-checklist-v1.md            (UAT)
- tundra-plesk-migration-plan-v1.md            (migration plugin)
- tundra-plugin-architecture-plan-v1.md        (Wasm sandbox)
- tundra-additional-core-plugins-v1.md         (Namecheap, GitHub plugins)
- tundra-frontend-ui-spec-v1.md                (panel UI)
- tundra-brand-guidelines-v1.md                (marks, colour, typography)
- tundra-mcp-server-spec-v1.md                 (MCP server reference)
- tundra-mcp-server-operator-v1.md             (MCP operator guide)
- tundra-mcp-server-cookbook-v1.md             (MCP integration recipes)

Output a confirmation block in this exact shape, then STOP and wait for me to type `proceed`:

  ## Doc-Read Confirmation
  - tundra-technical-implementation-plan-v3.md  — read; key sections: …
  - tundra-database-schema-v1.md                — read; 73 tables across 14 modules; key conventions: uuidv7() PKs, encrypted-column discipline via EncryptedField<T>, up-only migrations
  - tundra-api-specification-v1.md              — read; three surfaces (REST/gRPC/WebSocket); error envelope shape: …
  …
  - tundra-mcp-server-cookbook-v1.md            — read; covers Claude Desktop, Claude Code, Cursor, Zed integration

  ## Architectural Decisions Noted
  - Rust 1.95, Tokio, Axum 0.8, Tonic 0.13, SQLx 0.8, PostgreSQL 18, Valkey 8, Wasmtime
  - Frontend: Vite 8 + React 19 + TS 5.7 strict + Tailwind 4 + shadcn/ui + TanStack Router/Query + Zustand + RHF/Zod for simple forms + Formik/Yup for wizards
  - 73 tables, all uuidv7() primary keys, partitioned metrics_samples
  - mTLS for agent fleet, Argon2id for passwords, AES-256-GCM under HKDF-derived keys
  - Spec-first: contract tests verify implementation against the OpenAPI spec and migrations
  …

  ## Ready to proceed?
  Awaiting `proceed`.

# 2. After `proceed` is given, do these in order:

## 2.1 Repository scaffold

Create the workspace described in tundra-technical-implementation-plan-v3.md §11.3. Use the listed crate names verbatim. Each crate gets a `Cargo.toml` with `edition = "2024"`, `rust-version = "1.95"`, and `publish = false` for binary crates. The workspace root `Cargo.toml` declares all crates as members and pins shared dependencies.

Crate inventory (verbatim from the plan):
- tundrad-bin, tundrad-api, tundrad-grpc, tundrad-domain, tundrad-repo, tundrad-jobs, tundrad-events, tundrad-acme, tundrad-auth, tundrad-crypto, tundrad-plugin-host, tundrad-config, tundrad-telemetry
- tundra-agent-bin, tundra-agent-rpc, tundra-agent-reconciler, tundra-agent-providers, tundra-agent-metrics, tundra-agent-logs
- tundra-cli, tundra-shared, tundra-test-harness

Top-level directories: `crates/`, `proto/`, `migrations/`, `panel/` (separate package.json), `installer/`, `docs/` (specs already in `docs/specs/`), `.github/workflows/`.

## 2.2 Toolchain pinning

Create `rust-toolchain.toml` pinning `channel = "1.95"`, components `["clippy", "rustfmt", "rust-src"]`. Create `.cargo/config.toml` with sensible defaults (incremental on for dev, off for CI; sparse registry).

Create `.nvmrc` with Node 22. Create `panel/.npmrc` with `engine-strict=true`. Create `panel/package.json` with the exact dependency set from tundra-frontend-ui-spec-v1.md (Vite 8, React 19, TS 5.7, Tailwind 4, shadcn/ui, TanStack Router/Query, Zustand, RHF + Zod, Formik + Yup, Lucide React, Recharts) using pnpm as the package manager.

## 2.3 Lint, format, type-check

Configure: `rustfmt.toml` (max_width = 100, wrap_comments = true, format_code_in_doc_comments = true), `.clippy.toml` (msrv = "1.95", cognitive-complexity-threshold = 30). Configure ESLint + Prettier for `panel/` per tundra-frontend-ui-spec-v1.md.

## 2.4 CI skeleton

Create `.github/workflows/ci.yml` per tundra-test-plan-v1.md §7. The required jobs at this stage: `lint`, `deps` (cargo audit, cargo deny, npm audit), `unit-rust`, `unit-ts`, `build-binaries`, `build-panel`. Integration / e2e jobs land in P1 once tests exist.

Create `deny.toml` with the project's licence allowlist (Apache-2.0, MIT, BSD-3-Clause, ISC, Unicode-DFS-2016) and dependency banlist (no openssl-sys; rustls only).

## 2.5 Repo hygiene

`.gitignore` for Rust + Node + macOS. `.editorconfig`. `LICENSE` (Apache-2.0; copyright Al Amin Ahamed 2026).

`README.md` at the repo root — short, links to the spec docs in `docs/specs/`, attribution to Al Amin Ahamed (GitHub/X: @mralaminahamed). Do not duplicate the technical plan; link to it.

`CHANGELOG.md` — initialised with `## [Unreleased]` and `## [0.0.1] - 2026-XX-XX — Bootstrap` for the P0 commit.

## 2.6 Initial commits

Commits, in order, conventional-commits format:
1. `chore: scaffold workspace per tundra-technical-implementation-plan-v3.md §11.3`
2. `chore(toolchain): pin Rust 1.95, Node 22; configure rustfmt, clippy, ESLint, Prettier`
3. `chore(ci): add lint, deps, unit, build jobs per tundra-test-plan-v1.md §7`
4. `chore(repo): add LICENSE, README, CHANGELOG, .gitignore, .editorconfig`

# 3. Exit criteria for P0

- [ ] All 17 spec docs read; doc-read confirmation block produced
- [ ] Workspace scaffold matches tundra-technical-implementation-plan-v3.md §11.3 verbatim
- [ ] `cargo check --workspace` passes (no code yet — empty crates with placeholder lib.rs)
- [ ] `cd panel && pnpm install` completes; `pnpm typecheck` passes on the empty project
- [ ] `cargo fmt --check`, `cargo clippy --workspace -- -D warnings`, `cargo deny check`, `pnpm lint` all pass
- [ ] CI YAML lints clean with `act --list`
- [ ] Four commits in the log, conventional-commits format
- [ ] CHANGELOG updated

When all boxes are checked, output a phase summary in this shape and stop:

  ## P0 — Bootstrap — Done
  - Workspace: <N> crates created, <N> directories
  - Toolchain: Rust 1.95, Node 22 pinned
  - CI: <N> jobs configured
  - Commits: <hashes>
  - Next: run prompt PV (verify), then prompt P1 (Foundation)
```

---

# P1 — Foundation

> M0 — Hello-Tundra. Operator can log in, see dashboard, manually add a server placeholder.
> Implements: panel database schema, auth, RBAC, audit log, base Axum API skeleton, base React UI shell.

```text
This is **prompt P1** — Foundation. P0 is complete and on `main`. The 17 spec documents are in `docs/specs/`.

# 1. Doc-read gate

Re-read these (they're the active references for this phase):
- tundra-database-schema-v1.md         §1, §2, §3.1 (Identity & Access), §3.13 (Internal: jobs, locks, settings, schema_migrations), §5 (constraints), §8 (migrations), §9 (encryption)
- tundra-api-specification-v1.md       §1 (overview), §1.2 (auth), §1.3 (idempotency), §1.4 (errors), §1.5 (pagination), §2 (REST surface up to operators + tokens + auth)
- tundra-security-audit-v1.md          §3 (assets), §4.1 (operator identities), §4.2 (master key), §4.5 (audit log), §5.1 (at-rest crypto), §6 (authn), §7 (authz)
- tundra-test-plan-v1.md               §2 (pyramid), §5 (harness internals), §6 (coverage targets), §7 (CI gates)
- tundra-frontend-ui-spec-v1.md        §1 (overview), §2 (design tokens), §3 (component patterns), §4 (auth flows), §5 (route map for the auth + dashboard surfaces)
- tundra-brand-guidelines-v1.md        all (apply tokens to the panel)

Output the doc-read confirmation block (same shape as P0 §1) and STOP. Wait for `proceed`.

# 2. After `proceed`, implement in order:

## 2.1 Crypto crate (tundrad-crypto)

Per tundra-security-audit-v1.md §4.2 and §5.1:
- 64-byte master key file format (32 bytes key + 32 bytes BLAKE3 trailer); load function verifies trailer, refuses on mismatch
- HKDF-SHA256 derivation per column-family info string ("tundra:v1:identity:totp_secret", etc.)
- AES-256-GCM seal/open API with 96-bit random nonces
- `EncryptedField<T>` SQLx custom type (see tundra-database-schema-v1.md §9): canonical-JSON serialise → AEAD seal with version byte + nonce + ct + tag
- `KeyRing` singleton, loaded once at startup, zeroized on shutdown via `zeroize` crate
- Argon2id password hash/verify wrappers with the parameters from the security audit (m=64MiB, t=3, p=1; v=0x13)

Tests: AEAD round-trip, AAD mismatch fails, truncated ciphertext fails, key trailer verification, Argon2id round-trip with parameter recording in hash prefix.

## 2.2 Database schema migrations (Identity & Access + Internal)

Migration files in `migrations/` per tundra-database-schema-v1.md §8 conventions (timestamp_verb_noun.sql, up-only):

- `<ts>_create_extensions.sql` — uuid-ossp, pgcrypto, btree_gin, pg_trgm, citext
- `<ts>_create_set_updated_at_function.sql` — generic trigger function
- `<ts>_create_operators.sql` — full DDL from §3.1.1
- `<ts>_create_sessions.sql` — §3.1.2
- `<ts>_create_passkeys.sql` — §3.1.3
- `<ts>_create_roles_permissions.sql` — §3.1.4 quad
- `<ts>_create_audit_log.sql` — §3.1.5 plus the chain-hash trigger from tundra-security-audit-v1.md §4.5
- `<ts>_create_jobs.sql` — §3.13
- `<ts>_create_locks.sql` — §3.13
- `<ts>_create_settings.sql` — §3.13
- `<ts>_seed_system_roles.sql` — `Owner`, `Admin`, `Operator`, `Read-only` with their permission sets

Run `sqlx migrate run` against a Postgres 18 container; verify all migrations apply cleanly. Capture a database dump in `db/seed/test.sql` for the test harness.

## 2.3 Repo crate (tundrad-repo)

Per tundra-database-schema-v1.md and tundra-api-specification-v1.md §1:
- SQLx pool initialization with the connection string from `tundrad-config`
- One repository module per table family in this phase: `operators`, `sessions`, `passkeys`, `roles`, `audit_log`
- Soft-delete wrapper `Soft<T>` that injects `WHERE deleted_at IS NULL`; explicit `.with_deleted()` to bypass
- Transactional helpers; `audit_log` writes share the transaction with the action that produced them

Tests with `sqlx::test`: every repository method, every soft-delete-vs-hard-delete edge, every transactional invariant.

## 2.4 Auth crate (tundrad-auth)

Per tundra-security-audit-v1.md §6:
- Argon2id password set + verify with HIBP k-anonymity check (download API stub for tests)
- TOTP secret generate / verify; recovery code generate (10 × 16-hex)
- WebAuthn via `webauthn-rs`: registration ceremony, assertion ceremony, counter-monotonicity check
- Session lifecycle: create, sliding-renew on activity, revoke, max-30-day absolute lifetime
- Step-up tracker: `last_full_auth_at`, `is_step_up_recent(secs)`
- API token mint (format `tnd_<env>_<base64url>`) + verify (SHA-256 hash compare)
- Authz service: `Action` enum exhaustive per tundra-security-audit-v1.md §7.2, `Resource` enum, `require(actor, action, resource)`, scope-bounded grants

Tests: per-action authz matrix (unauth 401, wrong-scope 403, right-scope 2xx); session expiry; step-up enforcement; token round-trip with prefix masking.

## 2.5 API skeleton (tundrad-api)

Per tundra-api-specification-v1.md §2.1 and §1.4 (error envelope):
- Axum router mounted under `/api/v1`
- `/api/v1/healthz`, `/api/v1/readyz`
- `/api/v1/auth/*` — login (password + TOTP), passkey-register, passkey-verify, refresh, logout
- `/api/v1/operators` — list, get, invite (creates row, sends email stub), update, delete (soft)
- `/api/v1/operators/me/tokens` — list, create, revoke
- `/api/v1/audit-log` — list with filters from §2.5

Every handler:
- Resolves the principal (operator or token)
- Calls `authz.require(...)`
- Validates the request (Zod-equivalent: `validator` or `garde`)
- Writes the audit row in the same transaction as the action
- Returns the standard envelope from §1.4

Idempotency-Key handling per §1.3 (Valkey-backed; placeholder in-memory store for this phase, swap in Valkey in P2).

## 2.6 Config + Telemetry crates

`tundrad-config`: figment-based loader; layers TOML > env > defaults. The schema mirrors `tundrad.toml` from tundra-deployment-runbook-v1.md §2.6.

`tundrad-telemetry`: tracing-subscriber with JSON formatter for production, pretty for dev. Honours `RUST_LOG`. OTLP exporter behind a feature flag (off by default).

## 2.7 Bin crate (tundrad-bin)

Subcommands: `serve`, `migrate`, `migrate --plan`, `health`, `master-key {generate,verify,rotate --resume}`. Per tundra-deployment-runbook-v1.md §2.8 + §4.

`serve` wires:
- Config load
- KeyRing load + verify (refuse to start on master-key trailer mismatch)
- DB pool + run pending migrations (gated by `--migrate-on-start` config flag; default off in production)
- Axum router from tundrad-api
- systemd-notify "READY=1" for Type=notify (per tundra-deployment-runbook-v1.md §2.7)
- Graceful shutdown on SIGTERM (drain in-flight requests, configurable timeout)

## 2.8 Panel UI shell

Per tundra-frontend-ui-spec-v1.md:
- `pnpm create vite` baseline already exists from P0; flesh it out
- Tailwind 4 configured with the design tokens from tundra-brand-guidelines-v1.md
- TanStack Router v1 with the route tree for: `/`, `/login`, `/setup`, `/dashboard`, `/operators`, `/operators/me/tokens`, `/audit`
- TanStack Query for data fetching; central client in `panel/src/lib/api.ts` consuming the OpenAPI types
- Zustand store for session state (`useAuthStore`)
- shadcn/ui components installed via `pnpm dlx shadcn@latest add` for: button, card, dialog, dropdown, input, form, table, badge, toast, sonner
- Pages for all routes above; the dashboard shows the four-tile layout from tundra-deployment-overview-v1.md §2.1 (servers, sites, deploys today, alerts) — values stubbed at zero for this phase
- `/setup` wizard (per tundra-deployment-overview-v1.md §2.1 and tundra-frontend-ui-spec-v1.md §4): operator-name, email, password (with HIBP check feedback), optional TOTP, optional passkey
- `/login` with password + TOTP + passkey flow

Accessibility: all interactive elements have accessible names; axe-core test passes on every route in this phase.

## 2.9 Integration tests

In `crates/tundrad/tests/`:
- `auth_password_flow.rs` — register operator, sign in with right + wrong credentials, session created/revoked
- `auth_passkey_flow.rs` — registration ceremony, assertion ceremony, counter rejection on stale value
- `audit_chain.rs` — chain hash continuity across multiple writes; tampered row breaks verification
- `authz_matrix.rs` — auto-generated test that asserts every route declares a required action and exercises unauth/wrong-scope/right-scope per route
- `operators_invite.rs` — invite flow end-to-end including the invitation token TTL
- `tokens_lifecycle.rs` — create, use, revoke, rotation behaviour

## 2.10 Unit tests on top of the above

Coverage targets per tundra-test-plan-v1.md §6:
- tundra-crypto: 95% line, 90% branch
- tundrad-auth: 95%, 95%
- audit chain hashing: 95%, 90%
- repositories: 85%, 75%

## 2.11 Commits

Commits, in order:
1. `feat(crypto): tundrad-crypto crate with EncryptedField<T>, KeyRing, Argon2id`
2. `feat(db): identity & access + internal schema migrations`
3. `feat(repo): tundrad-repo with operators, sessions, passkeys, audit_log, jobs`
4. `feat(auth): tundrad-auth with sessions, tokens, passkeys, RBAC`
5. `feat(api): tundrad-api skeleton with /auth, /operators, /audit-log`
6. `feat(config): tundrad-config + tundrad-telemetry`
7. `feat(bin): tundrad-bin with serve/migrate/master-key subcommands`
8. `feat(panel): UI shell with auth, setup, dashboard, operators, audit pages`
9. `test: integration tests for auth, audit chain, authz matrix, tokens`
10. `chore(release): v0.1.0 — Foundation (M0)`

# 3. Exit criteria for P1

- [ ] All migrations apply cleanly to a fresh PG18 instance
- [ ] `cargo build --workspace --release` succeeds; binaries produced at expected paths
- [ ] `cargo test --workspace` passes; integration tests use sqlx::test against a containerised PG
- [ ] `cargo clippy --workspace --all-targets -- -D warnings` passes
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all pass in `panel/`
- [ ] Coverage targets from §2.10 met (verified with `cargo llvm-cov` and `vitest --coverage`)
- [ ] Manual smoke: `cargo run --bin tundrad -- migrate && cargo run --bin tundrad -- serve`, then `pnpm dev` in `panel/`, navigate to `/setup`, complete the wizard, sign out, sign back in via password+TOTP, then via passkey
- [ ] Audit log shows entries for: operator created, login success, session refreshed, logout
- [ ] M0 milestone definition met: operator can log in, see dashboard, manually add a server placeholder (the placeholder UI exists; the actual server-add agent flow lands in P2)

When all boxes are checked, output a phase summary and stop. Then run PV before P2.
```

---

# P2 — Single-host MVP

> M1 — First Site Live. A real Laravel site deployed via Git push, with TLS, on a fresh Vultr VPS, in under 5 minutes.
> Implements: tundra-agent base, server provisioning, site creation (PHP/Laravel), Nginx + PHP-FPM rendering, ACME, deploy from Git, env vars.

```text
This is **prompt P2** — Single-host MVP. P1 is complete and on `main`.

# 1. Doc-read gate

Re-read:
- tundra-database-schema-v1.md         §3.2 (Servers), §3.3 (Sites), §3.10 (Certificates)
- tundra-api-specification-v1.md       §2.1 (resource map), §2.2–§2.4 (representative endpoints), §3 (gRPC service map), §4 (WebSocket)
- tundra-deployment-runbook-v1.md      §3.1 (UDS path), §5 (agent credentials)
- tundra-security-audit-v1.md          §4.3 (agent fleet), §6.4 (workload data on managed servers)
- tundra-plugin-architecture-plan-v1.md §1–§4 (the agent's provider interface is in this style)
- tundra-test-plan-v1.md               §5.1 (Rust integration harness internals — including the in-memory tower channel for in-process agent runs)
- tundra-frontend-ui-spec-v1.md        §6 (servers + sites pages), §7 (site-create wizard)

Output the doc-read confirmation and STOP. Wait for `proceed`.

# 2. After `proceed`:

## 2.1 Proto + gRPC scaffold

`proto/tundra/agent/v1/agent.proto` — full message + service definitions per tundra-api-specification-v1.md §3.1 (Heartbeat, ApplyServerConfig, ManageService, ProvisionSite, DeploySite with progress stream, StreamMetrics, StreamLogs). Wire-format-stable proto3 with explicit `optional` and reserved field-number ranges per §3.5.

`tundra-proto` crate generates Rust bindings via prost + tonic at build time.

## 2.2 Agent CA

In `tundrad-auth` (or a new `tundrad-pki` crate, your call): internal CA bootstrap on first start. CA root key + cert in `/var/lib/tundra/ca/`. Per tundra-security-audit-v1.md §4.3:
- CA validity 5 years
- Agent client cert validity 90 days
- Agent SAN: `URI:tundra-agent://server-<uuid>`
- Auto-renewal at 30 days remaining via gRPC `Heartbeat` carrying CSR

Tests: cert issuance, SAN matching, renewal flow, revocation.

## 2.3 Agent crates

Per tundra-technical-implementation-plan-v3.md §5.2:
- `tundra-agent-bin` — entry; argument parsing; loads agent config; mTLS client
- `tundra-agent-rpc` — tonic gRPC client wrapping the bidirectional channels (Heartbeat outgoing; ApplyServerConfig + DeploySite incoming as streams)
- `tundra-agent-reconciler` — `Provider` trait, reconciliation loop, idempotent observe→reconcile→destroy
- `tundra-agent-providers` — initial set: `pkg` (apt + dnf), `nginx`, `php-fpm`, `systemd` (unit file generation, dbus interaction)
- `tundra-agent-metrics` — sysinfo-based collector; ships samples to control plane via StreamMetrics
- `tundra-agent-logs` — journalctl tail / file tail, pushes to control plane via StreamLogs

The `Provider` trait verbatim from tundra-technical-implementation-plan-v3.md §5.2:
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

Each provider has a unit-test file with mocked subprocess calls. The nginx provider shells to `nginx -t` for config validation.

## 2.4 Server enrolment

Per tundra-database-schema-v1.md §3.2 + tundra-api-specification-v1.md §2:
- New migrations for `servers`, `agent_credentials`, `services`, `packages`, `firewall_rules`
- REST endpoints: `POST /api/v1/servers` (creates row + setup token), `GET/PATCH/DELETE /api/v1/servers/:id`, `GET /api/v1/servers/:id/services`
- Setup token: 32 bytes random, base64url, single-use, 24h TTL, SHA-256-hashed in DB; cleared on use
- Agent enrolment endpoint (gRPC): exchanges setup token for issued client cert
- Agent rotation endpoint (gRPC): renews cert via Heartbeat carrying CSR

Tests: enrolment with valid + expired + reused token; rotation flow; SAN-binding enforcement (rejects mismatched server_id).

## 2.5 Sites + Applications + Deployments

New migrations for §3.3 of the schema spec: `sites`, `applications`, `deployments`, `env_vars`, `scheduled_tasks`, `releases`, `site_aliases`, `site_health_checks`.

REST endpoints from tundra-api-specification-v1.md §2.1, hot-path endpoints implemented to spec from §2.2 (`POST /api/v1/sites` returning 201 with the queued deployment) and §2.4 (`POST /api/v1/sites/:id/deployments` returning 202).

Service layer: a `Sites` domain service in `tundrad-domain` that orchestrates create-site → first-deploy. Site creation kicks off an initial deploy automatically per the API spec.

## 2.6 Deploy pipeline

The `DeploySite` RPC implementation in the agent:
- Accepts `DeploySiteRequest` (per §3.2 of the API spec)
- Stages: fetch (git clone or tarball download) → build (per `build_command`) → assemble (releases dir + symlink swap) → health-check → promote
- Streams `DeploySiteProgress` (started, stage, log, finished | failed)
- Atomic: writes to `releases/<deployment_id>/`, swaps `current` symlink only after health-check passes
- Rolling 5 releases on disk; older ones pruned

Site URL handling: the nginx provider renders the per-site server block from tundra-technical-implementation-plan-v3.md Appendix A (PHP/Laravel) and reloads nginx after `nginx -t` validation.

## 2.7 ACME (tundrad-acme)

Per tundra-database-schema-v1.md §3.10:
- Migrations for `certificates`, `acme_accounts`
- HTTP-01 and DNS-01 challenges; HTTP-01 served via the agent's ACME path
- Auto-renewal at T-30 days; alert at T-14 if last attempt failed
- ACME account key encrypted under master-key-derived data key
- Background job (in `tundrad-jobs`) that scans certificates due for renewal nightly

Tests: `pebble` (Let's Encrypt's testing CA) integration test for HTTP-01 and DNS-01.

## 2.8 Live events (WebSocket)

Per tundra-api-specification-v1.md §4:
- WebSocket route `/ws/v1/events?token=...` upgraded inside Axum
- Subscription model: client sends `{ "subscribe": [...] }`; server gates by RBAC scope of the token
- Event catalog from §4.4: at minimum `welcome`, `subscribed`, `deploy.queued/started/stage/log/succeeded/failed`, `site.health.changed`, `server.metrics`, `server.status.changed`, `log.line`
- Reconnection with `?last_event_id=...`; replay window 5 minutes via Valkey

Valkey integration: deploy progress events pub/sub channel `tundra:events:deploys`; the WS gateway subscribes and forwards filtered events.

## 2.9 Job queue (tundrad-jobs)

Hybrid per tundra-database-schema-v1.md §3.13: simple jobs in Valkey (cache rebuild, notify), durable jobs in `jobs` table (deploys, ACME renewals). Workers run inside `tundrad-bin serve` as Tokio tasks; concurrency is per-job-kind configurable.

## 2.10 Panel UI — Servers + Sites surfaces

Per tundra-frontend-ui-spec-v1.md §6 + §7 + §12.3:
- `/servers` — list, card view, status badges, last-seen relative time
- `/servers/new` — five-step wizard from tundra-deployment-overview-v1.md §3.1
- `/servers/:id` — detail page with services, packages, firewall, agent cert state
- `/sites` — list with filters (server, app type, status)
- `/sites/new` — site creation wizard (Formik + Yup since it's a multi-step wizard, per UI spec stack)
- `/sites/:id` — detail page with the rich shape from API spec §2.3 (deployments tab, env vars tab, settings tab, logs tab, TLS tab)
- Live deploy view with WebSocket-driven log streaming and stage indicators

## 2.11 e2e tests

In `panel/e2e/`, Playwright specs:
- `setup-wizard.spec.ts` — owner setup end-to-end
- `add-server.spec.ts` — server enrolment flow (uses an in-process agent harness that simulates a managed host)
- `create-site.spec.ts` — site creation through wizard, deploy completes, live site responds
- `deploy-rollback.spec.ts` — deploy a deliberately broken release, observe rollback

Compose stack from `tundra-docker/e2e/docker-compose.yml` is the test environment.

## 2.12 Commits

1. `feat(proto): tundra.agent.v1 service definitions`
2. `feat(pki): internal CA + agent client cert lifecycle`
3. `feat(agent): tundra-agent crates with reconciler + nginx/php-fpm/systemd providers`
4. `feat(servers): server enrolment + service inventory + firewall rules`
5. `feat(sites): site + application + deployment domain + REST surface`
6. `feat(deploy): atomic deploy pipeline with rollback on health-check failure`
7. `feat(acme): TLS issuance + auto-renewal via instant-acme + pebble integration tests`
8. `feat(events): WebSocket gateway + Valkey pub/sub for deploy + metric events`
9. `feat(jobs): durable job queue for deploys, renewals, backups`
10. `feat(panel): servers + sites pages + add-server wizard + create-site wizard + live deploy view`
11. `test(e2e): playwright specs for setup, add-server, create-site, deploy-rollback`
12. `chore(release): v0.2.0 — Single-host MVP (M1)`

# 3. Exit criteria for P2

- [ ] All P1 tests still pass; no regressions
- [ ] New unit + integration tests pass with the coverage targets met
- [ ] Playwright e2e suite passes against the docker-compose stack
- [ ] Manual smoke: spin up a fresh Vultr VPS (or Hetzner equivalent), run the install one-liner from tundra-deployment-overview-v1.md §2, complete owner setup, add the same VPS as a managed server (single-host mode), create a Laravel site pointing at a real Git repo, hit the URL over HTTPS, see the app
- [ ] Total time from `tundra server add` to publicly accessible HTTPS site under 5 minutes (the M1 definition of done)

Phase summary, then run PV before P3.

---

# P3 — Databases & Backups

> M2 — Database Self-Sufficiency. Create PG18 + MySQL 8.4, run a Laravel migration through the panel, take and restore a backup.
> Implements: PostgreSQL/MySQL/MariaDB/Valkey provisioning, db + user + grant management, query console, Restic-based backups, restore.

```text
This is **prompt P3** — Databases & Backups. P2 is complete and on `main`.

# 1. Doc-read gate

Re-read:
- tundra-database-schema-v1.md   §3.5 (Databases), §3.7 (Backups), §6 (the schema-anchor section)
- tundra-api-specification-v1.md §2.1 (database + backup resource map; representative endpoints)
- tundra-deployment-runbook-v1.md §7 (self-backup anatomy + manual restore)
- tundra-deployment-overview-v1.md §6 (operator-facing self-backup), §7 (restore)
- tundra-security-audit-v1.md    §5 (cryptographic design — backups encrypted under master-key-derived key + GPG public-key recipient layer)
- tundra-test-plan-v1.md         §5.4 (e2e harness — backup/restore flows)
- tundra-frontend-ui-spec-v1.md  §8 (databases pages), §9 (backups pages)

Confirmation block, then STOP. Wait for `proceed`.

# 2. After `proceed`:

## 2.1 Database engine providers

In `tundra-agent-providers`:
- `postgres` — cluster init, role/db creation with privilege grants, `pg_dump`/`pg_basebackup` shells, WAL archiving config, performance-tuning profile (Small/Medium/Large/Custom)
- `mysql` — equivalent for MySQL 8.4 LTS
- `mariadb` — equivalent for MariaDB 11.4 LTS
- `valkey` — instance creation (per host)

Each provider implements the `Provider` trait. Each manages a per-engine running daemon as a systemd unit; data directories under `/srv/dbs/<engine>/<instance>/`.

## 2.2 Database domain + REST + agent RPC

New migrations for `database_servers`, `databases`, `db_users`, `db_grants` per tundra-database-schema-v1.md §3.5.

REST per tundra-api-specification-v1.md §2.1:
- `/api/v1/database-servers` — list, create, update, delete
- `/api/v1/databases` — list, create (auto-generates random password for app user), delete
- `/api/v1/db-users` — list, create, update, action: grant/revoke
- Connection-string generation endpoint that returns `postgres://user:pass@host:port/db` with the password decrypted on demand and step-up-required for the action

Agent RPCs from `proto/tundra/agent/v1/agent.proto`: `CreateDatabase`, `CreateDbUser`, `GrantPrivileges`. Implementation calls the engine providers.

## 2.3 Query console (read-only by default)

Panel UI page `/databases/:id/console`:
- shadcn/ui dialog hosting a CodeMirror editor (TanStack Query for results)
- Read-only by default (only `SELECT`, `EXPLAIN`, `SHOW`); write toggle requires step-up
- Query timeout (configurable, default 30s); result-row cap (configurable, default 1000)
- Audit row per query (action `database.query.executed`)

## 2.4 Backup module (tundrad-jobs + new tundrad-backup crate)

New migrations for `backup_targets`, `backup_jobs`, `backup_snapshots`, `backup_restores`, `backup_locks` per tundra-database-schema-v1.md §3.7.

REST per tundra-api-specification-v1.md §2.1:
- `/api/v1/backups/targets` — list, get, create, update, delete, action: test
- `/api/v1/backups/jobs` — list, get, create, update, delete, action: run-now
- `/api/v1/backups/snapshots` — list, get, action: restore (with the preview-then-confirm two-step from API spec §2.4 mechanics)

Restic integration:
- Restic repository init per backup_target
- Per-job: `restic backup` of the scoped resource (site files + DB dump), with retention policy applied via `restic forget --prune`
- Verification job (5% sample) weekly via scheduled job
- Off-site replication: a second target marked as a replica, mirrored after primary success

Encryption layering per tundra-security-audit-v1.md §5.1:
- Restic's own AES-256-CTR-Poly1305 with a random per-repository password
- That password encrypted under master-key-derived data key (column-family `tundra:v1:backup_target:repo_password`)
- Optional outer GPG-public-key recipient encryption configured per target

Tests: backup/restore round-trip on a small Postgres dump; verification flagging an artificially-corrupted snapshot; off-site replication.

## 2.5 Self-backup tool

Per tundra-deployment-runbook-v1.md §7 + tundra-deployment-overview-v1.md §6:
- `tundra-self-backup` binary (already exists from P0; flesh it out): pg_dump custom-format, tar of `/var/lib/tundra/data/`, manifest.json, checksums.txt, GPG-encrypt to operator's recipient key, upload to configured target
- `tundra-restore` binary: decrypt, verify checksums, drop+create `tundra` DB, pg_restore, restore data dir, verify-master-key, start tundrad
- systemd timer unit `tundra-self-backup.timer` template

Tests: full round-trip on a populated test DB; partial-failure handling (target unreachable mid-upload).

## 2.6 Panel UI — Databases + Backups surfaces

- `/databases` — list across all servers; filter by engine, server
- `/database-servers/:id` — engine config, active instances, performance metrics
- `/databases/:id` — detail with size trend, connections, query console launcher
- `/backups/targets` — list, create wizard, test-target action
- `/backups/jobs` — list with last-run badge; create wizard scoped to a resource
- `/backups/snapshots` — list with size, dedup ratio, restore action (opens preview-then-confirm dialog)
- `/settings/self-backup` — operator-facing self-backup configuration page from tundra-deployment-overview-v1.md §6

## 2.7 e2e tests

Playwright:
- `create-database.spec.ts` — create PG instance, create DB, create user, grant, connect from a test container, query
- `backup-roundtrip.spec.ts` — create site (P2 fixture), populate, take backup, observe verified status, restore to alternative location, content matches
- `self-backup.spec.ts` — configure self-backup target, run-now, verify-latest

## 2.8 Commits

1. `feat(agent): postgres/mysql/mariadb/valkey providers`
2. `feat(db): databases + db_users + grants schema + domain`
3. `feat(api): database-servers / databases / db-users REST surface`
4. `feat(panel): databases pages + read-only query console`
5. `feat(backups): backup_* schema + restic integration + retention`
6. `feat(api): backups REST surface with preview-then-confirm restore`
7. `feat(panel): backups pages + restore preview dialog`
8. `feat(self-backup): tundra-self-backup + tundra-restore tools`
9. `test(e2e): create-database, backup-roundtrip, self-backup specs`
10. `chore(release): v0.3.0 — Databases & Backups (M2)`

# 3. Exit criteria for P3

- [ ] All P1 + P2 tests still pass
- [ ] New unit + integration + e2e tests pass
- [ ] Manual smoke: through the panel, create a PG18 instance + a database + a db-user with full privileges, point a Laravel site at it, run `php artisan migrate`, see the schema appear in the query console; take a backup, observe verified status, restore to a fresh database, verify row counts match
- [ ] Self-backup runs successfully against an S3-compatible target; `tundra-restore` round-trips on a fresh VM

Phase summary, then PV before P4.
```

---

# P4 — Email & DNS

> M3 — Mail & DNS Live. Send and receive email on a Tundra-hosted domain with passing SPF, DKIM, DMARC; full DNS zone editing via UI.
> Implements: Postfix/Dovecot/Rspamd provisioning, mailbox management, webmail install, PowerDNS integration, zone editor, DNSSEC.

```text
This is **prompt P4** — Email & DNS. P3 is complete and on `main`.

# 1. Doc-read gate

Re-read:
- tundra-database-schema-v1.md   §3.4 (Domains), §3.6 (Mail)
- tundra-api-specification-v1.md §2.1 (domains + DNS records + mail resource map)
- tundra-deployment-runbook-v1.md §6 (mail troubleshooting context)
- tundra-security-audit-v1.md    §5.1 (DKIM private keys are encrypted columns)
- tundra-frontend-ui-spec-v1.md  §10 (domains + DNS pages), §11 (mail pages)

Confirmation, then STOP. Wait for `proceed`.

# 2. After `proceed`:

## 2.1 PowerDNS provider

`tundra-agent-providers/powerdns/`: zone management via PowerDNS API; record CRUD; SOA serial auto-increment on edit; DNSSEC key generation (NSEC3) per zone; glue-record management.

`tundra-agent-providers/unbound/` (optional, off by default): recursor for hosts that want one.

## 2.2 Domains + DNS schema + REST

New migrations from §3.4: `domains`, `dns_zones`, `dns_records`, `domain_registrations`, `ns_history`.

REST per the API spec §2.1:
- `/api/v1/domains` — list, get, create (register or import), update, delete
- `/api/v1/domains/:id/dns-records` — list, create, update, delete, batch-update (atomic write of multiple records)

Validation: per-record-type schemas (A = IPv4, AAAA = IPv6, MX with priority, SRV with full tuple, CAA with flags+tag+value).

Bulk import: BIND zone file parser; AXFR transfer client.

## 2.3 Mail providers

`tundra-agent-providers/postfix/`: main.cf + master.cf rendering; virtual-mailbox-domains, virtual-mailbox-maps, virtual-alias-maps from Tundra's DB via PostgreSQL lookup tables (Postfix's `pgsql:` map type); SASL via Dovecot.

`tundra-agent-providers/dovecot/`: 10-mail.conf, 10-auth.conf, auth-sql.conf.ext for Postgres-backed authentication; mailbox storage at `/srv/mail/<domain>/<local_part>/Maildir/`; quota plugin enabled.

`tundra-agent-providers/rspamd/`: greylisting, RBL checks, Bayesian, ARC sealing, DKIM signing keyed by Tundra's per-domain private keys.

`tundra-agent-providers/opendkim/` (optional, off by default — Rspamd handles DKIM by default): for operators who prefer it.

## 2.4 Mail schema + REST

New migrations from §3.6: `mail_domains`, `mailboxes`, `aliases`, `mail_queue`, `mail_log`, `dkim_keys`, `mail_bridges`.

REST:
- `/api/v1/mail/domains` — list, get, create (auto-generates DKIM keypair, encrypts private key under master-key-derived data key), delete, action: regenerate-dkim
- `/api/v1/mail/mailboxes` — list, get, create, update, delete, action: reset-password
- `/api/v1/mail/aliases` — list, create, update, delete
- `/api/v1/mail/queue` — list, action: hold/release/delete (Postfix postsuper integration)

DNS auto-publication: when a mail domain is added and Tundra also manages DNS for it, the SPF, DKIM, DMARC records are inserted into `dns_records` automatically and marked `is_managed = true`.

## 2.5 Webmail (Roundcube)

Optional webmail provisioning: when an operator enables webmail on a mail domain, the agent provisions Roundcube under `webmail.<domain>`, served by the existing nginx provider, with PG-backed Roundcube config.

## 2.6 Mail diagnostics

Panel UI page `/mail/domains/:id/diagnostics`:
- DNS lookups for A/AAAA, MX, SPF, DKIM, DMARC; pass/fail per record
- TLS check on the MX (port 25 + 587 + 465)
- DKIM validation against a self-sent test email
- Actions: "Send test email", "View DKIM record to publish"

## 2.7 Panel UI — Domains + Mail surfaces

- `/domains` — list with registration expiry, DNSSEC status, NS state
- `/domains/:id` — detail with DNS zone editor (the §10 spec)
- `/domains/:id/dns/edit` — full zone editor with validation, dry-run preview, syntax highlighting
- `/mail/domains` — list with deliverability status badges
- `/mail/domains/new` — create wizard; offers DNS records to publish if DNS is unmanaged
- `/mail/mailboxes` — list with quota usage bars; create dialog
- `/mail/queue` — live queue inspection, Postfix-action buttons
- `/mail/domains/:id/diagnostics` — the diagnostics page above

## 2.8 e2e tests

Playwright:
- `dns-zone-edit.spec.ts` — add a domain, edit zone, validate DNS responds
- `mail-domain-setup.spec.ts` — add mail domain, observe DNS records auto-published, send test email through the diagnostics action, verify SPF/DKIM/DMARC pass at receiving side (use a `mailpit` container as the receiver)

## 2.9 Commits

1. `feat(agent): powerdns + unbound providers`
2. `feat(domains): domain + dns schema + zone editor REST surface`
3. `feat(panel): domains + DNS zone editor pages`
4. `feat(agent): postfix + dovecot + rspamd providers with PG-backed lookup`
5. `feat(mail): mail schema + DKIM keypair generation + REST surface`
6. `feat(panel): mail domains/mailboxes/queue pages + diagnostics`
7. `feat(agent): roundcube webmail provisioning (opt-in)`
8. `test(e2e): dns-zone-edit, mail-domain-setup specs`
9. `chore(release): v0.4.0 — Mail & DNS (M3)`

# 3. Exit criteria for P4

- [ ] All prior tests still pass
- [ ] Manual smoke: register a domain (or use one you control), point its NS at Tundra, edit the zone via the UI, confirm DNS resolves; add the domain as a mail domain, publish auto-suggested DNS records, create a mailbox, send mail to it from an external account (Gmail), receive it, see SPF/DKIM/DMARC pass; reply outbound, observe receiver shows pass results

Phase summary, then PV before P5.
```

---

# P5 — Multi-runtime

> M4 — All Runtimes Online. Node.js, Python, Go, Rust, Ruby apps each deployable via the panel.
> Implements: non-PHP application types, systemd template units, reverse proxy, blue/green for non-PHP.

```text
This is **prompt P5** — Multi-runtime. P4 is complete and on `main`.

# 1. Doc-read gate

Re-read:
- tundra-database-schema-v1.md   §3.3 (re-read; this phase exercises the application_type and runtime_version columns)
- tundra-api-specification-v1.md §2.1 + §2.2 (the create-site contract supports all kinds — implement the rest)
- tundra-technical-implementation-plan-v3.md §3.3 (managed runtimes), Appendix B (sample systemd unit for Node.js)
- tundra-frontend-ui-spec-v1.md  §7 (the create-site wizard's runtime-specific steps)

Confirmation, STOP, wait for `proceed`.

# 2. After `proceed`:

## 2.1 Runtime provisioner

`tundra-agent-providers/runtimes/`:
- `node` — install Node 20/22/24 via NodeSource; `nvm`-style coexistence at `/usr/local/tundra/runtimes/node-<major>/`
- `python` — Deadsnakes-installed 3.10/3.11/3.12/3.13; per-app venv at `<site>/shared/venv/`
- `go` — official tarballs; per-app build only (Go binaries are static; no runtime install needed beyond build)
- `rust` — `rustup`-managed; per-app build only
- `ruby` — `rbenv` + `ruby-build`; coexistent installs
- `dotnet` — Microsoft repo; coexistent SDKs

Each runtime has a `RuntimeProvider` impl that:
- ensures the requested major is installed
- knows how to stage a build (per-runtime build commands)
- emits a systemd unit per Appendix B of the implementation plan, parameterised on app type

## 2.2 systemd template units

Templates per Appendix B of the implementation plan:
- `tundra-app@<public_id>.service` — generic application unit with the security hardening from Appendix B verbatim
- `tundra-daemon@<public_id>-<daemon_id>.service` — per-daemon (queue worker, websocket consumer)
- `tundra-cron@<public_id>-<task_id>.service` + `.timer` — per scheduled task

The templates are rendered by the `systemd` provider. Each unit gets `Restart=on-failure`, `NoNewPrivileges=true`, `MemoryMax`, `CPUQuota`, `ReadWritePaths` per its scope.

## 2.3 Reverse-proxy upstream config

The `nginx` provider gains conditional rendering: for non-PHP apps, the server block uses `proxy_pass` to the app's listening port (`listen_port` column on `applications`). For PHP, the existing FastCGI server block from P2.

The agent reserves a free port from the ephemeral range when an application is created and stores it in `applications.listen_port`.

## 2.4 Blue/green for non-PHP

For Node/Python/Go/Rust/Ruby apps:
- Each deploy gets a new release directory and a new systemd unit instance with a freshly-allocated port (`tundra-app@<public_id>-blue.service`, `...green.service`)
- Old instance kept warm during health-check window; nginx upstream switched only after the new instance passes health checks; old instance stopped after a configurable grace period (default 30s)
- Rollback re-points nginx to the previous instance and restarts it

PHP apps continue to use the symlink-swap pattern from P2 (PHP-FPM picks up the new code without process restart).

## 2.5 Daemons (queue workers, websocket servers)

New migrations: `daemons` table per the implementation plan §4.9 (`daemon_id`, `application_id`, `command`, `working_dir`, `user`, `restart_policy`, `max_instances`).

REST: `/api/v1/applications/:id/daemons` — list, create, update, delete, action: restart/scale.

Panel UI: `/sites/:id/daemons` tab on the site detail page.

## 2.6 Scheduled tasks

New migrations: `scheduled_tasks` per §3.3 (already partially in place from P2; now exercised). REST: `/api/v1/sites/:id/scheduled-tasks` — list, create, update, delete, action: run-now.

For Laravel apps: auto-register `php artisan schedule:run` every minute when the application kind is `laravel`.

Panel UI: `/sites/:id/scheduled-tasks` tab.

## 2.7 Templates (precursor to P7's full template support)

Wire up the **basic** template scaffold for `Static (Hugo)`, `Next.js`, `Django`, `FastAPI`, `Rails` so they can be created from the wizard. Full template gallery + auto-config + examples lands in P7.

## 2.8 e2e tests

Playwright:
- `nodejs-app-deploy.spec.ts` — Next.js site deploys, blue/green swap on second deploy
- `python-app-deploy.spec.ts` — FastAPI site deploys, gunicorn unit healthy
- `go-app-deploy.spec.ts` — Go binary deploys, single static binary, no runtime install needed
- `rust-app-deploy.spec.ts` — Rust binary deploys
- `daemon-restart.spec.ts` — define a Laravel queue worker daemon, deploy, scale to 2 instances
- `scheduled-task.spec.ts` — define a `php artisan command` schedule, observe runs

## 2.9 Commits

1. `feat(agent): runtime providers — node, python, go, rust, ruby, dotnet`
2. `feat(agent): systemd template units per Appendix B`
3. `feat(deploy): blue/green deploy pipeline for non-PHP runtimes`
4. `feat(daemons): daemons schema + REST + panel UI`
5. `feat(cron): scheduled tasks REST + panel UI; auto-register Laravel scheduler`
6. `feat(panel): runtime-specific steps in the create-site wizard`
7. `feat(templates): basic Static / Next.js / Django / FastAPI / Rails templates`
8. `test(e2e): per-runtime deploy specs + daemon + scheduled-task specs`
9. `chore(release): v0.5.0 — Multi-runtime (M4)`

# 3. Exit criteria for P5

- [ ] All prior tests still pass
- [ ] Manual smoke: deploy one of each runtime; observe blue/green swap on second deploy; define a daemon; define a scheduled task; verify the systemd units are exactly as Appendix B prescribes (security directives present)

Phase summary, then PV before P6.
```

---

# P6 — Multi-server

> M5 — Multi-Server. A control plane managing 3 nodes; deploy targeting a specific node works.
> Implements: mTLS gRPC channel for remote agents, control-plane mode, agent provisioning over SSH, server health, cross-server deploys.

```text
This is **prompt P6** — Multi-server. P5 is complete and on `main`.

# 1. Doc-read gate

Re-read:
- tundra-deployment-runbook-v1.md  §5 (agent credentials), §8 (cross-server site migration)
- tundra-deployment-overview-v1.md §3 (operator-facing add-server flow), §6 ("when something goes wrong" for multi-host)
- tundra-security-audit-v1.md      §4.3 (agent fleet), §9.2 (agent-compromise attack tree)
- tundra-api-specification-v1.md   §3.5 (gRPC backwards compatibility)
- tundra-test-plan-v1.md           §5.4 (multi-server profile in the e2e stack)

Confirmation, STOP, wait for `proceed`.

# 2. After `proceed`:

## 2.1 SSH-based agent installer

`tundrad` gains the server-add wizard's terminal-side flow:
- Operator pastes an `ssh user@host` command into the wizard
- `tundrad` opens an SSH connection (using the operator's SSH key configured in profile, or a paste-on-demand key)
- Confirms the host key fingerprint with the operator (UI step)
- Uploads the agent installer (signed binary + bootstrap script)
- Runs the installer; agent connects back to the control plane over mTLS gRPC; first `Heartbeat` exchanges the setup token for the issued client cert

Tests: SSH-based add (against a Docker container that simulates a fresh Ubuntu host); fingerprint mismatch refusal.

## 2.2 Multi-server scheduling

The `Sites` domain service from P2 — extended:
- Site creation accepts `server_id` (which agent to provision on)
- Cross-server constraints: a site's primary database can be on a *different* server than the site itself (e.g., DB on `pg-1`, app on `app-1`)
- Per-server resource pressure tracked in `server_metrics_state`; the wizard suggests a server per resource fit but the operator chooses

## 2.3 Cross-server site migration

Implement `tundra site move <site> --to-server <server>` per tundra-deployment-runbook-v1.md §8:
- Acquire site lock
- Sync release artifacts from A → B
- For applications with a database: pg_dump on A's DB host, restore on B's
- Update `sites.server_id` in a transaction
- Issue new TLS cert on B if needed (or move the existing one if cert is portable)
- Update DNS A/AAAA if Tundra manages DNS for the domain
- Health-check on B; if pass, retire release on A; if fail, abandon B and release lock

REST: `POST /api/v1/sites/:id/actions/move`. WebSocket events: `site.move.started/stage/succeeded/failed`.

## 2.4 Per-agent rate limiting + circuit breaker

Per tundra-security-audit-v1.md §4.3:
- Per-agent rate limit (100 RPS heartbeat, 10 RPS for other RPCs)
- Sustained breach opens circuit, sets `agent_credentials.suspended_at`; agent must be re-enrolled
- Recovery: operator action in the panel re-issues credentials and re-enrols

## 2.5 Operator-friendly multi-server views

Panel UI:
- `/servers` page: now shows region grouping, capability summary per server, fleet health rolled up
- Site detail page now shows the server explicitly with a "Move to server…" action
- `/servers/:id/maintenance` — schedule maintenance windows; sites on the server show a notice

## 2.6 e2e — multi-server

Update `tundra-docker/e2e/docker-compose.yml` to include `agent-2` under the `multi-server` profile (it's already prepared from the docker bundle). Playwright spec:
- `multi-server-deploy.spec.ts` — enrol two agents, create a site explicitly targeted at agent-2, verify deploy lands on agent-2 only
- `cross-server-move.spec.ts` — create site on agent-1, move to agent-2, verify

## 2.7 Commits

1. `feat(servers): SSH-based agent install over fingerprint-confirmed connection`
2. `feat(scheduling): cross-server site placement + DB-on-different-host scheduling`
3. `feat(migration): cross-server site move with atomic switch`
4. `feat(security): per-agent rate limiting + circuit breaker`
5. `feat(panel): multi-server views + maintenance windows`
6. `test(e2e): multi-server-deploy and cross-server-move specs`
7. `chore(release): v0.6.0 — Multi-server (M5)`

# 3. Exit criteria for P6

- [ ] All prior tests still pass
- [ ] Manual smoke: stand up three managed VPSes, enrol them, create one site per server, deploy each, verify the right server gets the deploy each time; move a site from one server to another and verify zero-downtime cutover

Phase summary, then PV before P7.
```

---

# P7 — Templates & Plugins (incl. MCP)

> M6 — Plugins & Templates. One-click templates working end-to-end; Wasm plugin host MVP loaded and exercised.
> Implements: full template gallery + Docker provider + monitoring/alerting + Wasm plugin host + MCP server + Namecheap + GitHub plugins.

```text
This is **prompt P7** — Templates & Plugins. P6 is complete and on `main`.
This is the largest phase. Take it in sub-passes.

# 1. Doc-read gate

Re-read (full coverage):
- tundra-plugin-architecture-plan-v1.md      ALL (the Wasm sandbox is the central deliverable)
- tundra-additional-core-plugins-v1.md       §2 (Namecheap), §3 (GitHub) — §4 deferred to MCP docs
- tundra-mcp-server-spec-v1.md               ALL (the engineering reference for the MCP plugin)
- tundra-mcp-server-operator-v1.md           §2–§7 (operator framing)
- tundra-mcp-server-cookbook-v1.md           §2 (Claude Desktop), §3 (Claude Code), §4 (Cursor), §5 (Zed), §6 (HTTP transport)
- tundra-database-schema-v1.md               §3.8 (Plugins), §3.11 (Real-Time)
- tundra-frontend-ui-spec-v1.md              §13 (plugins page), §14 (templates gallery), §15 (alerts/metrics pages)
- tundra-api-specification-v1.md             §6 (Plugin API reference), §5 (MCP reference)

Confirmation, STOP, wait for `proceed`.

# 2. After `proceed`, work in five sub-passes. Each sub-pass is its own commit cluster; commit between sub-passes.

## Sub-pass A — Wasm plugin host

Per tundra-plugin-architecture-plan-v1.md:

- New crate `tundrad-plugin-host` (already scaffolded in P0; flesh it out).
- Wasmtime engine with epoch interruption every 100ms, per-instance fuel limit (default 10M), memory limit (default 128 MiB).
- WIT contracts: capability-typed host interface (db-read, kv, http-outbound, fs, secrets, events, jobs, locks).
- Plugin manifest parser (TOML); manifest signing verification (Tundra release public key for core plugins; sideload-warning UI for unsigned).
- Plugin lifecycle: install → enable → disable → uninstall; states stored in `plugins` table per §3.8.
- Capability grant/revoke flow stored in `plugin_capabilities`.

New migrations from §3.8: `plugins`, `plugin_capabilities`, `plugin_settings`, `plugin_jobs`, `plugin_events`, `plugin_kv`, `plugin_registry_entries`, `plugin_data_quotas`.

Test fixtures in `crates/tundrad-plugin-host/testdata/`: tiny Wasm plugins (`echo`, `loop`, `bigalloc`, `slowsleep`) per tundra-test-plan-v1.md §8.2. Build via `build.rs`; checked-in `dist/` artefacts with `SHA256SUMS`.

Tests:
- Plugin without a capability cannot call the host function gated by it (returns CapabilityDenied)
- Fuel-exhaustion plugin is interrupted at the fuel ceiling
- Memory-exhaustion plugin gets OOM at the limit
- Slow-sleep plugin is interrupted by epoch deadline
- Plugin signature verification: rejects altered manifest

Commits A:
1. `feat(plugin-host): tundrad-plugin-host with Wasmtime engine + capability checks`
2. `feat(plugin-schema): plugins/capabilities/settings/jobs/events/kv migrations`
3. `feat(plugin-lifecycle): install/enable/disable + REST surface`
4. `test(plugin-host): sandbox harness + fuel/memory/epoch tests`

## Sub-pass B — MCP server plugin

Per tundra-mcp-server-spec-v1.md:

- New crate `tundrad-plugin-mcp` (the MCP server is `kind = "native"` per spec §2.1; embedded in tundrad).
- Code layout from §3.3.
- Both transports (Streamable HTTP + stdio).
- Scope/mode resolver per §5.3.
- Initialize handshake per §6 with `protocolVersion = "2025-03-26"`.
- Tool catalog from §7 (read tools through admin tools); JSON Schemas auto-generated from API DTOs via `schemars`.
- Resources catalog per §8; Prompts catalog per §9.
- Migrations for the plugin-owned schema in §11: `plugin_mcp_tokens`, `plugin_mcp_sessions`, `plugin_mcp_tool_invocations`.
- Audit emitter per §12 with redaction pipeline.
- CLI subcommands per §15.
- Operator UI page per §16 — `/settings/mcp`.

The stdio transport in `crates/tundra-cli/src/mcp/`: launches `tundra mcp serve --stdio [--readonly]` as a subprocess of the host AI agent; speaks JSON-RPC over stdin/stdout; relays to tundrad via the standard HTTPS API client. The `TUNDRA_API_TOKEN` env var carries the MCP token.

Tests:
- Transport round-trip (HTTP and stdio) for `initialize` → `tools/list` → `tools/call(list_servers)` → `shutdown`
- Scope ceiling: `mcp:read` token cannot see write tools advertised; `mcp:write` token in `read` mode also cannot
- Confirmation-token gate on destructive tools
- Audit row created per invocation; argument redaction applied
- Origin-header validation for HTTP transport rejects unlisted origins

Commits B:
1. `feat(plugin-mcp): tundrad-plugin-mcp scaffold with both transports`
2. `feat(mcp-tools): full tool catalog with JSON Schemas`
3. `feat(mcp-schema): plugin_mcp_* tables + audit pipeline`
4. `feat(mcp-cli): tundra mcp serve/tokens/sessions/audit subcommands`
5. `feat(mcp-ui): Settings → AI Agents (MCP) page`
6. `test(mcp): transport round-trips + scope matrix + confirmation flow`

## Sub-pass C — Namecheap + GitHub plugins

Per tundra-additional-core-plugins-v1.md §2 (Namecheap) and §3 (GitHub):

- Two more `kind = "native"` core plugins, alongside the MCP plugin, in `crates/tundrad-plugin-namecheap/` and `crates/tundrad-plugin-github/`.
- Each declares its capability manifest, contributes its CLI subcommand and UI page, and owns its plugin schema (`plugin_namecheap_*`, `plugin_github_*`).
- Namecheap: domain registration, renewal, NS update, DNS record sync.
- GitHub: GitHub App authentication (token scoping per §3.2), repository-list-and-deploy flow.

Tests: integration against a sandbox Namecheap account (or a recorded vcr cassette); GitHub App via the GitHub-published test fixtures.

Commits C:
1. `feat(plugin-namecheap): registrar integration with NS + renewal + DNS sync`
2. `feat(plugin-github): GitHub App auth + repo-driven deploy`

## Sub-pass D — Templates gallery

Per tundra-technical-implementation-plan-v3.md §4.10:

- Each built-in template is a versioned YAML manifest in `templates/` at the repo root
- The site-create wizard's first step pivots to "from template" vs "blank"
- Each template defines: source kind (skeleton tarball, git template, command sequence), default runtime version, post-create commands (e.g., `wp-cli core install` for WordPress, `php artisan key:generate` for Laravel)

Implement at minimum: WordPress, WooCommerce-ready WordPress, Laravel skeleton, Next.js, Django, Rails, Astro, SvelteKit, Strapi, Directus, Ghost, Hugo, plus the basics from P5.

Panel UI: `/templates` gallery; "Use this template" jumps into the create-site wizard prefilled.

Commits D:
1. `feat(templates): YAML manifest format + template runner`
2. `feat(templates): WordPress / Laravel / Next.js / Django / Rails / static templates`
3. `feat(panel): templates gallery + create-from-template wizard branch`

## Sub-pass E — Monitoring & Alerting

Per tundra-database-schema-v1.md §3.11–§3.12:
- Migrations: `metrics_samples` (partitioned monthly), `event_subscriptions`, `websocket_sessions`, `alert_rules`, `alert_deliveries`
- Per-server metrics ingestion (already streaming from agent in P2; now persisted to `metrics_samples`)
- Alert rule evaluator (cron-style; runs every 30s); fires alerts; delivers via configured channels (email, Slack, Discord, Telegram, generic webhook, PagerDuty)
- Alert UI: `/alerts` (active + resolved); `/alerts/rules` (CRUD)
- Metrics charts on dashboard, server detail, site detail (Recharts)

Commits E:
1. `feat(metrics): metrics_samples partitioning + ingestion + retention`
2. `feat(alerts): alert rule evaluator + delivery channels`
3. `feat(panel): alerts page + metrics charts`
4. `chore(release): v0.7.0 — Templates & Plugins (M6)`

# 3. Exit criteria for P7

- [ ] All sub-passes' tests pass
- [ ] Plugin host: a Wasm plugin can be installed, granted capabilities, exercised, and revoked through the panel
- [ ] MCP: from a real Claude Desktop install, `tundra` configured as an MCP server returns the tool list and `list_sites` works end-to-end
- [ ] Templates: at least three templates (WordPress, Laravel, Next.js) provision cleanly with their post-create steps
- [ ] Alerts: a deliberately-tripped condition (CPU > 90% for 5min) fires an email alert
- [ ] M6 milestone: one-click WP, Laravel, Next.js, Django, Rails — all work end-to-end; at least one Wasm plugin loaded and exercised; the MCP plugin demoed against Claude Desktop

Phase summary, then PV before P8.
```

---

# P8 — Hardening & Beta

> M7 — Beta. Self-installable from a single command on a fresh Ubuntu 24.04 server; the operator acceptance checklist passes end-to-end.

```text
This is **prompt P8** — Hardening & Beta. P7 is complete and on `main`.

# 1. Doc-read gate

Re-read:
- tundra-security-audit-v1.md          ALL (this is the phase that closes every gap in §11)
- tundra-deployment-runbook-v1.md      ALL (engineering install must be airtight)
- tundra-deployment-overview-v1.md     ALL (operator install must be airtight)
- tundra-acceptance-checklist-v1.md    ALL (this is the gate)
- tundra-test-plan-v1.md               §9 (performance), §10 (security testing), §13 (smoke)

Confirmation, STOP, wait for `proceed`.

# 2. After `proceed`:

## 2.1 Installer (`installer/install.sh`)

The one-line installer per tundra-deployment-overview-v1.md §2 and tundra-deployment-runbook-v1.md §2.

- Detects OS (Ubuntu 24.04, Debian 12/13, RHEL 9/10)
- Adds the PostgreSQL official apt repo for PG18 if needed
- Installs prerequisites: postgresql-18, valkey-server, caddy, ca-certificates, curl, gnupg, jq
- Creates `tundra` system user, the `/var/lib/tundra/` tree with the right modes
- Generates the master key (32 random bytes + BLAKE3 trailer) at mode 0400
- Creates the `tundra` Postgres role + db with the random password
- Generates the internal CA + first JWKS
- Downloads the latest signed `tundrad`/`tundra-agent`/`tundra` binaries; verifies signature with `minisign`
- Installs to `/usr/local/bin/`
- Writes `/etc/tundra/tundrad.toml` (the canonical content from the runbook §2.6)
- Writes the systemd unit file from runbook §2.7 verbatim
- Runs `tundrad migrate`
- Starts `tundrad`
- Configures Caddy in front of it with the Caddyfile from runbook §2.9
- Prints the `/setup?token=...` URL for the operator

Tests: in CI, install runs cleanly on three OS images (Ubuntu 24.04, Debian 12, RHEL 9 via dnf-equivalent path).

## 2.2 Master-key + agent CA rotation tools

Per tundra-deployment-runbook-v1.md §4 + §5:
- `tundra master-key rotate [--resume]` — re-encrypts every encrypted column atomically, preserves both keys until verification, supports resumption on partial state
- `tundra agent cert {issue,rotate-ca}` — agent cert + CA rotation tools

Tests: rotate against a populated test DB; verify all encrypted columns decrypt under the new key; resume after simulated mid-rotation crash.

## 2.3 Step-up everywhere it should be

Audit every `mcp:admin` and "destructive" panel action; assert step-up enforcement. Add step-up middleware where missing.

## 2.4 Security hardening close-out

Address every item from tundra-security-audit-v1.md that's marked v1.0 and not yet done. Specifically:
- Confirm CSP headers per §6.3 are emitted on every panel route
- Confirm HSTS preload-eligible
- Confirm CSRF double-submit token on every state-changing panel route
- Confirm DNS rebinding protection on the MCP HTTP transport (already from P7; re-verify)
- Confirm the redaction pipeline scrubs all the right field names in every audit emitter

## 2.5 Performance test suite

Per tundra-test-plan-v1.md §9:
- Criterion benches in each crate's `benches/`
- k6 load tests in `tests/load/`:
  - Sustained 50 RPS on `POST /sites/:id/deployments`, p95 < 250ms
  - 100 RPS on `GET /audit-log` cursor-paginated, p95 < 150ms
  - 1000 concurrent WebSocket connections, message fan-out p95 < 100ms
  - 1000 concurrent agents at 10s heartbeat, RSS growth < 5% per 24h

Wire k6 jobs into `.github/workflows/nightly.yml`; results posted to a results bucket; regression > 25% fails the job.

## 2.6 Fuzzing harnesses

Per tundra-test-plan-v1.md §10:
- `cargo fuzz` targets for the agent gRPC handler dispatch and the audit canonicaliser
- Nightly 5-minute runs in CI; pre-tag 1-hour runs

## 2.7 Backup + restore drill (in CI)

Implement an automated drill: bring up a Tundra instance with seeded data, take a self-backup, tear down, restore from the backup on a fresh container, verify the seeded data is identically present and the master key decrypts encrypted columns. This is the M7 milestone's most critical assurance.

## 2.8 Acceptance-checklist automation

Translate the operator acceptance checklist (`tundra-acceptance-checklist-v1.md`) into an automated `tundra acceptance run` command that exercises:
- Post-install smoke (§3 of checklist)
- Identity & access (§4)
- Server enrolment (§5)
- Site provisioning (§6)
- Deploys (§7)
- Databases (§8)
- Mail (§9)
- Backups (§10)

Output: pass/fail report per section with timing.

## 2.9 Documentation polish

- README at the repo root: condensed, links to spec docs in `docs/specs/`
- `docs/getting-started.md`: derived from tundra-deployment-overview-v1.md
- `docs/security.md`: derived from tundra-security-overview-v1.md
- All TODOs and stubs from P0–P7 closed or filed as issues with milestones

## 2.10 Beta release tag

Final commit: `chore(release): v0.9.0-beta.1 — Beta (M7)`. Tag `v0.9.0-beta.1`. Release notes summarising the journey.

## 2.11 Commits

1. `feat(installer): one-line install script with OS detection + minisign verification`
2. `feat(rotation): master-key rotate + agent cert rotate-ca tools`
3. `feat(security): step-up enforcement audit + CSP/HSTS/CSRF close-out`
4. `feat(perf): criterion benches + k6 load tests + nightly job`
5. `feat(fuzz): cargo-fuzz targets for gRPC dispatch + audit canonicaliser`
6. `feat(drill): automated backup-restore drill in CI`
7. `feat(acceptance): tundra acceptance run command`
8. `docs: README + getting-started + security pages`
9. `chore(release): v0.9.0-beta.1 — Beta (M7)`

# 3. Exit criteria for P8

- [ ] All prior tests still pass
- [ ] All v1.0-targeted items from tundra-security-audit-v1.md §11 done
- [ ] `tundra acceptance run` passes on a freshly-installed beta instance
- [ ] Performance targets from tundra-technical-implementation-plan-v3.md §10 met by the k6 suite
- [ ] Self-installable from `curl ... | sudo bash` on Ubuntu 24.04 in under 5 minutes
- [ ] Beta announcement notes drafted

Phase summary, then PV before P9.
```

---

# P9 — General Availability

> M8 — v1.0 GA. Bug fixes from beta, public release, post-launch support.

```text
This is **prompt P9** — General Availability. P8 is complete and tagged `v0.9.0-beta.1`.

# 1. Doc-read gate

Re-read:
- tundra-acceptance-checklist-v1.md  §11 (the quarterly drill — must pass before GA)
- tundra-test-plan-v1.md             §13 (smoke against staging post-deploy)
- tundra-security-audit-v1.md        §11 (any v1.0 items still open)
- tundra-technical-implementation-plan-v3.md §10 + §11.2 (M8 definition of done)

Confirmation, STOP, wait for `proceed`.

# 2. After `proceed`:

## 2.1 Beta feedback triage

Process all issues filed against `v0.9.0-beta.1`. Triage into:
- Must-fix-for-GA — block on these
- Nice-to-have — defer to v1.1
- Won't-fix — close with explanation

For each must-fix: a short PR; conventional commit; release-note line.

## 2.2 Final security pass

External pen-test results (if booked per tundra-security-audit-v1.md §11) — implement remediations.

If no external pen-test: do an internal red-team session walking the §9 attack trees from the security audit; remediate any new findings.

## 2.3 Performance verification

Re-run the full k6 suite at GA scale (1000 concurrent agents, 100k sites in the seeded fleet, 7 days of metrics retention). Regressions vs. P8 baseline must be zero.

## 2.4 Drift verification

Run a contract test that replays every example request from `tundra-api-specification-v1.md` against a live `tundrad` and asserts response-schema conformance. Any drift is a GA-blocker.

## 2.5 Release engineering

- Reproducible builds (per tundra-security-audit-v1.md §11) — confirm SLSA Level 3 provenance is generated
- Release artefacts: `tundrad-1.0.0-linux-x86_64.tar.zst`, ARM64 equivalent, macOS Universal `tundra` CLI, Windows `tundra.exe`
- All artefacts signed with minisign + SLSA provenance
- Container images published to ghcr.io: `tundra/tundrad:1.0.0`, `tundra/tundra-agent:1.0.0`, `tundra/panel-ui:1.0.0`, `tundra/workload:1.0.0` per the docker bundle's Dockerfiles
- Release notes: short narrative + full changelog from `v0.0.1` to `v1.0.0`

## 2.6 Documentation final pass

- All 17 spec docs reviewed: any stale references updated, any "v1.0+" markers removed, any roadmap items now-shipped struck through
- `docs/specs/INDEX.md` written: a one-page guide to which doc to read for which question
- `docs/UPGRADING.md` for future v1.x → v2 transitions

## 2.7 Tag and announce

- `chore(release): v1.0.0 — General Availability (M8)`
- `git tag -s v1.0.0 -m "Tundra 1.0.0"`
- `git push origin main --tags`
- Trigger the release workflow: builds, signs, publishes images, creates GitHub release with the artefacts attached
- Publish the announcement (blog post / X thread / Hacker News post) — content drafted in P8, reviewed here

## 2.8 Post-launch posture

- 7-day monitoring window: subscribe to alerts on the public release; respond to issues fast
- v1.0.1 patch release planned for week 2 to absorb any first-day bugs

## 2.9 Commits

1. Per beta-feedback fix (one commit each, semver patches)
2. Per security-pass remediation
3. `test(contract): API spec replay against live tundrad`
4. `chore(release-engineering): SLSA provenance + ghcr.io image push`
5. `docs: final pass on all 17 spec docs; INDEX + UPGRADING`
6. `chore(release): v1.0.0 — General Availability (M8)`

# 3. Exit criteria for P9

- [ ] All P0–P8 tests still pass on `main`
- [ ] All beta-must-fix issues closed
- [ ] Performance regression tests vs. beta show zero regressions
- [ ] Contract test passes against the live API
- [ ] Reproducible build verified by an independent rebuild
- [ ] All release artefacts published, signed, with provenance
- [ ] Tag `v1.0.0` exists; GitHub release published; announcement posted
- [ ] Post-launch monitoring window armed

Phase summary, then PV one final time. After PV passes, the v1.0 line is live; subsequent work is v1.1 planning.
```

---

# PV — Verify (reusable after every phase)

> Run this after each phase, before advancing. Catches drift between the spec and the implementation, regressions, and the "passed locally but won't pass in CI" class of bug.

```text
This is **prompt PV** — Verify. Run me after every phase prompt completes, before advancing to the next phase.

# 1. State the phase under review

Tell me: which phase just completed (P0 through P9)? Which commit hash is at HEAD?

If you can't answer either, abort and re-run the phase prompt.

# 2. Build & test verification

Run all of these. Each must succeed; capture output.

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace --release
cargo test --workspace --release
cargo deny check
cargo audit
cd panel && pnpm install --frozen-lockfile
cd panel && pnpm typecheck
cd panel && pnpm lint
cd panel && pnpm test
cd panel && pnpm build
cd panel && pnpm playwright test --project=e2e
```

For phases ≥ P2, also bring up the e2e compose stack and run the integration suite there:

```bash
cd tundra-docker/e2e && ./scripts/test-helpers.sh full-cycle up
cd panel && pnpm playwright test --project=e2e
cd tundra-docker/e2e && ./scripts/test-helpers.sh full-cycle down
```

If anything fails: do not proceed. Report the failure verbatim, stop, wait for me.

# 3. Spec-conformance verification

For the phase under review, output a table of (spec section → implementation file → verification status) for every section the phase prompt cited. Example for P1:

| Spec section                                         | Implementation                           | Verified by                                              |
|------------------------------------------------------|------------------------------------------|----------------------------------------------------------|
| tundra-database-schema-v1.md §3.1.1 (operators)      | migrations/20260502_create_operators.sql | `sqlx migrate run` clean; `\d operators` matches DDL     |
| tundra-security-audit-v1.md §6.1 (sign-in flows)     | crates/tundrad-auth/src/signin.rs        | tests/auth_password_flow.rs + tests/auth_passkey_flow.rs |
| tundra-api-specification-v1.md §1.4 (error envelope) | crates/tundrad-api/src/error.rs          | tests/error_envelope.rs asserts the exact JSON shape     |
| ...                                                  |                                          |                                                          |

Any row marked unverified or partial is a phase-incomplete signal. Do not advance until every row is verified.

# 4. Drift detection

Diff between what the phase prompt promised (its §2 "implement these in order" + §3 exit criteria) and what's actually on `main`. Output:

- **Implemented exactly as promised:** <list>
- **Implemented but differs from spec:** <list with reason — was this intentional? Document the deviation in CHANGELOG and (if architectural) open an ADR>
- **Promised but not implemented:** <list — these block phase completion>
- **Implemented but not promised:** <list — verify these were necessary and add to CHANGELOG>

# 5. Coverage report

```bash
cargo llvm-cov --workspace --html
cd panel && pnpm vitest run --coverage
```

Compare against the targets from tundra-test-plan-v1.md §6:

| Surface              | Target line / branch | Actual | Pass? |
|----------------------|----------------------|--------|-------|
| tundra-crypto        | 95 / 90              | …      | …     |
| tundrad-auth         | 95 / 95              | …      | …     |
| tundrad-api handlers | 85 / 75              | …      | …     |
| panel components     | 80 / 70              | …      | …     |

If any row fails: not a phase-blocker by itself, but flag for next-phase attention.

# 6. CHANGELOG hygiene

Confirm:
- [ ] CHANGELOG has a section for this phase's release
- [ ] All commits in the phase are reflected
- [ ] Release notes for the version match what was actually shipped

# 7. Output

Output a verification report in this exact shape:

  ## PV — Verify — Phase <N>

  ### Build & test
  - cargo fmt:        PASS
  - cargo clippy:     PASS (0 warnings)
  - cargo build:      PASS
  - cargo test:       PASS (NNN tests, NN.Ns)
  - cargo deny:       PASS
  - cargo audit:      PASS (0 advisories)
  - pnpm typecheck:   PASS
  - pnpm lint:        PASS (0 warnings)
  - pnpm test:        PASS (NNN tests)
  - pnpm build:       PASS
  - playwright:       PASS (NN specs)

  ### Spec conformance
  <the table from §3>

  ### Drift
  - Exact: <list>
  - Differs (acknowledged): <list>
  - Missing: <list>
  - Extra: <list>

  ### Coverage
  <the table from §5>

  ### Verdict
  - [ ] Phase complete; safe to advance to P<N+1>
  - [ ] Phase incomplete; the following must be addressed before advance: <list>

  ### Suggested commits before advancing
  <list, if any>

If the verdict is "complete," I will run the next phase prompt. If "incomplete," I will address the listed items and re-run PV.

---

## After P9 + Final PV

The Tundra v1.0 line is live. The repo carries:

- All 9 phases' commits in linear history on `main`
- Tag `v1.0.0` with signed release artefacts
- All 17 spec documents under `docs/specs/`
- A CHANGELOG narrating the build
- Release notes published on GitHub

Subsequent prompts move into the v1.1+ roadmap from `tundra-technical-implementation-plan-v3.md` §11 — those will be authored separately as the v1.1 cycle starts.

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.0 | May 2026 | Al Amin Ahamed | Initial prompt suite. P0 (bootstrap) + P1–P9 (one per v3 roadmap phase) + PV (reusable verify). Each prompt: doc-read gate, ordered implementation steps with reference-by-name to the 17 spec docs, exit criteria, commit list. Mirrors the EMS prompt-suite structure. |

**Companion Documents:**

- All 17 Tundra spec documents in `docs/specs/`
- `tundra-technical-implementation-plan-v3.md` §11.1 — the phase definitions these prompts implement
- `tundra-test-plan-v1.md` §7 — the CI gates each phase's exit criteria call into
- `tundra-acceptance-checklist-v1.md` — the operator-side verification PV automates

**Planned Follow-up Documents:**

- `tundra-claude-code-prompts-v1-1.md` — prompts for the v1.1 cycle (HA mode, OAuth 2.1 device flow, plugin-contributed MCP tools)
