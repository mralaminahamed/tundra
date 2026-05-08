---
title: Developer Guide
description: Architecture, conventions, hard constraints, and PR checklist.
sidebar:
  order: 1
---

## Workspace structure

```
crates/
  tundrad-domain/       Pure domain types — zero I/O, no DB
  tundrad-repo/         SQLx repositories; all DB access
  tundrad-api/          Axum 0.8 HTTP routes + DTOs
  tundrad-grpc/         Tonic 0.13 gRPC service implementations
  tundrad-auth/         Sessions, TOTP, WebAuthn, RBAC
  tundrad-crypto/       AES-256-GCM, EncryptedField<T>
  tundrad-jobs/         Background job types
  tundrad-events/       Valkey pub/sub event bus
  tundrad-acme/         Let's Encrypt / ZeroSSL
  tundrad-plugin-host/  Wasmtime sandbox
  tundrad-config/       Figment-based layered config
  tundrad-telemetry/    tracing-subscriber + OTLP
  tundra-shared/        Types shared across tundrad + agent
  tundra-test-harness/  TestEnv (Postgres + Valkey containers)
panel/                  React 19 SPA
migrations/             PostgreSQL migrations (up-only)
proto/                  OpenAPI 3.1 spec + gRPC proto
installer/              install.sh + test harness
```

## Tech stack

| Layer | Technology |
|-------|-----------|
| HTTP | Axum 0.8 |
| gRPC | Tonic 0.13 |
| DB | PostgreSQL 18, SQLx |
| Cache/Queue | Valkey 8 (Redis-compatible) |
| TLS | rustls 0.23 (no OpenSSL) |
| Plugin runtime | Wasmtime 22 |
| Frontend | React 19, TanStack Router 1.x, TanStack Query 5.x |
| Styling | Tailwind CSS 4, owned shadcn-ui components |
| Testing | testcontainers (Rust), Playwright (e2e) |

## Hard constraints

These are non-negotiable:

| Constraint | Reason |
|-----------|--------|
| No `openssl-sys` anywhere | `deny.toml` enforces rustls-only; OpenSSL has a long CVE history |
| Up-only migrations | Safe forward deploys; no `down` file ever |
| `EncryptedField<T>` for all secret columns | Plaintext secrets in the DB are a security bug |
| `audit_log` insert in every mutation handler | Compliance requirement |
| No `unwrap()` in HTTP handlers | Use `?` + explicit `ApiError` mapping |
| Parameterized queries only | No `format!()` into SQL strings |
| Spec-first REST | Design in `proto/openapi.yaml` before writing code |

## Crate boundaries

- `tundrad-domain` — no I/O, no DB; pure types and business logic
- `tundrad-repo` — all DB access; owns transaction boundaries
- `tundrad-api` — thin: validate input, call repo/domain, return DTO
- Never import `tundrad-api` from `tundrad-repo` (one-way dependency)

## PR checklist

Before opening a PR:

- [ ] `cargo fmt --all` — no formatting changes
- [ ] `cargo clippy --workspace --all-targets -- -D warnings` — no warnings
- [ ] `cargo test --workspace` — all tests pass
- [ ] `cd panel && pnpm typecheck && pnpm lint && pnpm test --run` — clean
- [ ] New routes have entries in `tests/authz_matrix.rs`
- [ ] Migration is up-only, has a reasonable timestamp, and includes a rollback strategy in comments
- [ ] Secret columns use `EncryptedField<T>`
- [ ] Every state-changing handler writes to `audit_log`
