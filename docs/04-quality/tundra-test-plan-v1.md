# Tundra — Test Plan & QA Strategy

> The complete testing architecture for the Tundra control plane.
> The pyramid, the tooling, the CI gates, and the reference test code.

---

**Author:** Al Amin Ahamed
**GitHub:** [@mralaminahamed](https://github.com/mralaminahamed)
**X:** [@mralaminahamed](https://x.com/mralaminahamed)

**Document Version:** v1.0
**Document Date:** May 2026
**Companion to:** `tundra-technical-implementation-plan-v2.md`, `tundra-frontend-ui-spec-v1.md`
**Status:** Implementation-Ready Specification
**Audience:** Engineering — Backend developers, frontend engineers, contributors, code reviewers

---

## 1. Overview

This document specifies how Tundra is tested. It covers what gets tested, with what tools, at what tier of the pyramid, in what CI gate, with what coverage target. It is the canonical answer to "how do I add a test for this change?" — every section walks the relevant test type with a working code reference.

A separate operator-facing companion (`tundra-acceptance-checklist-v1.md`) covers UAT-style "did it work?" verification from the operator's perspective. This document is the engineering-internal test architecture.

### 1.1 Goals

The goals of Tundra's testing strategy, in priority order:

1. **Catch regressions before they reach production.** Every release has a green CI; every PR is gated on the test suite.
2. **Make adding tests cheap.** A friction-laden test rig is a test rig that doesn't get used. We invest in fixtures, factories, and mocks so that adding a new test is a small, obvious, repeatable thing.
3. **Tell the truth about what works.** Tests that pass while the underlying behavior is broken are worse than no tests. We bias toward end-to-end and integration tests where the costs allow.
4. **Run quickly enough to be used.** A 30-minute test suite gets skipped. We target sub-5-minute unit + integration runs and a separate (parallel) E2E pass.

### 1.2 The Pyramid

| Tier              | Tool                                                          | What it tests                                               | Volume                     | Per-PR?             |
|-------------------|---------------------------------------------------------------|-------------------------------------------------------------|----------------------------|---------------------|
| Unit              | `cargo test` (Rust), Vitest (frontend)                        | Pure logic — formatters, parsers, single functions          | Many                       | Yes                 |
| Integration       | `cargo test` + testcontainers (Rust), Vitest + MSW (frontend) | Components with real dependencies (DB, Valkey, mocked HTTP) | Moderate                   | Yes                 |
| Contract          | `dredd` against OpenAPI                                       | API request/response shapes                                 | One per endpoint           | Yes                 |
| E2E               | Playwright                                                    | Real frontend → real backend on a stood-up cluster          | Few; covers critical paths | Yes (with sharding) |
| Accessibility     | Playwright + axe-core                                         | Per-route WCAG 2.1 AA compliance                            | One per route              | Yes                 |
| Performance       | criterion (Rust), k6 (HTTP)                                   | Latency and throughput regressions                          | Moderate                   | Nightly; not per-PR |
| Security          | cargo-audit, cargo-deny, semgrep, OSV-scanner                 | Known vulnerabilities, license violations                   | Per-PR + daily             |
| Visual regression | Playwright + screenshots                                      | Pixel-stable layout for key pages                           | Optional, on demand        | No                  |

---

## 2. Backend — Rust

### 2.1 Test Layout

Tests live alongside the code in standard Rust idiom. Each crate has:

- **In-module `#[cfg(test)]` blocks** for fine-grained unit tests next to the implementation.
- **`tests/` directory at the crate root** for integration tests that exercise the public API.
- **`benches/` directory at the crate root** for criterion benchmarks (not run in PR CI).

For the workspace-level integration tests (multi-crate scenarios), there's a top-level `xtask/` crate and an `integration-tests/` workspace member with the heavier scenarios.

### 2.2 Unit Tests

Unit tests test one function, one struct, one module. They have no external dependencies — no DB, no network, no filesystem. They run in milliseconds and there are thousands of them.

Reference example — testing the cron expression parser:

```rust
// crates/tundrad-core/src/cron/parser.rs
pub fn parse(expr: &str) -> Result<CronSpec, CronError> { ... }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_every_minute() {
        let spec = parse("* * * * *").unwrap();
        assert_eq!(spec.minute, MinuteField::All);
    }

    #[test]
    fn rejects_six_field_form() {
        assert!(matches!(
            parse("* * * * * *"),
            Err(CronError::WrongFieldCount { expected: 5, got: 6 })
        ));
    }

    #[test]
    fn parses_step_values() {
        let spec = parse("*/15 * * * *").unwrap();
        assert_eq!(spec.minute, MinuteField::Step(15));
    }

    #[test]
    fn rejects_zero_step() {
        assert!(matches!(
            parse("*/0 * * * *"),
            Err(CronError::InvalidStep(_))
        ));
    }
}
```

### 2.3 Property-Based Tests

For domains with infinite input space (parsers, serializers, encoders), property tests (via `proptest`) cover what example tests miss:

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn cron_round_trip(expr in "[*0-9/,-]{1,80}") {
        // Property: parse → serialize → parse produces the same CronSpec
        if let Ok(spec1) = parse(&expr) {
            let serialized = spec1.to_string();
            let spec2 = parse(&serialized).expect("re-parse must succeed");
            prop_assert_eq!(spec1, spec2);
        }
    }
}
```

We use property tests for the cron parser, the duration parser, the byte-formatter, the FQDN validator, and the secret AEAD round-trip.

### 2.4 Integration Tests with Real Postgres

The most-touched test pattern. Spins up a real Postgres in a container, runs migrations, and gives the test a clean schema.

```rust
// crates/tundrad-api/tests/sites_crud.rs
use tundrad_test_support::TestEnv;

#[tokio::test]
async fn create_site_persists_and_returns_provisioning_status() {
    let env = TestEnv::new().await;        // Spins up Postgres, Valkey, mock agent
    let api = env.api_client_as_owner();

    let server = env.factory.create_server().await;

    let resp = api.post("/api/v1/sites", &json!({
        "display_name": "Test Site",
        "primary_domain": "test.example.com",
        "primary_server_id": server.id,
        "application": {
            "application_type": "static",
            "runtime_version": "n/a",
            "source": { "kind": "blank" }
        },
        "tls": { "issuer": "letsencrypt", "auto_renew": true }
    })).await;

    assert_eq!(resp.status(), 201);

    let body: SiteResponse = resp.json().await;
    assert_eq!(body.data.attributes.status, "provisioning");
    assert!(body.data.id.is_some());

    // Verify in the database directly
    let row: SiteRow = sqlx::query_as("SELECT * FROM sites WHERE id = $1")
        .bind(body.data.id)
        .fetch_one(&env.db_pool)
        .await
        .unwrap();
    assert_eq!(row.display_name, "Test Site");
    assert_eq!(row.status, "provisioning");

    // Verify an audit_log entry was written
    let audit: AuditRow = sqlx::query_as(
        "SELECT * FROM audit_log WHERE action = 'sites.create' ORDER BY occurred_at DESC LIMIT 1"
    ).fetch_one(&env.db_pool).await.unwrap();
    assert_eq!(audit.outcome, "success");
}
```

The `TestEnv` helper handles container lifecycle, migration, factory injection, and HTTP client setup. Every integration test gets a fresh schema (truncated and re-migrated, not a new container per test — too slow). Tests run in parallel within the same Postgres instance via separate transactions.

### 2.5 Authorization Matrix Tests

The authorization model is enumerated, not synthesized — so the test for it is also enumerated. `tests/authz_matrix.rs` walks every (role, action, resource) tuple and asserts the expected outcome.

```rust
#[tokio::test]
async fn authorization_matrix() {
    let env = TestEnv::new().await;

    let cases: Vec<(Role, &str, ExpectedOutcome)> = vec![
        (Role::Owner,    "GET /api/v1/operators", Allow),
        (Role::Admin,    "GET /api/v1/operators", Allow),
        (Role::Operator, "GET /api/v1/operators", Deny),
        (Role::ReadOnly, "GET /api/v1/operators", Deny),

        (Role::Owner,    "POST /api/v1/sites", Allow),
        (Role::Admin,    "POST /api/v1/sites", Allow),
        (Role::Operator, "POST /api/v1/sites", Allow),
        (Role::ReadOnly, "POST /api/v1/sites", Deny),

        (Role::Owner,    "DELETE /api/v1/sites/:id", Allow),
        (Role::Admin,    "DELETE /api/v1/sites/:id", Allow),
        (Role::Operator, "DELETE /api/v1/sites/:id", Deny),  // Operators can't destroy
        (Role::ReadOnly, "DELETE /api/v1/sites/:id", Deny),

        // ... continues for every endpoint × every role
    ];

    for (role, request, expected) in cases {
        let api = env.api_client_as_role(role);
        let resp = api.request(request).await;
        match expected {
            Allow => assert!(resp.status().is_success() || resp.status() == 422,
                            "Expected allow for {:?} {}, got {}", role, request, resp.status()),
            Deny  => assert_eq!(resp.status(), 403,
                            "Expected deny for {:?} {}, got {}", role, request, resp.status()),
        }
    }
}
```

Adding a new endpoint requires adding new rows to this matrix. CI fails if a route exists without matrix coverage (a separate test introspects the route table and compares against the matrix's keys).

### 2.6 Mocking Outbound HTTP

Outbound HTTP (registrar APIs, ACME, payment gateways) is mocked via `wiremock`:

```rust
use wiremock::{MockServer, Mock, ResponseTemplate};
use wiremock::matchers::{method, path};

#[tokio::test]
async fn namecheap_renewal_handles_provider_500() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/xml.response"))
        .respond_with(ResponseTemplate::new(500).set_body_string("internal error"))
        .mount(&mock_server)
        .await;

    let env = TestEnv::new()
        .with_namecheap_endpoint(mock_server.uri())
        .await;

    let domain = env.factory.create_namecheap_domain().await;
    let result = env.namecheap_plugin.renew_domain(&domain).await;

    assert!(result.is_err());
    assert!(matches!(result.unwrap_err(), RenewError::ProviderUnavailable));

    // The job should be requeued, not abandoned
    let job: PluginJobRow = sqlx::query_as(
        "SELECT * FROM plugin_jobs WHERE kind = 'domain.renew' ORDER BY created_at DESC LIMIT 1"
    ).fetch_one(&env.db_pool).await.unwrap();
    assert_eq!(job.status, "queued");
    assert_eq!(job.attempts, 1);
}
```

### 2.7 Agent Tests

The agent's tests use the same `wiremock` pattern for the control plane gRPC, plus a sandboxed test rig that operates on a tmpfs filesystem and mock systemd. The agent never touches the host's real `/etc` during tests.

### 2.8 Plugin Tests

Plugin tests run plugins in a real Wasmtime sandbox against a mock host. The host implements the WIT contract; tests assert the plugin's behavior given various host responses.

```rust
#[tokio::test]
async fn plugin_respects_capability_grants() {
    let host = MockPluginHost::new()
        .with_grant("http.outbound:api.allowed.example")
        .build();

    let plugin = load_plugin("./fixtures/test-plugin.wasm", host.clone()).await;

    // Should succeed — granted
    let result = plugin.invoke("fetch", json!({ "url": "https://api.allowed.example/x" })).await;
    assert!(result.is_ok());

    // Should fail — not granted
    let result = plugin.invoke("fetch", json!({ "url": "https://api.evil.example/x" })).await;
    assert!(matches!(result, Err(PluginError::CapabilityDenied(_))));
}
```

### 2.9 Coverage Targets

| Code area                                        | Floor                                                      |
|--------------------------------------------------|------------------------------------------------------------|
| Pure utilities (formatters, validators, parsers) | 95%                                                        |
| Service layer (business logic)                   | 85%                                                        |
| HTTP handlers                                    | 80%                                                        |
| Database access                                  | 70% (most coverage comes from integration tests, not unit) |
| Agent action dispatchers                         | 90%                                                        |
| Plugin host APIs                                 | 90%                                                        |
| Cryptographic code                               | 100%                                                       |
| Rate limiting / quota                            | 95%                                                        |

CI fails if coverage drops below the floor on any module. We use `cargo-llvm-cov` for measurement.

### 2.10 What We Don't Unit-Test

- **`main.rs` entry points.** Tested via E2E only.
- **Tracing/logging output strings.** Subject to UI changes; not behavior.
- **Error message wording.** Tested for presence, not content.
- **Internal helper functions that are only called from one place.** They're tested through their caller.

---

## 3. Frontend — TypeScript / React 19

The frontend test stack (per `tundra-frontend-ui-spec-v1.md` §15):

- **Vitest 3** as the test runner (Vite-native, fast)
- **React Testing Library** for component tests
- **MSW (Mock Service Worker)** for HTTP mocking
- **happy-dom** as the DOM environment (faster than jsdom)
- **Playwright** for E2E
- **axe-core** for accessibility, run inside Playwright

### 3.1 Unit & Component Tests

Unit tests for pure utility functions in `src/lib/format/`:

```ts
// src/lib/format/bytes.test.ts
import { formatBytes } from "./bytes";

