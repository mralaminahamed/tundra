---
title: Docker Compose
description: Deploy Tundra using the production Docker Compose stack.
sidebar:
  order: 2
---

import { Steps, Aside } from '@astrojs/starlight/components'

## Production stack

<Steps>

1. **Clone and enter the production stack**

   ```bash
   git clone https://github.com/mralaminahamed/tundra
   cd tundra/docs/09-deployment-bundle/prod
   ```

2. **Configure**

   ```bash
   cp .env.example .env
   # Edit .env — required values:
   #   TUNDRA_HOSTNAME=panel.example.com
   #   ACME_EMAIL=ops@example.com
   #   TUNDRA_VERSION=1.0.0
   ```

3. **Generate secrets**

   ```bash
   bash scripts/generate-secrets.sh
   ```

   This creates `secrets/postgres_password.txt`, `secrets/valkey_password.txt`, and `secrets/master_key.bin` with mode `0400`. Run once — the script guards against re-runs.

   <Aside type="caution">
   Back up `secrets/master_key.bin` to offline, encrypted storage immediately. Losing it means losing all encrypted data.
   </Aside>

4. **Build and start**

   ```bash
   docker compose build
   docker compose up -d
   docker compose logs -f tundrad
   ```

5. **Complete setup**

   Visit `https://panel.example.com/setup` to create your owner account.

</Steps>

## Services

| Service | Image | Port |
|---------|-------|------|
| `postgres` | postgres:18-trixie | internal |
| `valkey` | valkey/valkey:8-alpine | internal |
| `tundrad` | built from source | internal |
| `panel-ui` | built from source | internal |
| `caddy` | caddy:2.10-alpine | 80, 443 |
| `workload-1` | built from source | internal |

All services are on an internal Docker network. Only Caddy is exposed on the host.

## Security hardening

The production stack applies:

- `read_only: true` on the tundrad container
- `security_opt: no-new-privileges:true`
- `cap_drop: ALL` with only `NET_BIND_SERVICE` added back
- Docker secrets for all credentials (never in environment variables)
- Caddy: HSTS, CSP, X-Frame-Options, X-Content-Type-Options headers

## Updating

```bash
# In docs/09-deployment-bundle/prod/
# 1. Update TUNDRA_VERSION in .env
# 2. Pull and rebuild
docker compose pull
docker compose up -d --build
docker compose logs -f tundrad
```

Migrations run automatically on startup.
