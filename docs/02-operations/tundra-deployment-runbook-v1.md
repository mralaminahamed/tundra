# Tundra — Deployment Runbook (Engineering Edition)

> The deeper reference for installing, upgrading, recovering, and operating Tundra at the systemd-and-PostgreSQL level.
> Companion to the Operator Edition; this document picks up where that one says "see the Engineering Edition."

---

**Author:** Al Amin Ahamed
**GitHub:** [@mralaminahamed](https://github.com/mralaminahamed)
**X:** [@mralaminahamed](https://x.com/mralaminahamed)

**Document Version:** v1.0
**Document Date:** May 2026
**Companion to:** `tundra-deployment-overview-v1.md`
**Audience:** Engineering — DevOps engineers, SREs, contributors maintaining Tundra deployments

---

## 1. Scope

This document covers the operations the Operator Edition defers: manual install, upgrade rollback, master-key rotation, agent cert recovery, HA bring-up, and the troubleshooting trees for "the panel is down" / "an agent is offline" / "a deploy is stuck."

It assumes Linux fluency: systemd, PostgreSQL admin, `journalctl`, `ss`, `tcpdump`. Where a procedure has irreversible consequences, a `⚠ DESTRUCTIVE` callout precedes it.

---

## 2. Manual Install

The one-line installer is `curl ... | bash`. This section documents what it does so you can do it by hand — for air-gapped installs, custom layouts, or environments where piping to `bash` is forbidden by policy.

### 2.1 Prerequisites

```bash
# Ubuntu 24.04 / Debian 12
sudo apt-get update
sudo apt-get install -y \
  postgresql-18 postgresql-contrib-18 \
  valkey-server \
  caddy \
  ca-certificates curl gnupg lsb-release \
  jq

# Required for tundrad: PostgreSQL extensions
sudo -u postgres psql -c "ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements,auto_explain';"
sudo systemctl restart postgresql@18-main
```

PostgreSQL 18 may not be in your distro's default apt repository. Use the official PG Apt repo:

```bash
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
  https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | \
  sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt-get update
sudo apt-get install -y postgresql-18 postgresql-contrib-18
```

### 2.2 Create the System User

```bash
sudo useradd --system --home-dir /var/lib/tundra --shell /usr/sbin/nologin tundra
sudo install -d -o tundra -g tundra -m 0750 /var/lib/tundra
sudo install -d -o tundra -g tundra -m 0750 /var/lib/tundra/data
sudo install -d -o tundra -g tundra -m 0750 /var/lib/tundra/logs
sudo install -d -o tundra -g tundra -m 0750 /var/lib/tundra/artifacts
sudo install -d -o tundra -g tundra -m 0750 /var/lib/tundra/backups
sudo install -d -o tundra -g tundra -m 0750 /var/lib/tundra/plugins
sudo install -d -o tundra -g tundra -m 0750 /var/lib/tundra/tmp
sudo install -d -o tundra -g tundra -m 0700 /var/lib/tundra/data/ca
sudo install -d -o tundra -g tundra -m 0700 /var/lib/tundra/data/jwks
```

### 2.3 Create the Database

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE tundra WITH LOGIN PASSWORD 'CHANGE-ME-USE-OPENSSL-RAND';
CREATE DATABASE tundra OWNER tundra ENCODING 'UTF8' LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8' TEMPLATE template0;
\c tundra
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "citext";
SQL
```

Generate the actual password with `openssl rand -base64 32`. Store it in `/etc/tundra/tundrad.env` (mode 0640, owned by `tundra:tundra`).

### 2.4 Generate the Master Key

```bash
sudo -u tundra bash -c '
  umask 077
  head -c 32 /dev/urandom > /var/lib/tundra/data/master.key
'
sudo chmod 0400 /var/lib/tundra/data/master.key
sudo chown tundra:tundra /var/lib/tundra/data/master.key
```

The master key must be 32 bytes (AES-256-GCM key length). Mode `0400` and root-only `chmod` after, so even the `tundra` user can only read it (which is what `tundrad` does at startup).

### 2.5 Install the Binary

Verify the signature against Tundra's release public key:

```bash
TUNDRA_VERSION="1.0.0"
ARCH="$(uname -m)"
curl -fsSL -o tundrad.tar.zst \
  "https://github.com/mralaminahamed/tundra/releases/download/v${TUNDRA_VERSION}/tundrad-${TUNDRA_VERSION}-linux-${ARCH}.tar.zst"
curl -fsSL -o tundrad.tar.zst.sig \
  "https://github.com/mralaminahamed/tundra/releases/download/v${TUNDRA_VERSION}/tundrad-${TUNDRA_VERSION}-linux-${ARCH}.tar.zst.sig"
curl -fsSL -o tundra-release.pub \
  "https://tundra.dev/release-keys/v1.pub"

minisign -V -p tundra-release.pub -m tundrad.tar.zst -x tundrad.tar.zst.sig

tar --use-compress-program=unzstd -xf tundrad.tar.zst
sudo install -m 0755 tundrad /usr/local/bin/tundrad
sudo install -m 0755 tundra /usr/local/bin/tundra
sudo install -m 0755 tundra-self-backup /usr/local/bin/tundra-self-backup
sudo install -m 0755 tundra-restore /usr/local/bin/tundra-restore
```

### 2.6 Configure `tundrad`

`/etc/tundra/tundrad.toml`:

```toml
[server]
listen_addr = "127.0.0.1:7400"
public_url  = "https://panel.example.com"

[database]
url = "postgres://tundra@/tundra?host=/var/run/postgresql"
max_connections = 50

[valkey]
url = "redis://127.0.0.1:6379"
db_cache = 0
db_queue = 1

[paths]
data_dir = "/var/lib/tundra/data"
log_dir  = "/var/lib/tundra/logs"
artifacts_dir = "/var/lib/tundra/artifacts"

[security]
master_key_path = "/var/lib/tundra/data/master.key"
session_max_age_hours = 720
require_2fa_for_owners = true

[agent]
heartbeat_interval_secs = 30
cert_validity_days = 90
cert_renewal_window_days = 30
```

`/etc/tundra/tundrad.env`:

```env
DATABASE_PASSWORD=...the password generated in §2.3...
TUNDRAD_PROFILE=production
RUST_LOG=tundrad=info,tower_http=info
```

Permissions: `chmod 0640 /etc/tundra/tundrad.env`, `chown tundra:tundra /etc/tundra/tundrad.env`.

### 2.7 Systemd Unit

`/etc/systemd/system/tundrad.service`:

```ini
[Unit]
Description=Tundra control-plane daemon
After=network-online.target postgresql.service valkey-server.service
Requires=postgresql.service valkey-server.service
Wants=network-online.target

[Service]
Type=notify
User=tundra
Group=tundra
WorkingDirectory=/var/lib/tundra
Environment=TUNDRAD_CONFIG=/etc/tundra/tundrad.toml
EnvironmentFile=/etc/tundra/tundrad.env
ExecStart=/usr/local/bin/tundrad serve
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=3s
TimeoutStartSec=60s
TimeoutStopSec=30s
LimitNOFILE=65535

# Hardening
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectHome=true
ProtectSystem=strict
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ProtectClock=true
ProtectKernelLogs=true
ProtectHostname=true
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
LockPersonality=true
MemoryDenyWriteExecute=false   # disabled because Wasmtime requires WX
ReadWritePaths=/var/lib/tundra
ReadWritePaths=/var/log/tundra
CapabilityBoundingSet=

[Install]
WantedBy=multi-user.target
```

Note that `MemoryDenyWriteExecute` is `false` because Wasmtime needs to JIT-compile WASM plugins. In a non-WASM build (a future option), this should be flipped to `true`.

### 2.8 Migrate the Database, Then Start

```bash
sudo -u tundra /usr/local/bin/tundrad migrate
sudo systemctl daemon-reload
sudo systemctl enable --now tundrad
```

Verify:

```bash
sudo systemctl status tundrad
curl -fsS http://127.0.0.1:7400/api/v1/healthz
```

### 2.9 Reverse-Proxy via Caddy

`/etc/caddy/Caddyfile`:

```
panel.example.com {
    reverse_proxy 127.0.0.1:7400 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
        flush_interval -1     # Flush WebSocket frames immediately
    }
    encode gzip zstd

    log {
        output file /var/log/caddy/panel.log
        format json
    }
}
```

```bash
sudo systemctl reload caddy
```

Caddy handles ACME for the panel hostname automatically.

### 2.10 Generate the Setup Token

```bash
sudo -u tundra /usr/local/bin/tundra setup print-link
```

This prints `https://panel.example.com/setup?token=...`, valid for 30 minutes. Visit, complete the wizard, done.

---

## 3. Upgrades

### 3.1 The Happy Path

```bash
sudo tundra upgrade
```

What this command does internally:

1. Fetches the latest release manifest from `https://tundra.dev/releases/stable.json`.
2. Downloads the new binary tarball + signature; verifies with `minisign`.
3. Stages the new binary at `/usr/local/bin/tundrad.next`.
4. Runs `tundrad.next migrate --plan` to dry-run any migrations; aborts on conflict.
5. Runs `tundrad.next migrate` to apply migrations against the live database.
6. Atomically swaps `tundrad.next` → `tundrad`, keeping the previous as `tundrad.previous`.
7. `systemctl restart tundrad`. The new binary inherits the listening socket via socket activation, so connections aren't dropped.
8. Watches `tundrad` for 60 seconds; if it doesn't reach `READY` state, runs the rollback (§3.3).

### 3.2 Pinned Upgrade

To upgrade to a specific version:

```bash
sudo tundra upgrade --version 1.2.4
```

Useful when you've tested 1.2.4 in staging and don't want `latest` to drift.

### 3.3 Rollback

If `tundrad` fails to start within the watchdog window, `tundra upgrade` automatically:

1. Stops `tundrad`.
2. Restores `tundrad.previous` to `tundrad`.
3. Starts `tundrad` from the previous binary.
4. Exits non-zero with a diagnostic.

If migrations were applied, the rollback **does not** undo them — Tundra's discipline is up-only migrations (see Database Spec §8). The previous binary is forward-compatible with one minor version of schema, so rolling back from 1.2.0 → 1.1.x is generally safe; from 1.2.0 → 1.0.x may not be.

If you need to roll back a release that included a breaking schema change, the path is restore-from-backup (§7).

### 3.4 Manual Upgrade (No Internet)

For air-gapped hosts:

```bash
# On a connected host
TUNDRA_VERSION=1.2.4
ARCH=x86_64
curl -fsSL -o tundrad.tar.zst \
  "https://github.com/mralaminahamed/tundra/releases/download/v${TUNDRA_VERSION}/tundrad-${TUNDRA_VERSION}-linux-${ARCH}.tar.zst"
# Transfer to the air-gapped host

# On the target host
tar -xf tundrad.tar.zst
sudo install -m 0755 tundrad /usr/local/bin/tundrad.next

sudo -u tundra /usr/local/bin/tundrad.next migrate --plan   # review plan
sudo -u tundra /usr/local/bin/tundrad.next migrate
sudo systemctl stop tundrad
sudo mv /usr/local/bin/tundrad /usr/local/bin/tundrad.previous
sudo mv /usr/local/bin/tundrad.next /usr/local/bin/tundrad
sudo systemctl start tundrad
```

---

## 4. The Master Key

The master key at `/var/lib/tundra/data/master.key` is the root of the encryption tree. Loss = unrecoverable encrypted columns. Compromise = every encrypted secret must be rotated.

### 4.1 Backing Up the Master Key

The self-backup includes the master key (encrypted under the operator's GPG public key). For redundancy, keep an offline copy outside the self-backup chain:

```bash
sudo cat /var/lib/tundra/data/master.key | \
  gpg --encrypt --recipient '<owner-email>' --armor > tundra-master-key-$(date +%Y%m%d).asc
# Print the .asc, store in physical safe. Or split with shamir's secret sharing.
```

This step exists because the self-backup target itself could be lost; the master key is the last line of defense.

### 4.2 Rotating the Master Key

`⚠ DESTRUCTIVE` if interrupted mid-operation. Run during a maintenance window.

```bash
sudo systemctl stop tundrad
sudo -u tundra /usr/local/bin/tundra master-key rotate \
  --new-key-path /var/lib/tundra/data/master.key.new \
  --backup-old /var/lib/tundra/data/master.key.$(date +%Y%m%d-%H%M%S)
```

What this does:

1. Generates a new 32-byte key at `master.key.new`.
2. Iterates every encrypted column in the database in batches of 1000 rows.
3. For each row: decrypts under the old key, re-encrypts under the new key, updates atomically.
4. Verifies the row count matches before and after for every encrypted table.
5. Atomically renames `master.key.new` → `master.key`.
6. Prints a summary: rows touched per table, duration, sha256 of the old and new keys.

```bash
sudo systemctl start tundrad
```

The old key file (timestamped) is kept on disk; do not delete it until you have verified all subsequent self-backups decrypt successfully.

### 4.3 If Rotation Crashes Halfway

The rotation marks each row with a `key_version` column. If interrupted, restart:

```bash
sudo -u tundra /usr/local/bin/tundra master-key rotate --resume
```

The tool detects partial state and continues from the last completed batch. Both keys (old and new) must be present.

If both keys are lost mid-rotation, only restore-from-backup recovers.

---

## 5. Agent Credentials & Recovery

The agent on each managed server presents an mTLS client cert issued by Tundra's internal CA at install time. Rotation is automatic on a 60-day cadence (cert validity 90 days, renewal 30 days before expiry).

### 5.1 Inspecting Agent Cert State

```bash
# On the control plane
sudo -u tundra /usr/local/bin/tundra agent cert list

# Output:
# server               status   issued       expires     fingerprint
# vps-fra-01.example   ACTIVE   2026-04-12   2026-07-11  sha256:9c4a...
# vps-blr-01.example   ACTIVE   2026-04-13   2026-07-12  sha256:7b21...
# vps-mum-01.example   EXPIRED  2026-01-20   2026-04-20  sha256:f015...
```

### 5.2 Force-Issuing a New Agent Cert

If an agent's cert has expired (the agent has been offline beyond renewal window) or you suspect compromise:

```bash
sudo -u tundra /usr/local/bin/tundra agent cert issue vps-fra-01.example.com \
  --revoke-existing
```

This produces a new cert + key pair and prints a one-line install command:

```
ssh tundra@vps-fra-01.example.com 'curl -fsSL https://panel.example.com/agent/install | \
  sudo bash -s -- --enrollment-token=eyJh...'
```

Run that on the agent host. The agent picks up the new credentials, the old fingerprint is revoked in `agent_credentials`, the agent reconnects.

### 5.3 Rotating the CA Itself

`⚠ DESTRUCTIVE` and rare. Required if Tundra's CA private key is suspected of compromise.

```bash
sudo -u tundra /usr/local/bin/tundra ca rotate
```

This:

1. Generates a new CA root + intermediate.
2. Issues new certs for every active agent under the new CA, distributing them via the standard rotation channel.
3. Marks the old CA as "trust on overlap" for 24 hours so agents that haven't picked up the new cert can still connect.
4. After 24 hours, the old CA is removed from the trust store.

If any agents fail to rotate within the overlap window, they will go offline and need manual cert re-issue (§5.2).

---

## 6. Troubleshooting Trees

### 6.1 "The panel is unreachable"

```
panel returns connection refused
├── systemctl status tundrad
│   ├── activating → wait 60s, watch journalctl -u tundrad -f
│   ├── active (running) → check Caddy:
│   │   ├── systemctl status caddy → not running → systemctl start caddy
│   │   ├── caddy validate /etc/caddy/Caddyfile → fix syntax
│   │   └── ss -tlnp | grep 443 → port held by something else (nginx?)
│   └── failed → continue below
└── journalctl -u tundrad -n 200
    ├── "FATAL: ... password authentication failed"
    │   → DATABASE_PASSWORD in /etc/tundra/tundrad.env mismatched
    ├── "FATAL: ... master key file ... permission denied"
    │   → chmod 0400; chown tundra:tundra /var/lib/tundra/data/master.key
    ├── "Address already in use"
    │   → another process on 7400; ss -tlnp | grep 7400
    ├── "migration ... failed"
    │   → migration error; see §6.5
    └── (no obvious cause)
        → run tundrad in foreground for verbose output:
          sudo -u tundra TUNDRAD_LOG=debug /usr/local/bin/tundrad serve
```

### 6.2 "An agent is offline"

```
agent shows offline in panel
├── on the agent host: systemctl status tundra-agent
│   ├── inactive → systemctl start tundra-agent → check journalctl
│   ├── failed → journalctl -u tundra-agent -n 100
│   │   ├── "certificate has expired"
│   │   │   → §5.2 (force-issue new cert)
│   │   ├── "connection refused" / "no route to host"
│   │   │   → check control-plane reachability:
│   │   │     curl -v https://panel.example.com/api/v1/agent-handshake
│   │   ├── "certificate verify failed"
│   │   │   → control plane CA changed; §5.3 mid-rotation
│   │   └── (other) → see §6.5
│   └── active (running) → continue below
└── on the control plane:
    └── tundra agent cert list <hostname> → check expiry
        AND
        tundra event tail --filter "actor.id=<server-id>"
        → see what events the agent has emitted recently
```

### 6.3 "A deploy is stuck"

```
deploy in 'running' state for > 30 minutes
├── tundra site deploy logs <site> --deployment <id>
│   → look for the last log line; that's where it's hanging
├── on the agent:
│   ├── ps aux | grep tundra-agent
│   │   → is the build process actually running?
│   ├── ls /var/lib/tundra-agent/state/locks/
│   │   → is there an orphaned lock?
│   └── df -h /srv
│       → out of disk?
└── recovery:
    tundra site deploy cancel <site> --deployment <id>
    → marks deployment as 'cancelled'
    → agent terminates the build process
    → site continues serving the previous release
```

### 6.4 "PostgreSQL is bloated / slow"

Tundra ships with a routine maintenance timer (`tundra-maintenance.timer`, runs nightly 03:00). If you've disabled it, or want to run it on demand:

```bash
sudo -u tundra /usr/local/bin/tundra maintenance run
```

This performs:

- `VACUUM ANALYZE` on hot tables (`audit_log`, `metrics_samples`, `deployments`).
- Detaches `metrics_samples` partitions older than 90 days.
- Exports detached partitions to Parquet at `/var/lib/tundra/archive/metrics/`.
- Drops detached partitions.
- Prunes resolved alerts older than 60 days.

For deeper investigation:

```sql
-- Top tables by size
SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) AS size
FROM pg_class WHERE relkind='r' ORDER BY pg_total_relation_size(oid) DESC LIMIT 10;

-- Long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity WHERE state = 'active' ORDER BY duration DESC LIMIT 10;

-- Bloat estimate per table
SELECT schemaname, relname, n_dead_tup, n_live_tup,
       round(100 * n_dead_tup::numeric / NULLIF(n_live_tup,0), 2) AS dead_pct
FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;
```

### 6.5 "A migration failed"

```bash
sudo -u tundra /usr/local/bin/tundrad migrate --status
```

shows applied vs pending migrations.

If a migration partially applied (rare, since Tundra runs each migration in a single transaction unless explicitly opted out):

```sql
-- Check the migrations table
SELECT * FROM _sqlx_migrations ORDER BY installed_on DESC LIMIT 10;
-- success=false rows indicate a partial apply
```

The recovery path is migration-specific. For most migrations, manually completing the migration's intent (running the remaining DDL) and inserting the row in `_sqlx_migrations` is the answer. **Always** snapshot the database before doing this:

```bash
sudo -u postgres pg_dump --format=custom tundra > /tmp/before-recovery-$(date +%Y%m%d-%H%M%S).pgdump
```

Document the recovery in an incident postmortem. Open an issue against Tundra so the migration can be made more robust.

---

## 7. Self-Backup & Restore

The Operator Edition covers configuration. This section covers what's actually inside the bundle and how restore works at the level of "what would I run by hand."

### 7.1 Anatomy of a Self-Backup

```
tundra-backup-2026-05-02-023000.tar.gpg
└─ (gpg-decrypted) tundra-backup-2026-05-02-023000.tar
   ├── manifest.json                     # version, host, sha256s
   ├── postgres/
   │   └── tundra.dump                   # pg_dump --format=custom
   ├── data/
   │   ├── master.key
   │   ├── ca/                           # internal CA cert + key
   │   ├── jwks/                         # signing keys for sessions
   │   └── settings.json                 # exported settings table
   ├── plugins/
   │   └── installed/...                 # per-plugin manifests + data
   └── checksums.txt                     # sha256 of every file
```

### 7.2 Manual Backup

```bash
sudo -u tundra /usr/local/bin/tundra-self-backup \
  --gpg-recipient owner@example.com \
  --output /var/backups/tundra/manual-$(date +%Y%m%d-%H%M%S).tar.gpg
```

### 7.3 Manual Verify

```bash
gpg --decrypt < tundra-backup.tar.gpg | tar -tf - | head -20
# Look for manifest.json, postgres/tundra.dump, data/master.key
```

For deeper verification:

```bash
sudo /usr/local/bin/tundra-restore --verify-only --gpg-key /tmp/private.gpg \
  /var/backups/tundra/tundra-backup.tar.gpg
```

### 7.4 Restore Step by Step

```bash
# Halt any running tundrad
sudo systemctl stop tundrad

# Decrypt
gpg --decrypt --output tundra-backup.tar tundra-backup.tar.gpg

# Verify
sha256sum -c <(tar -xOf tundra-backup.tar checksums.txt)

# Extract manifest, sanity-check
tar -xOf tundra-backup.tar manifest.json | jq

# Re-create the database
sudo -u postgres dropdb --if-exists tundra
sudo -u postgres createdb tundra OWNER tundra ENCODING UTF8 \
  LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8' TEMPLATE template0

# Restore the dump
tar -xOf tundra-backup.tar postgres/tundra.dump | \
  sudo -u postgres pg_restore --dbname=tundra --no-owner --role=tundra

# Restore data/
sudo rm -rf /var/lib/tundra/data
sudo install -d -o tundra -g tundra -m 0750 /var/lib/tundra/data
tar -xf tundra-backup.tar -C /var/lib/tundra data/
sudo chown -R tundra:tundra /var/lib/tundra/data
sudo chmod 0400 /var/lib/tundra/data/master.key

# Verify the master key decrypts a known row
sudo -u tundra /usr/local/bin/tundra master-key verify
# expected: "OK: 14 encrypted columns sampled, all decrypt successfully"

# Start
sudo systemctl start tundrad
```

The `tundra-restore` tool wraps all of this; doing it by hand is the procedure for when the wrapper itself fails.

---

## 8. Cross-Server Site Migration

When a site needs to move from server A to server B without significant downtime:

```bash
sudo -u tundra /usr/local/bin/tundra site move <site-id> --to-server <new-server-id>
```

What happens:

1. Tundra acquires a lock on the site (no concurrent migration).
2. Tundra creates a new release on B from A's current release artifacts (sync via the agent).
3. If the application has a database, Tundra creates a new database on B (or on the database server B uses), pg_dumps from A, restores on B.
4. Tundra updates the site's `server_id` in a transaction.
5. Tundra issues a new TLS certificate on B if needed.
6. Tundra updates DNS A/AAAA records to point at B (if Tundra manages the DNS).
7. After successful health checks on B, Tundra retires the release on A and releases the lock.

If anything fails between steps 3 and 6, the site stays on A; the partially-prepared resources on B are cleaned up. Cross-server migration is one of the operations where the audit log is most useful — every step is recorded.

---

## 9. HA Mode (v1.5+ Roadmap; Notes Here)

v1.0 is single-control-plane. v1.5 adds a hot-standby mode where a second `tundrad` consumes Postgres logical replication and is ready to take over within ~30 seconds of the primary failing. This section sketches the design so v1.0 deployments can plan their topology with HA in mind.

The design:

- Postgres logical replication from primary to standby.
- The standby `tundrad` runs in `--read-only` mode — it accepts API reads, rejects writes with a redirect to the primary.
- A small heartbeat written by the primary to a dedicated table, monitored by the standby.
- A coordination layer (etcd or Postgres advisory locks via a third witness) elects which node is primary on failover.
- Agents reconnect to whichever side is primary; their certs are valid against either side because both share the CA.

Plan for HA from day one if you'll need it:

- Use a managed Postgres or set up streaming replication early.
- Keep `/var/lib/tundra/data/` on shared storage if you want simple failover; otherwise replicate the master key out-of-band as in §4.1.
- Put the panel hostname behind a small TCP-level load balancer that can health-check both sides.

The Operator Edition will be updated when v1.5 ships.

---

## 10. Maintenance Schedule

A short reference for what should run when:

| Task                                              | When                   | Tool                                           |
|---------------------------------------------------|------------------------|------------------------------------------------|
| `pg_dump` self-backup                             | daily 02:30            | `tundra-self-backup.timer`                     |
| Postgres VACUUM ANALYZE on hot tables             | nightly 03:00          | `tundra-maintenance.timer`                     |
| Detach + archive old `metrics_samples` partitions | nightly 03:00          | `tundra-maintenance.timer`                     |
| Renew TLS for the panel hostname                  | as needed              | Caddy (automatic)                              |
| Renew agent certs                                 | 30 days before expiry  | `tundrad` (automatic)                          |
| Renew Tundra release-signing trust store          | manual on Tundra major | operator                                       |
| Verify the latest self-backup                     | weekly (recommend)     | `tundra-self-backup verify`                    |
| Drill a full restore in staging                   | quarterly (recommend)  | manual                                         |
| Review audit log for anomalies                    | weekly (recommend)     | manual; see Security Audit Engineering Edition |

---

## 11. Document Control

| Version | Date     | Author         | Changes                                                                                                                                                                                        |
|---------|----------|----------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| v1.0    | May 2026 | Al Amin Ahamed | Initial engineering-edition deployment runbook. Full systemd unit, manual install, master-key rotation, agent cert recovery, troubleshooting trees, manual restore. HA roadmap notes for v1.5. |

**Companion Documents:**

- `tundra-deployment-overview-v1.md` — the operator-friendly version
- `tundra-database-schema-v1.md` — schema details referenced throughout
- `tundra-security-audit-v1.md` — threat model and key rotation context
- `tundra-test-plan-v1.md` — verification of release artifacts and migrations