test("formats sub-KB sizes in bytes", () => {
  expect(formatBytes(0)).toBe("0 B");
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(1023)).toBe("1023 B");
});

test("formats KB through GB with two decimals", () => {
  expect(formatBytes(1024)).toBe("1.00 KiB");
  expect(formatBytes(1536)).toBe("1.50 KiB");
  expect(formatBytes(1024 * 1024)).toBe("1.00 MiB");
  expect(formatBytes(1024 ** 3)).toBe("1.00 GiB");
});
```

Component tests for React components with mocked API:

```tsx
// src/components/forms/rhf/env-var-form.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { withProviders } from "@/test/utils";
import { EnvVarForm } from "./env-var-form";

test("submits env var with correct payload", async () => {
  const user = userEvent.setup();
  const onSuccess = vi.fn();

  server.use(
    http.post("/api/v1/applications/:id/env-vars", async ({ request }) => {
      const body = await request.json();
      expect(body).toMatchObject({
        key: "DATABASE_URL",
        value: "postgres://...",
        is_secret: true,
      });
      return HttpResponse.json({ data: { id: "ev_1", ...body } }, { status: 201 });
    }),
  );

  render(withProviders(<EnvVarForm applicationId="app_1" onSuccess={onSuccess} />));

  await user.type(screen.getByLabelText("Key"), "DATABASE_URL");
  await user.type(screen.getByLabelText("Value"), "postgres://...");
  await user.click(screen.getByRole("button", { name: /add variable/i }));

  await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
});

