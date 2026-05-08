---
title: Testing
description: Testing conventions, test harness, and how to run tests.
sidebar:
  order: 4
---

## Test pyramid

```
           ┌──────────────────────┐
           │     E2E (Playwright) │  ~20 specs
           │  Full stack in Docker│
           ├──────────────────────┤
           │  Integration tests   │  Real Postgres + Valkey
           │  (testcontainers)    │
           ├──────────────────────┤
           │   Unit tests (Rust)  │  No I/O, fast
           ├──────────────────────┤
           │  Component tests     │  React Testing Library + MSW
           └──────────────────────┘
```

## Running tests

```bash
# All Rust tests (spins real Postgres + Valkey via testcontainers)
cargo test --workspace

# Single crate
cargo test -p tundrad-api

# Single test
cargo test -p tundrad-api auth::tests::login_rate_limit

# Panel unit + component tests
cd panel && pnpm test --run

# E2E tests (requires e2e stack running)
cd docs/09-deployment-bundle/e2e && bash scripts/run.sh up
cd panel && pnpm playwright test --project=chromium
```

## Integration test harness

`tundra-test-harness::TestEnv` provides:

- Real PostgreSQL 18 container (via testcontainers)
- Real Valkey container
- Migrations applied
- `seed_operator()` factory for test data

```rust
#[tokio::test]
async fn test_login() {
    let env = TestEnv::new().await;
    let op = env.seed_operator("test@example.com", "password123").await;
    // test against real DB...
}
```

**Never mock the database.** Integration tests must use `TestEnv` or a real DB. Mocked tests were the cause of a past production incident (mocked behavior diverged silently from actual DB constraints).

## Authorization matrix

Every new route needs a row in `tests/authz_matrix.rs`:

```rust
// Unauthenticated → 401
// Wrong role     → 403
// Correct role   → 2xx
matrix_test!(
    get_sites,
    method: GET,
    path: "/api/v1/sites",
    unauthed: 401,
    operator_role: 200,
    admin_role: 200,
    owner_role: 200,
);
```

## Snapshot tests

Generated configs (Nginx blocks, systemd units) use `insta` for snapshot testing:

```rust
insta::assert_snapshot!(generate_caddy_config(&site));
```

Update snapshots with:
```bash
cargo insta review
```

## E2E conventions

- One spec file per feature area (`create-site.spec.ts`, `wordpress.spec.ts`)
- `loginAs()` helper for authentication (uses `owner@example.com` seed credentials)
- `POST /api/v1/test/reset` to reset state between tests
- Use `--profile multi-server` for cross-server tests
