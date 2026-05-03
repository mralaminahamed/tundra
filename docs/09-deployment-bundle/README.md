# Tundra — Docker Compose stacks

Three Compose stacks plus the Dockerfiles they share.

| Stack | Use when | Key features |
|-------|----------|--------------|
| **`dev/`** | You are working on the Tundra codebase itself. | Source-mounted `tundrad` with `cargo-watch` hot reload, Vite dev server with HMR, ephemeral state, deterministic dev-mode owner. |
| **`prod/`** | You are running Tundra to manage your own infrastructure and prefer Compose over the systemd-native install. | Prebuilt images (built locally from the Dockerfiles), persistent named volumes, Docker secrets, healthchecks, restart policies, `read_only` rootfs where possible, edge Caddy with ACME. |
| **`e2e/`** | You are running the Playwright end-to-end suite from `tundra-test-plan-v1.md` §5.4. | `TUNDRA_TEST_MODE=1`, `POST /test/reset` endpoint, tmpfs-only state, deterministic seed, fast (insecure) Argon2, optional second agent under `--profile multi-server`. |

---

## Author

Al Amin Ahamed — [@mralaminahamed](https://github.com/mralaminahamed) on GitHub and X.

## Layout

```
tundra-docker/
├── README.md                           ← this file
├── dockerfiles/                        ← shared by prod & e2e (and built independently for dev)
│   ├── Dockerfile.tundrad              ← multi-stage Rust build → debian:trixie-slim
│   ├── Dockerfile.tundra-agent         ← agent + tundra CLI in one image
│   ├── Dockerfile.panel-ui             ← pnpm/Vite build → Caddy static-file server
│   ├── Dockerfile.workload             ← representative "managed server": Caddy + PHP-FPM + supervisord + agent
│   ├── panel-ui/Caddyfile
│   └── workload/{Caddyfile,supervisord.conf}
├── dev/
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── config/
│   │   ├── tundrad.dev.toml
│   │   └── agent.dev.toml
│   └── scripts/
│       └── postgres-init.sql
├── prod/
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── tundrad.env
│   ├── caddy/Caddyfile                 ← edge TLS termination, security headers, WS proxy
│   ├── config/
│   │   ├── tundrad.prod.toml
│   │   └── agent.prod.toml
│   └── scripts/
│       ├── generate-secrets.sh         ← run once before first start
│       └── postgres-init.sql
└── e2e/
    ├── docker-compose.yml
    ├── config/
    │   ├── tundrad.e2e.toml
    │   └── agent.e2e.toml
    └── scripts/
        ├── postgres-init.sql
        └── test-helpers.sh             ← wait-ready, reset-state, full-cycle
```

## Build context

All three stacks point their `build.context` at the repository root (`../` relative to the stack), so the Dockerfiles in `dockerfiles/` see the full Rust workspace and the `panel/` subdirectory. The expected repo layout the Compose stacks build against is the one documented in `tundra-technical-implementation-plan-v3.md` §11.3.

## Prerequisites

- Docker Engine 25+ with Compose v2.30+.
- BuildKit enabled (default on modern Docker).
- For `dev/`: at least 8 GB RAM available to Docker; first cargo build is heavy.
- For `prod/`: a public hostname pointing at the host, ports 80 + 443 open inbound, a real email for ACME notifications.
- For `e2e/`: 4 GB RAM and a Docker daemon that allows `tmpfs` mounts.

## Quickstart

### Dev

```bash
cd dev/
cp .env.example .env
docker compose up
# Vite dev server: http://localhost:5173
# tundrad health:  http://localhost:7400/api/v1/healthz
# Owner sign-in:   owner@example.test / developmentonly
```

### Prod

```bash
cd prod/
cp .env.example .env
$EDITOR .env                          # set TUNDRA_HOSTNAME, ACME_EMAIL, BACKUP_GPG_RECIPIENT
./scripts/generate-secrets.sh         # creates secrets/ — back up master_key.bin offline!
docker compose build                  # builds tundrad/agent/panel-ui/workload locally
docker compose up -d
docker compose logs -f tundrad
# Then visit https://${TUNDRA_HOSTNAME}/setup
```

### E2E

```bash
cd e2e/
./scripts/test-helpers.sh full-cycle up
# tundrad:  http://localhost:7400
# panel-ui: http://localhost:5173
# Owner:    owner@example.com / "correct horse battery staple"
# Then run Playwright from the panel/ workspace:
cd ../../tundra/panel
pnpm playwright test --project=e2e

# Tear down (volumes included):
cd ../../tundra-docker/e2e
./scripts/test-helpers.sh full-cycle down
```

## Companion documents

These compose files are operational artifacts. The architectural and procedural depth lives in the dedicated specifications:

- `tundra-technical-implementation-plan-v3.md` — overall architecture; §3 covers the stack versions these images target.
- `tundra-database-schema-v1.md` — the schema the `postgres-init.sql` and migrations bring up.
- `tundra-deployment-runbook-v1.md` — the systemd-native install. Read it before choosing the prod compose stack: systemd hardening (e.g. `ProtectSystem=strict`, `SystemCallFilter`) is stricter than Docker's; the compose stack is a convenience deployment, not a security upgrade.
- `tundra-deployment-overview-v1.md` — operator-facing first-time install, upgrade, restore.
- `tundra-security-audit-v1.md` — the threat model these images implement; §6.3 (network exposure), §8 (cryptographic design), §11 (operational security) all apply.
- `tundra-test-plan-v1.md` §5.4 — the e2e harness these images serve.

## Notes on production posture

The production compose stack is a viable deployment, but a few things to know:

1. **`prod/` is not a substitute for the systemd install** for security-sensitive deployments. The runbook's systemd unit has hardening (`ProtectSystem`, `SystemCallFilter`, etc.) that Docker's `security_opt` cannot fully replicate. For workloads where that matters, run `tundrad` directly on the host and use Docker only for the managed-workload containers.

2. **Self-backup is wired up but disabled by default.** The `self-backup` service is in the `tools` profile so it does not auto-start. Enable it via a host cron / systemd timer that runs `docker compose --profile tools run --rm self-backup`, or run `tundra-self-backup.timer` on the host directly.

3. **The `tundra-internal` network is `internal: true`** — Postgres and Valkey have no internet egress. `tundrad` is on both `tundra-internal` and `tundra-edge`. The workload network is separate so a compromised workload cannot reach Postgres directly.

4. **Master-key location.** The master key lives in a Docker secret backed by `secrets/master_key.bin` on the host. This is acceptable for a Compose deployment, but a more robust posture (TPM, KMS) is on the v2 roadmap of `tundra-security-audit-v1.md` §11.

5. **No HA.** All three stacks are single-host. HA (v1.5+ in the roadmap) is not configured here.

## Notes on dev iteration

- `cargo-watch` rebuilds `tundrad` on any change in `crates/`, `migrations/`, or `Cargo.toml`/`Cargo.lock`. Expect ~5–15 s incremental rebuilds on a modern laptop.
- Vite HMR handles panel UI changes in <500 ms.
- The dev workload container reads the agent config from `dev/config/agent.dev.toml`. To exercise per-site agent behaviour, drop manifest files under the workload's `/srv/sites/`.
- To wipe and start clean: `docker compose down -v`. The `cargo-target` and `panel-node-modules` volumes are preserved across `down` (without `-v`) so subsequent rebuilds are fast.

## License & ownership

This stack is part of the Tundra project. See the project root `LICENSE`. Authorship and maintenance is by Al Amin Ahamed personally.
