# Developer Guide

For contributors building or modifying Tundra. Covers workspace setup, architecture orientation, testing conventions, and hard constraints.

---

## Workspace setup

### Requirements

- Rust toolchain pinned in `rust-toolchain.toml` (stable, with `clippy` + `rustfmt` components)
- `cargo-deny`, `cargo-llvm-cov`, `sqlx-cli` installed
- Node 22+, `pnpm` 9+
- Docker (for integration test containers)
- PostgreSQL 18 client tools (`psql`, `pg_dump`)

```bash
# Install extra cargo tools
cargo install cargo-deny cargo-llvm-cov sqlx-cli --locked

# Panel
cd panel && pnpm install
```

### Environment for local dev

```bash
# Copy dev compose file and start services
cp docs/09-deployment-bundle/dev/docker-compose.yml docker-compose.dev.yml
docker compose -f docker-compose.dev.yml up -d

# Set DATABASE_URL
export DATABASE_URL="postgres://tundra:tundra@localhost:5432/tundra"

# Run migrations
sqlx migrate run

# Start control plane (dev mode)
cargo run -p tundrad-bin

# Start panel dev server (separate terminal, from panel/)
pnpm dev   # proxies /api → localhost:7400
```

---

## Commands

### Rust

```bash
cargo check --workspace                                        # fast type check
cargo build --workspace                                        # debug build
cargo build --release --workspace                              # release build
cargo test --workspace                                         # all tests
cargo test -p tundrad-api                                      # single crate
cargo test -p tundrad-api auth::tests::login_rate_limit        # single test
cargo fmt --all                                                 # format
cargo fmt --all -- --check                                     # CI format check
cargo clippy --workspace --all-targets -- -D warnings          # lint (must be clean)
cargo deny check                                               # license + advisory audit
cargo llvm-cov --workspace                                     # coverage report
```

### Panel

```bash
# Always run from panel/
pnpm typecheck          # tsc --noEmit (must be clean)
pnpm lint               # eslint src
pnpm lint:fix           # auto-fix lint
pnpm format:check       # prettier check
pnpm test --run         # vitest one-shot
pnpm test               # vitest watch
pnpm dev                # dev server
pnpm build              # production build to dist/
```

### Database

```bash
sqlx migrate run               # apply pending migrations
sqlx migrate add <name>        # create new migration file
```

---

## Architecture

### Component topology

```
tundrad (control plane)
  ├── tundrad-api       Axum 0.8 HTTP handlers + DTOs
  ├── tundrad-domain    Pure domain types — zero I/O
  ├── tundrad-repo      SQLx repositories — all DB access
  ├── tundrad-auth      Sessions, API tokens, TOTP, WebAuthn, RBAC
  ├── tundrad-crypto    Master key, HKDF, AES-256-GCM, EncryptedField<T>
  ├── tundrad-jobs      Background job types
  ├── tundrad-events    Valkey pub/sub event bus
  ├── tundrad-acme      instant-acme wrapper (Let's Encrypt / ZeroSSL)
  ├── tundrad-plugin-host  Wasmtime sandbox + WIT host calls
  ├── tundrad-grpc      Tonic 0.13 gRPC service implementations
  └── tundrad-config    figment-based layered config

tundra-agent (per managed server)
  ├── tundra-agent-rpc          Tonic gRPC client
  ├── tundra-agent-reconciler   desired → actual state loop
  ├── tundra-agent-providers    one Provider per managed service
  ├── tundra-agent-metrics      per-site + per-server metrics
  └── tundra-agent-logs         log shipping

panel/                           React 19 SPA
  └── src/routes/               TanStack Router 1.x file-based routes
```

Single-host: `tundrad` ↔ `tundra-agent` over Unix domain socket.  
Multi-host: mTLS gRPC over port 7447.

### Layer rules

- `tundrad-domain` — no I/O, no DB, no HTTP; pure types and logic
- `tundrad-repo` — only place that touches SQLx; owns transaction boundaries
- `tundrad-api` — only place that touches Axum; calls repo + domain
- Cross-layer calls always go down: api → repo → domain. Never domain → repo.

### Frontend stack

- React 19, TanStack Router 1.x (file-based), TanStack Query 5.x
- Formik + Yup for multi-step wizards; React Hook Form + Zod for simple forms
- Tailwind CSS 4, shadcn/ui components copied into `panel/src/components/ui/` (not npm-imported)
- Real-time: native WebSocket forwarded from `tundrad`
- Types generated from `proto/openapi.yaml` via `openapi-typescript`

---

## Adding a new REST endpoint

1. **Design in `proto/openapi.yaml` first.** The contract test (`tests/openapi_drift.rs`) fails if the implementation diverges from the spec. This is non-negotiable.

2. **Add the route** to the router in `crates/tundrad-api/src/lib.rs`.

3. **Write the handler** in `crates/tundrad-api/src/routes/<module>.rs`:
   - Use `?` + explicit error mapping — no `unwrap()` in handlers
   - Every state-changing handler writes an `audit_log` row before returning
   - Actor comes from the authenticated principal, never from the request body

