# Architecture

This document describes what the code in this repository does today. It is derived from the source, not from the specifications in `docs/01-architecture/`. Where the code is a stub or a library that no binary uses yet, the text says so.

## Crate layout

The Cargo workspace (`Cargo.toml`) has two groups of crates under `crates/`.

Control plane (`tundrad-*`):

| Crate | Role |
|---|---|
| `tundrad-bin` | Binary `tundrad`. Subcommands `serve`, `migrate` and master-key handling (`src/main.rs`). Depends on `tundrad-api`, `tundrad-config`, `tundrad-crypto`, `tundrad-telemetry`. |
| `tundrad-api` | Axum router and handlers (`src/lib.rs`, `src/routes/`), middleware (`src/middleware/`: CSRF, security headers, step-up). |
| `tundrad-repo` | SQLx repositories over PostgreSQL. |
| `tundrad-domain` | Domain types, for example `SiteMoveStatus` and `MOVE_STAGES` in `src/site_move.rs`. |
| `tundrad-auth`, `tundrad-crypto`, `tundrad-pki` | Authentication and authorisation, field encryption and key handling, certificate authority. |
| `tundrad-events` | Event bus on Valkey (`fred` client). |
| `tundrad-acme`, `tundrad-backup`, `tundrad-self-backup`, `tundrad-jobs` | Certificates, backups, scheduled work. |
| `tundrad-plugin-host`, `tundra-plugin-sdk`, `tundrad-plugin-*` | Wasmtime plugin host, plugin SDK and bundled plugins. `tundrad-plugin-mcp` is the exception: `tundrad-api` links it and serves it at `/mcp`. |
| `tundrad-grpc`, `tundra-agent-rpc`, `tundra-proto` | gRPC server library, agent client library and generated stubs from `proto/tundra/v1/agent.proto`. |

Agent and tooling (`tundra-*`):

| Crate | Role |
|---|---|
| `tundra-agent-bin` | Binary `tundra-agent`. Runs the reconciler loop. |
| `tundra-agent-reconciler` | Polls the control plane for queued deployments and reports status (`src/reconciler.rs`, `src/tundra_client.rs`). |
| `tundra-agent-providers` | Host-side provisioners: deploy pipeline (`src/deploy.rs`), systemd, runtimes, PHP-FPM, Postfix, Dovecot, PowerDNS and others. |
| `tundra-agent-metrics`, `tundra-agent-logs` | Metrics and log collection. |
| `tundra-cli` | Binary `tundra`. |

The React panel is in `panel/`. SQL migrations are in `migrations/`. Site and DNS templates are in `templates/`.

## Request flow

1. A browser or MCP client calls `tundrad` over HTTP. `tundrad-bin` binds a `TcpListener` and serves `tundrad_api::router(pool)` (`crates/tundrad-bin/src/main.rs`). The only state passed to handlers is the `PgPool`.
2. Operator routes under `/api/v1/` authenticate through the `AuthSession` extractor (`crates/tundrad-api/src/extractors.rs`). The router applies two layers: security headers and request tracing (`src/lib.rs`). The CSRF and step-up middleware modules exist in `src/middleware/` but nothing in the workspace applies them to the router.
3. Handlers check authorisation through `AuthzService`, call a `tundrad-repo` repository, and write an audit entry (`routes/site_moves.rs` shows the pattern).
4. Live updates go over a WebSocket (`routes/ws.rs`) that forwards Valkey pub/sub messages on `tundra:events:<channel>`.
5. Deployments are pull-based. `tundra-agent` polls `GET /api/v1/agent/deployments`, runs the pipeline in `tundra-agent-providers/src/deploy.rs`, and posts progress to `/api/v1/agent/deployments/{id}/status`.

The deploy pipeline stages are: fetching, building, assembling, slot start, health check, promoting, cleanup. Promotion creates `current.tmp` and renames it over `current` (`deploy.rs`, `promote`). Slot start, health check and stopping the old slot are log-only stubs in the current code.

## Data stores

- PostgreSQL holds all control-plane state. `tundrad serve` runs `sqlx::migrate!("../../migrations")` on startup. The `audit_log` table has a trigger that computes `chain_hash` on insert (`migrations/20260503000001_identity_and_access.sql`).
- Valkey carries event pub/sub only in the code reviewed. Both services are provisioned in `docs/09-deployment-bundle/*/docker-compose.yml` (`postgres:18-trixie`, `valkey/valkey:8-alpine`).
- Each managed server keeps release directories on disk. The agent retains the five newest and deletes older ones (`prune_old_releases`).

## Trust boundaries

- Browser to control plane: session extractor and security-header middleware. A CSRF double-submit check and a step-up check are implemented as middleware but are not applied to the router.
- MCP client to control plane: bearer token at `/mcp`.
- Agent to control plane: an HTTP request that carries an `X-Tundra-Server-Id` header. The extractor only checks that the server id exists in the `servers` table (`crates/tundrad-api/src/agent_auth.rs`). The agent client disables certificate verification (`tundra_client.rs`, `danger_accept_invalid_certs(true)`). The mTLS gRPC path described in `crates/tundrad-grpc/README.md` is not wired in: `tundra-agent-rpc` exposes only `connect_plaintext` (`src/client.rs`), and no binary starts a gRPC server.
- Plugins: `tundrad-plugin-host` configures Wasmtime with fuel, epoch interruption and a memory limit (`src/engine.rs`) and checks declared capabilities per call (`src/capability.rs`). No binary links this crate yet.
- Secrets at rest: encrypted by `tundrad-crypto`, keyed by a master key managed with `tundrad master-key`.

## Failure behaviour

- `GET /readyz` returns 503 with `"db":"unavailable"` when `SELECT 1` fails (`routes/health.rs`). `/healthz` does not touch the database.
- Startup fails if the database connection or a migration fails, because `serve` propagates the error.
- The reconciler logs a failed poll and tries again on the next tick (`reconciler.rs`). Errors from a deployment are recorded as status `failed` with the message.
- A failed promotion sends `DeployProgress::Failed` with the stage name and returns the error. Failure to prune old releases is logged and ignored.
- The cross-server site move handler spawns a task that writes each entry of `MOVE_STAGES` to the database and then completes the move. It performs no file, database or DNS work, and it ignores write errors (`routes/site_moves.rs`).
