---
title: Local Development
description: Run Tundra from source with Docker Compose.
sidebar:
  order: 2
---

import { Steps, Aside } from '@astrojs/starlight/components'

## Quick start (Docker Compose)

<Steps>

1. **Clone**

   ```bash
   git clone https://github.com/mralaminahamed/tundra
   cd tundra
   ```

2. **Configure**

   ```bash
   cp docs/09-deployment-bundle/dev/.env.example docs/09-deployment-bundle/dev/.env
   # Edit if any ports clash (Postgres 5432, Valkey 6379, API 7400, Panel 5173)
   ```

3. **Start the stack**

   ```bash
   docker compose -f docs/09-deployment-bundle/dev/docker-compose.yml up -d
   ```

   Services:
   - `postgres` — PostgreSQL 18 on :5432
   - `valkey` — Valkey 8 on :6379
   - `mysql` — MySQL 8.4 on :3306
   - `tundrad` — cargo-watch (auto-reloads on Rust changes) on :7400
   - `panel-ui` — Vite HMR on :5173

4. **Wait for tundrad**

   ```bash
   docker compose -f docs/09-deployment-bundle/dev/docker-compose.yml logs -f tundrad
   # Wait for: tundrad listening addr="0.0.0.0:7400"
   ```

5. **Seed the database**

   ```bash
   docker exec tundra-dev-tundrad /target/debug/tundrad seed run
   ```

6. **Open the panel**

   Visit `http://localhost:5173` — you'll be redirected to `/login`.  
   Default credentials (after seed): `owner@example.com` / `correct horse battery staple`

</Steps>

## Common tasks

```bash
# View tundrad logs
docker compose -f docs/09-deployment-bundle/dev/docker-compose.yml logs -f tundrad

# Restart after config change
docker compose -f docs/09-deployment-bundle/dev/docker-compose.yml restart tundrad

# Run a single Rust test
docker exec tundra-dev-tundrad cargo test -p tundrad-api auth::tests::login_rate_limit

# Run panel tests
cd panel && pnpm test --run
pnpm typecheck
pnpm lint

# Add a migration
sqlx migrate add <description>   # requires DATABASE_URL set
```

## Panel-only development

If you only need to work on the panel:

```bash
cd panel
pnpm install
E2E_BASE_URL=http://localhost:7400 pnpm dev
```

The Vite dev server proxies `/api/*` and `/ws/*` to `localhost:7400`.

<Aside type="tip">
The `VITE_API_BASE` env var is only used in production builds. In dev mode, Vite's proxy config handles API routing.
</Aside>
