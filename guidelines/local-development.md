# Tundra — Local Development

Developer setup guide: run the full stack from source using Docker Compose or natively, configure the dev environment, and verify everything is wired up.

---

## Prerequisites

| Tool                | Minimum version                        | Install                                              |
|---------------------|----------------------------------------|------------------------------------------------------|
| Rust toolchain      | 1.95 (pinned in `rust-toolchain.toml`) | `rustup` — auto-applied on first `cargo` call        |
| Node.js             | 22                                     | [nodejs.org](https://nodejs.org) or `nvm install 22` |
| pnpm                | 10+                                    | `npm install -g pnpm` or `corepack enable`           |
| Docker + Compose v2 | Compose v2.30+                         | Docker Desktop or `docker compose` plugin            |
| `sqlx-cli`          | any recent                             | `cargo install sqlx-cli --locked`                    |

Optional but useful:
- `cargo-watch` — hot-reload Rust on save: `cargo install cargo-watch --locked`
- `cargo-deny` — license + advisory audit: `cargo install cargo-deny --locked`

---

## Option A — Docker Compose (recommended)

Runs everything in containers: PostgreSQL, Valkey, tundrad (with cargo-watch), the Vite panel, and a simulated workload node.

### 1. Copy the dev compose file

```bash
cp docs/09-deployment-bundle/dev/docker-compose.yml docker-compose.dev.yml
```

### 2. Create the env file

```bash
cat > .env.dev <<'EOF'
POSTGRES_PASSWORD=devsecret
POSTGRES_PORT=5432
VALKEY_PORT=6379
TUNDRAD_HTTP_PORT=7400
TUNDRAD_GRPC_PORT=7447
PANEL_UI_PORT=5173
WORKLOAD_HTTP_PORT=8080
WORKLOAD_HTTPS_PORT=8443
TUNDRA_REPO=.
EOF
```

Adjust any port that clashes with something already running (see "Check open ports" below).

### 3. Start the stack

```bash
docker compose -f docker-compose.dev.yml --env-file .env.dev up
```

First run is slow (~5 min) — Rust compiles from scratch inside the container.  
Subsequent starts reuse the `cargo-target` volume and are much faster.

### 4. Verify

```bash
# Control plane health
curl http://localhost:7400/api/v1/healthz

# Panel UI (opens browser)
open http://localhost:5173
```

Default dev credentials (auto-created — dev profile only):
- **Email:** `owner@example.test`
- **Password:** `developmentonly`

---

## Option B — Native (no Docker)

Better for tight iteration on Rust code. Requires PostgreSQL 18 and Valkey running locally.

### 1. Start PostgreSQL and Valkey

```bash
# macOS (Homebrew)
brew services start postgresql@18
brew services start valkey

# Linux (systemd)
sudo systemctl start postgresql@18-main valkey-server
```

Create the database and user:
```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE tundra WITH LOGIN PASSWORD 'devsecret';
CREATE DATABASE tundra OWNER tundra ENCODING 'UTF8'
  LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8' TEMPLATE template0;
\c tundra
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "citext";
SQL
```

### 2. Generate the master key

```bash
mkdir -p /tmp/tundra/data
head -c 32 /dev/urandom > /tmp/tundra/data/master.key
chmod 0400 /tmp/tundra/data/master.key
```

### 3. Set environment variables

```bash
export DATABASE_URL="postgres://tundra:devsecret@localhost:5432/tundra"
export VALKEY_URL="redis://localhost:6379"
export TUNDRAD_PROFILE=development
export RUST_LOG="tundrad=debug,tundra_agent=debug,tower_http=info,sqlx=warn"
export RUST_BACKTRACE=1
```

Add these to your shell profile or a `.envrc` (direnv).

### 4. Run migrations

```bash
sqlx migrate run
```

### 5. Start tundrad

```bash
# Plain run
cargo run -p tundrad-bin -- serve

# Hot-reload on source changes (requires cargo-watch)
cargo watch -w crates/ -w migrations/ -s 'cargo run -p tundrad-bin -- serve'
```

### 6. Start the panel dev server

```bash
cd panel
pnpm install
pnpm dev
```

Vite proxies `/api` → `http://localhost:7400` and `/ws` → `ws://localhost:7400` (configured in `panel/vite.config.ts`).

Open `http://localhost:5173`.

---

## Port map

| Service         | Default port | Env override          | What uses it                    |
|-----------------|--------------|-----------------------|---------------------------------|
| Panel UI (Vite) | `5173`       | `PANEL_UI_PORT`       | Browser                         |
| tundrad HTTP    | `7400`       | `TUNDRAD_HTTP_PORT`   | Panel, CLI, API clients         |
| tundrad gRPC    | `7447`       | `TUNDRAD_GRPC_PORT`   | tundra-agent (mTLS)             |
| PostgreSQL      | `5432`       | `POSTGRES_PORT`       | tundrad                         |
| Valkey          | `6379`       | `VALKEY_PORT`         | tundrad                         |
| Workload HTTP   | `8080`       | `WORKLOAD_HTTP_PORT`  | Site traffic (compose only)     |
| Workload HTTPS  | `8443`       | `WORKLOAD_HTTPS_PORT` | Site TLS traffic (compose only) |

### Check what's occupying a port

```bash
# macOS
lsof -i :<port>

# Linux
ss -tlnp | grep :<port>
# or
fuser <port>/tcp
```

### Free a stuck port (find the PID first)

```bash
# macOS / Linux
kill $(lsof -ti :<port>)
```

If 5432 is taken by an existing Postgres instance, change `POSTGRES_PORT` in `.env.dev` to e.g. `5433` and update `DATABASE_URL` to match.

---

## Configuration reference

Dev config lives in `docs/09-deployment-bundle/dev/config/tundrad.dev.toml` and is mounted read-only into the tundrad container. For native runs, point `TUNDRAD_CONFIG` at it:

```bash
export TUNDRAD_CONFIG="$(pwd)/docs/09-deployment-bundle/dev/config/tundrad.dev.toml"
```

Key settings and what to change:

### `[server]`

```toml
listen_addr = "0.0.0.0:7400"   # change port here if needed
public_url  = "http://localhost:7400"
```

`public_url` is used in emails and webhook callbacks. For dev it can stay as localhost.

### `[database]`

```toml
url             = "postgres://tundra:devsecret@postgres:5432/tundra"
max_connections = 20
```

For native runs change the host from `postgres` to `localhost`.

### `[valkey]`

```toml
url = "redis://valkey:6379"
```

Change `valkey` → `localhost` for native runs.

### `[paths]`

```toml
data_dir      = "/tmp/tundra/data"
log_dir       = "/tmp/tundra/logs"
artifacts_dir = "/tmp/tundra/artifacts"
```

tundrad creates these on startup if they don't exist.

### `[security]`

```toml
master_key_path       = "/tmp/tundra/data/master.key"
require_2fa_for_owners = false    # dev convenience
```

### `[security.dev]` — dev-only auto-login

```toml
auto_create_owner     = true
auto_owner_email      = "owner@example.test"
auto_owner_password   = "developmentonly"
```

tundrad refuses to load `[security.dev]` when `TUNDRAD_PROFILE=production`. Safe to leave in dev config.

### `[telemetry]`

```toml
otlp_endpoint = ""          # disabled; set to "http://localhost:4317" for local Jaeger
log_format    = "pretty"    # human-readable tracing output
```

---

## Verify the stack is healthy

```bash
# 1. Control plane responds
curl -s http://localhost:7400/api/v1/healthz | python3 -m json.tool

# 2. Database connectivity (from tundrad logs or directly)
psql postgres://tundra:devsecret@localhost:5432/tundra -c '\dt' | head -20

# 3. Valkey reachable
redis-cli -p 6379 ping    # → PONG
# or for Valkey CLI
valkey-cli -p 6379 ping

# 4. Panel proxy working
curl -s http://localhost:5173/api/v1/healthz   # goes through Vite proxy

# 5. Login via API
curl -s -c /tmp/tundra-cookies.txt \
  -X POST http://localhost:7400/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@example.test","password":"developmentonly"}' \
  | python3 -m json.tool
```

---

## Iterating on the panel

The Vite dev server has HMR — save a file, the browser updates instantly.

```bash
cd panel

pnpm typecheck          # run before committing
pnpm lint               # must be clean
pnpm test --run         # vitest one-shot
pnpm test               # vitest watch mode
```

Type generation (when `proto/openapi.yaml` changes):
```bash
pnpm run generate:types
```

---

## Iterating on the Rust backend

With `cargo-watch`:
```bash
cargo watch -w crates/ -w migrations/ -s 'cargo run -p tundrad-bin -- serve'
```

Without `cargo-watch`, rebuild manually:
```bash
cargo build -p tundrad-bin && ./target/debug/tundrad serve
```

After adding a migration:
```bash
sqlx migrate run
# cargo-watch picks up the binary restart automatically
```

Clippy must be clean before committing:
```bash
cargo clippy --workspace --all-targets -- -D warnings
```

---

## Reset the dev database

```bash
# Drop and recreate (loses all data)
dropdb -U tundra tundra
createdb -U tundra -E UTF8 tundra
sqlx migrate run

# Or with Docker Compose
docker compose -f docker-compose.dev.yml --env-file .env.dev down -v
docker compose -f docker-compose.dev.yml --env-file .env.dev up
```

---

## Common problems

### Port already in use

```
Error: address already in use (os error 98) — 0.0.0.0:7400
```

Find what's using it: `lsof -i :7400` (macOS) or `ss -tlnp | grep 7400` (Linux).  
Override: set `TUNDRAD_HTTP_PORT=7401` in `.env.dev` and restart.

### `DATABASE_URL` not set / connection refused

tundrad and sqlx-cli both read `DATABASE_URL`. Make sure it's exported:
```bash
export DATABASE_URL="postgres://tundra:devsecret@localhost:5432/tundra"
```

For Docker Compose the variable is injected automatically from the compose env.

### First cargo build very slow

Normal — Rust compiles ~80 workspace crates from scratch. The `cargo-target` volume (compose) or your local `target/` (native) caches incremental builds. Subsequent rebuilds are seconds, not minutes.

### `sqlx::migrate` fails — extension missing

Run the extensions SQL manually:
```bash
psql postgres://tundra:devsecret@localhost:5432/tundra \
  -f docs/09-deployment-bundle/dev/scripts/postgres-init.sql
sqlx migrate run
```

### Panel shows blank page / network error

Check the Vite proxy target. In `panel/vite.config.ts`:
```ts
proxy: {
  '/api': 'http://localhost:7400',
  '/ws': { target: 'ws://localhost:7400', ws: true },
}
```

If tundrad is on a different port, update this file to match.

### `master.key` not found

tundrad won't start without the key:
```bash
head -c 32 /dev/urandom > /tmp/tundra/data/master.key
chmod 0400 /tmp/tundra/data/master.key
```