4. **Add authorization rows** in `tests/authz_matrix.rs`:
   - unauthenticated → 401
   - wrong-role → 403
   - correct-role → 2xx

5. **Add the frontend type** to `panel/src/lib/api-types.ts` if the response shape is new.

---

## Adding a database migration

```bash
sqlx migrate add <descriptive_name>
# Creates migrations/YYYYMMDDNNNNNN_descriptive_name.sql
```

Rules:
- **Never write a `down` migration.** Up-only, always.
- Every table: `uuidv7()` PK, `created_at`/`updated_at timestamptz`, `BEFORE UPDATE` trigger for `updated_at`.
- Every secret column: `bytea` type + `EncryptedField<T>` — never plaintext.
- Soft-deletable tables: add `deleted_at timestamptz NULL`.
- Migration files are append-only after release; never modify an existing file.

---

## Encrypted fields

Any column holding a secret must use `EncryptedField<T>` from `tundrad-crypto`:

```rust
// In a domain struct
pub api_key: EncryptedField<String>,

// In a migration
api_key BYTEA NOT NULL,
```

`EncryptedField<T>` is a SQLx custom type that encrypts on write and decrypts on read using AES-256-GCM with HKDF-derived per-column-family keys. Plaintext secrets in the DB are a security bug.

Structs with secrets must also derive `#[redact]` so they don't leak via `Debug`.

---

## Testing conventions

From `docs/04-quality/tundra-test-plan-v1.md`:

### Never mock the database

Integration tests use `tundra-test-harness::TestEnv` — real PostgreSQL + Valkey containers via `testcontainers`. Mocked DB tests have a history of passing while prod migrations fail.

```rust
#[sqlx::test]
async fn test_create_site(pool: PgPool) {
    let env = TestEnv::with_pool(pool).await;
    // ...
}
```

### Authz matrix

Every new route gets rows in `tests/authz_matrix.rs`:
```rust
("POST /api/v1/sites",     None,                  StatusCode::UNAUTHORIZED),
("POST /api/v1/sites",     Some(Role::Viewer),    StatusCode::FORBIDDEN),
("POST /api/v1/sites",     Some(Role::Admin),     StatusCode::CREATED),
```

### Snapshot tests

Generated configs (Nginx blocks, systemd units) use `insta`:
```rust
insta::assert_snapshot!(generated_nginx_config);
```

### Property tests

Parsers and serializers use `proptest`:
```rust
proptest! {
    #[test]
    fn domain_roundtrip(s in "[a-z0-9-]{1,63}") {
        // ...
    }
}
```

### Frontend

- Component tests: React Testing Library + MSW for HTTP mocking
- E2E: Playwright
- Every route must pass `axe-core` WCAG 2.1 AA

---

## Hard constraints

These are non-negotiable. CI will catch violations but don't rely on it.

1. **No `openssl-sys`** — `rustls` only. `deny.toml` bans `openssl`, `openssl-sys`, `openssl-probe`. Any new dep that transitively requires OpenSSL must be feature-flagged out or replaced.

2. **Up-only migrations** — never write a `down` migration. Reverting a deploy means code revert + a new forward migration.

3. **`EncryptedField<T>` discipline** — every column holding a secret is `bytea` + `EncryptedField<T>`. See `docs/01-architecture/tundra-database-schema-v1.md` §9 for the full list.

4. **Spec-first REST** — new endpoints in `proto/openapi.yaml` first. `tests/openapi_drift.rs` fails on divergence.

5. **Audit every mutation** — every state-changing handler writes to `audit_log` before returning.

6. **TLS 1.3 only** — `rustls` configured with explicit AEAD cipher list. No plaintext fallback.

7. **`publish = false`** on all binary crates.

8. **Argon2id parameters**: `m=64MiB, t=3, p=1`. Never downgrade.

9. **API token format**: `tnd_<env>_<random>`. Store SHA-256 only, never plaintext.

10. **No `format!()` into SQL** — parameterized queries only. No `unwrap()` in HTTP handlers.

---

## Security rules (short form)

- Step-up auth required for sensitive ops (server deletion, master-key rotation, admin token issuance): assert `session.last_full_auth_at > now() - interval '5 minutes'`
- Secret-bearing struct fields must derive `#[redact]`
- See `docs/03-security/tundra-security-audit-v1.md` for the full STRIDE threat model

---

## Plugin development

See [Plugin Development](plugin-development.md).

---

## PR checklist

Before opening a PR:

- `cargo fmt --all -- --check` passes
- `cargo clippy --workspace --all-targets -- -D warnings` passes
- `cargo test --workspace` passes
- `pnpm typecheck` passes (from `panel/`)
- `pnpm lint` passes (from `panel/`)
- New routes have authz matrix rows
- New secret columns use `EncryptedField<T>`
- Any new endpoint exists in `proto/openapi.yaml` first
