# Tundra Upgrade Guide

## v1.x → v1.x (patch / minor upgrades)

Minor and patch releases are always backward-compatible. Upgrade with:

```bash
sudo tundra upgrade
```

The upgrade process:
1. Downloads the new binary + verifies minisign signature
2. Dry-runs migrations (`migrate --plan`)
3. Applies migrations
4. Atomically swaps the binary
5. Restarts `tundrad` (30-second downtime at most)
6. Auto-rolls back if startup fails

No operator action required for routine upgrades.

## v1.x → v2.0 (future major upgrade)

**Note:** v2.0 is not yet planned. This section documents what a major upgrade would entail, so operators can plan their infrastructure accordingly.

### What will change in v2.0

Based on the current roadmap:

- **HA mode** — the schema will add replication control tables; migrations will be included
- **Agent-side WASM plugins** — new tables for agent plugin state; additive, backward-compatible
- **OAuth 2.1 for MCP** — new tables for OAuth flows alongside bearer tokens; additive
- **Plugin API v2** — if WIT interfaces change, there will be a compatibility shim period

### What will NOT change in v2.0

- The operator-facing CLI (`tundra` command structure)
- The PostgreSQL role/database name (`tundra`)
- The directory layout (`/var/lib/tundra/`, `/etc/tundra/`)
- The `tundrad.service` systemd unit name
- The REST API surface for v1 endpoints (versioned under `/api/v1/`)
- The agent mTLS protocol (same gRPC service, additive methods only)
- The self-backup format (new fields may be added; old formats are readable)

### Migration discipline

Tundra uses up-only migrations. There is no `down` migration. Rolling back a v2.0 deploy means:
1. Code rollback (restore previous binary)
2. Forward migration to make the old binary compatible (if needed)

This is documented in the Database Schema §8. Plan your v2.0 upgrade during a maintenance window with a fresh self-backup taken immediately before.

## Database migration policy

- Migrations run in a single transaction per file (unless explicitly opted out)
- Every `migrations/` file is append-only; no file is ever modified after release
- Migration file names follow: `YYYYMMDDNNNNNN_<description>.sql`
- The `_sqlx_migrations` table tracks applied migrations

If a migration fails:
```bash
sudo -u tundra tundrad migrate --status   # see what applied
```

See the Deployment Runbook §6.5 for recovery procedures.

## Pinned upgrades

To upgrade to a specific version (e.g., after staging validation):

```bash
sudo tundra upgrade --version 1.2.4
```

## Air-gapped upgrades

See the Deployment Runbook §3.4 for the manual procedure when internet access is restricted.
