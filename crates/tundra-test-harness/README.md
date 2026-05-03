# tundra-test-harness

Integration test infrastructure for the Tundra workspace. Spins real PostgreSQL and Valkey containers for each test run.

## `TestEnv`

```rust
use tundra_test_harness::TestEnv;

#[tokio::test]
async fn my_integration_test() {
    let env = TestEnv::new().await;  // starts PG + Valkey containers, runs migrations
    let pool = env.pool();
    // … test against real database …
}
```

## What it provides

- Isolated PostgreSQL 18 container per test (via `testcontainers`)
- Isolated Valkey 8 container per test
- Migrations applied automatically from `migrations/`
- Typed factories for seeding test data (`OperatorFactory`, `SiteFactory`, …)
- `env.pool()` — `PgPool` connected to the test database
- `env.valkey()` — Valkey connection for testing pub/sub and cache

## Why no mocks

Integration tests hit real databases. Mock-based tests have historically masked migration failures and schema divergences — see project conventions in `CLAUDE.md`.

## Usage in CI

The CI pipeline runs `cargo test --workspace` which includes all integration tests. Testcontainers pulls images on first run and caches them.
