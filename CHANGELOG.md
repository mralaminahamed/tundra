# Changelog

All notable changes to Tundra will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