test("rejects lowercase keys with validation error", async () => {
  const user = userEvent.setup();
  render(withProviders(<EnvVarForm applicationId="app_1" />));

  await user.type(screen.getByLabelText("Key"), "lowercase_key");
  await user.tab();

  expect(await screen.findByText(/UPPER_SNAKE_CASE/)).toBeInTheDocument();
});
```

### 3.2 E2E with Playwright

The E2E suite covers critical operator flows end-to-end against a real `tundrad` and a containerized mock agent.

```ts
// e2e/site-create.spec.ts
import { test, expect } from "./fixtures";

test("operator creates a Laravel site from GitHub", async ({ page, login, mockGithub }) => {
  await mockGithub.respondToRepoSearch([
    { full_name: "alice/example-app", default_branch: "main" }
  ]);

  await login("alice@example.com");
  await page.goto("/sites");

  await page.getByRole("button", { name: "Create site" }).click();

  // Step 1 — Source
  await page.getByLabel("GitHub").click();
  await page.getByPlaceholder("Search repositories…").fill("example-app");
  await page.getByRole("option", { name: "alice/example-app" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2 — Application
  await expect(page.getByLabel("Application type")).toHaveValue("laravel");
  await page.getByLabel("Runtime version").selectOption("8.4");
  await page.getByLabel("Build command").fill("composer install --no-dev");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3 — Domain
  await page.getByLabel("Domain").fill("e2e.test.example");
  await page.getByLabel("Server").click();
  await page.getByRole("option", { name: "test-server-01" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 4 — Confirm
  await page.getByRole("button", { name: "Create site" }).click();

  await expect(page).toHaveURL(/\/sites\/s_[a-z0-9]+/);
  await expect(page.getByText("e2e.test.example")).toBeVisible();
  await expect(page.getByRole("status").first()).toContainText("provisioning");
});
```

### 3.3 Accessibility Tests

Every panel route gets an axe pass. Violations fail the build.

```ts
// e2e/a11y.spec.ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROUTES = [
  "/login", "/dashboard", "/sites", "/servers",
  "/domains", "/databases", "/mail", "/backups",
  "/plugins", "/migrations", "/settings",
];

for (const route of ROUTES) {
  test(`a11y: ${route}`, async ({ page, login }) => {
    if (route !== "/login") await login();
    await page.goto(route);
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(results.violations, JSON.stringify(results.violations, null, 2))
      .toEqual([]);
  });
}
```

There is no exceptions list; violations get fixed.

### 3.4 Frontend Coverage Targets

| Layer                                            | Floor                                  |
|--------------------------------------------------|----------------------------------------|
| Pure utilities                                   | 95%                                    |
| Custom hooks                                     | 85%                                    |
| Components with logic                            | 75%                                    |
| Routes (E2E smoke)                               | 100% (every route loads without error) |
| Critical flows (login, deploy, restore, migrate) | 100% E2E                               |

---

## 4. Contract Tests

The OpenAPI 3.1 spec is the contract between backend and frontend. We verify both sides match it.

### 4.1 Backend → OpenAPI

A test in `crates/tundrad-api/tests/openapi_drift.rs` introspects the running router and asserts every route is documented in `proto/openapi.yaml`. Routes that exist but aren't documented fail the build. Routes that are documented but don't exist fail the build.

### 4.2 OpenAPI → Frontend

The frontend's `src/lib/api/types.ts` is generated from `proto/openapi.yaml` by `openapi-typescript`. CI regenerates the types and fails if they differ from what's checked in — i.e., the developer must commit the generated types alongside the spec change.

### 4.3 OpenAPI → Reality

`dredd` runs against the live test cluster, sending example requests for every documented endpoint and asserting responses match the documented schema. Mismatches fail.

---

## 5. Performance Tests

Not gating on per-PR (too slow), but run nightly on a dedicated host with a fixed configuration. Regressions trigger a CI alert.

### 5.1 Backend Microbenchmarks (criterion)

```rust
// crates/tundrad-core/benches/cron_parser.rs
use criterion::{Criterion, criterion_group, criterion_main};
use tundrad_core::cron;

fn parser_bench(c: &mut Criterion) {
    c.bench_function("parse simple", |b| {
        b.iter(|| cron::parse("*/15 * * * *").unwrap());
    });

    c.bench_function("parse complex", |b| {
        b.iter(|| cron::parse("0,15,30,45 8-18 * 1-3,7-9 1-5").unwrap());
    });
}

criterion_group!(benches, parser_bench);
criterion_main!(benches);
```

The criterion baseline is checked in. Regressions > 10% fail nightly CI.

### 5.2 HTTP Load Tests (k6)

```javascript
// perf/sites-list.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '60s', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{name:list-sites}': ['p(99)<200'],   // p99 < 200ms
    'http_req_failed': ['rate<0.001'],                      // <0.1% errors
  },
};

export default function () {
  const res = http.get('https://panel.test/api/v1/sites?limit=25', {
    headers: { Authorization: `Bearer ${__ENV.TUNDRA_TOKEN}` },
    tags: { name: 'list-sites' },
  });
  check(res, { 'status 200': (r) => r.status === 200 });
}
```

We have k6 scripts for: site-list, deployment-trigger, log-stream throughput, WebSocket subscription scaling, agent-heartbeat throughput.

---

## 6. Security Tests

### 6.1 Static Analysis

| Tool                                         | What it checks                                         | When             |
|----------------------------------------------|--------------------------------------------------------|------------------|
| `cargo clippy --all-features -- -D warnings` | Rust lints, common bug patterns                        | Every PR         |
| `cargo fmt -- --check`                       | Formatting                                             | Every PR         |
| `cargo deny check`                           | License violations, advisory hits, banned dependencies | Every PR         |
| `cargo audit`                                | RustSec advisory matches                               | Daily + every PR |
| `OSV-scanner`                                | Cross-ecosystem vuln scanning                          | Daily            |
| `semgrep --config=p/rust`                    | Pattern-based static analysis                          | Every PR         |
| `eslint` (frontend)                          | JS/TS lints                                            | Every PR         |
| `tsc --noEmit` (frontend)                    | Type-check                                             | Every PR         |

Any failure blocks the merge.

### 6.2 SAST for Auth/Crypto

`tests/security/` has dedicated tests for known security pitfalls:

- Constant-time comparison enforcement on every secret-comparison site
- No `format!` into SQL anywhere (verified by AST scan)
- No `unwrap()` in HTTP handlers (panics → 500s; we want explicit error handling)
- All secret-bearing struct fields use the `#[redact]` derive (so they don't leak via `Debug`)

### 6.3 Fuzzing

`cargo-fuzz` targets:

- The cron expression parser
- The TOML config parser
- The webhook payload parser (per-source: GitHub, GitLab)
- The plugin manifest parser
- The ACME response parser

Fuzz runs nightly for an hour per target on dedicated infrastructure. New corpus inputs are committed back when they expand coverage.

---

## 7. Test Data Strategy

### 7.1 Factories

A `tundra-test-support` crate provides typed factories for every domain entity:

```rust
let server = env.factory.create_server().await;          // Sane defaults
let server = env.factory.create_server()
    .hostname("custom-host")
    .region("blr-1")
    .with_capability("php", "8.4")
    .build_async()
    .await;
```

Factories follow the builder pattern so tests stay terse for the common case but can override anything.

### 7.2 Fixtures

Static JSON/SQL fixtures in `tests/fixtures/` for repeatable scenarios:

- `fixtures/sql/multi-server-fleet.sql` — preloads 5 servers, 20 sites for E2E
- `fixtures/webhooks/github-push.json` — canonical GitHub push payload for integration tests
- `fixtures/plugins/test-plugin.wasm` — a minimal test plugin built from `fixtures/plugins/test-plugin/`

### 7.3 Snapshot Testing

For complex output (rendered emails, generated nginx configs, generated systemd units), `insta` snapshots provide the regression check:

```rust
#[test]
fn renders_nginx_config_for_php_site() {
    let site = Site { /* ... */ };
    let config = render_nginx_config(&site);
    insta::assert_snapshot!(config);
}
```

Reviewing PRs that change snapshot files is the same as reviewing the change itself; reviewers see the diff in the snapshot file.

---

## 8. CI Pipeline

### 8.1 Per-PR Gates

```yaml
# .github/workflows/pr.yml (excerpt)

jobs:
  rust-lint:
    steps:
      - cargo fmt -- --check
      - cargo clippy --all-features -- -D warnings
      - cargo deny check

  rust-test:
    services:
      postgres:
        image: postgres:18
      valkey:
        image: valkey/valkey:8
    steps:
      - cargo build --tests
      - cargo nextest run --workspace
      - cargo llvm-cov --workspace --lcov --output-path lcov.info
      - codecov-action

  rust-security:
    steps:
      - cargo audit
      - osv-scanner scan source

  frontend-lint:
    steps:
      - pnpm lint
      - pnpm typecheck

  frontend-test:
    steps:
      - pnpm test --run --coverage

  contract-tests:
    steps:
      - cargo test --test openapi_drift
      - dredd

  e2e:
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - docker-compose up -d
      - pnpm test:e2e --shard=${{ matrix.shard }}/4

  build:
    needs: [rust-lint, rust-test, rust-security, frontend-lint, frontend-test]
    steps:
      - pnpm build
      - cargo build --release --bin tundrad
```

### 8.2 Nightly Jobs

- **Performance baselines** (criterion + k6)
- **Fuzz runs** (cargo-fuzz targets, 1 hour each)
- **OSV-scanner** (full advisory match)
- **Long-running E2E suite** (heavier scenarios, 3+ hour runtime)
- **Visual regression** (Playwright screenshots vs. baseline)

### 8.3 Release Gates

A release blocks until:

- All per-PR gates green on the release branch
- Nightly jobs green for the past 7 days
- Manual sign-off from a maintainer (we don't auto-publish releases)
- The release notes are written and committed

---

## 9. Test Environment Management

### 9.1 Local Development

`make test` runs the full per-PR gate locally. `make test-e2e` runs Playwright against a local stack. `docker-compose up -d` provides the supporting services (Postgres, Valkey, mock SMTP, mock GitHub).

A developer should be able to reproduce any CI failure on their laptop. If CI fails and the developer can't reproduce locally, that's a bug in the test infrastructure and we fix it.

### 9.2 Test Cluster

For E2E, we maintain a long-lived test cluster (one control-plane VM, three managed-server VMs) accessible to CI. This cluster is wiped and rebuilt nightly from a known-good snapshot to prevent test pollution.

### 9.3 Flaky Test Policy

Flaky tests are bugs. They get marked `#[ignore]` immediately on detection (with a tracking issue) and either fixed or removed within a week. We do not retry-on-failure as a mitigation for flakiness — that hides real bugs.

---

## 10. Adding Tests for a New Feature

The test-add procedure for a new feature, in order:

1. **Write the integration test first.** What does the operator-visible behavior look like? Write that test before the implementation. It fails because the implementation doesn't exist; that's correct.
2. **Drive the implementation from the test.** Make the test pass with the smallest reasonable change.
3. **Add unit tests for the pieces you wrote.** The integration test catches the behavior; unit tests pin the pieces in place against future refactors.
4. **Add to the authorization matrix.** If the feature has new endpoints, add rows to `tests/authz_matrix.rs`.
5. **Add an E2E test if the feature crosses surfaces.** Frontend + backend changes get an E2E test for the operator-flow that ties them together.
6. **Update the OpenAPI spec.** Run the contract drift test locally to verify.
7. **Add an a11y test if you touched the UI.** Confirm the new route or modal passes axe.
8. **Run `make test` locally.** Ensure everything passes.
9. **Open the PR.** CI confirms.

---

## 11. Document Control

| Version | Date     | Author         | Changes                                                                                                                                                                                                                                                                                          |
|---------|----------|----------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| v1.0    | May 2026 | Al Amin Ahamed | Initial complete test plan and QA strategy. Pyramid, tooling matrix, reference Rust tests (unit, integration, property, mocks, agent, plugin), reference frontend tests (Vitest + RTL + MSW), Playwright E2E, accessibility, contract tests, performance baselines, security gates, CI pipeline. |

**Companion Documents:**

- `tundra-acceptance-checklist-v1.md` — operator-facing UAT verification list
- `tundra-technical-implementation-plan-v2.md` — what we're testing
- `tundra-frontend-ui-spec-v1.md` — frontend test specifics
- `tundra-api-specification-v1.md` — the API surface contract tests verify
- `tundra-security-audit-v1.md` — controls the security tests verify

**Planned Follow-up Documents:**

- `tundra-fuzzing-corpus-v1.md` — managing the fuzz corpus over time
- `tundra-perf-baseline-v1.md` — the canonical performance numbers per release
- `tundra-test-fixtures-cookbook-v1.md` — every shared fixture and when to use it
