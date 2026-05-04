# Tundra — Plesk Obsidian Migration Plan

> **Migration guide for moving sites, mailboxes, databases, and DNS from Plesk Obsidian to Tundra**  
> Covers in-place and parallel migration paths, scheduled and zero-downtime cutover strategies, and a complete feature-parity mapping.

---

**Author:** Al Amin Ahamed  
**GitHub:** [@mralaminahamed](https://github.com/mralaminahamed)  
**X:** [@mralaminahamed](https://x.com/mralaminahamed)

**Document Version:** v1.0  
**Document Date:** May 2026  
**Companion to:** `tundra-technical-implementation-plan-v2.md`  
**Status:** Implementation-Ready Specification  
**Source Panel:** Plesk Obsidian 18.0.75 – 18.0.77 (current line)

---

## 1. Executive Summary

### 1.1 Why a Migration Plan Matters

Tundra is a viable replacement for Plesk Obsidian only if existing operators can move their workloads to it without losing data, breaking sites, or absorbing unacceptable downtime. This document describes how a Plesk Obsidian server (or fleet) becomes a Tundra server (or fleet) with every domain, mailbox, database, certificate, scheduled task, DNS zone, and user account preserved, and with every Plesk feature mapped to a Tundra equivalent.

It is written for two audiences:

- **The operator** — who needs an actionable runbook with shell-level detail.
- **The Tundra developer** — who needs to know which migration capabilities must exist as native Tundra commands, agents, and importers, so the migration story is supported by the platform rather than being a one-off shell exercise.

### 1.2 Migration Scenarios Covered

| Scenario                  | Description                                                                                | Best For                                                                   |
|---------------------------|--------------------------------------------------------------------------------------------|----------------------------------------------------------------------------|
| **A. Parallel migration** | Tundra installed on a separate server; sites migrated one-by-one; DNS cutover per site     | Production workloads, near-zero downtime, ability to roll back             |
| **B. In-place migration** | Plesk uninstalled and Tundra installed on the same server; data preserved through the swap | Single-VPS deployments, cost-sensitive setups, accepted maintenance window |

For each scenario, two cutover strategies are documented:

- **Scheduled-window cutover** — accepts a short maintenance window (typically 15–60 minutes per site)
- **Zero-downtime cutover** — uses DNS pre-warming, dual-running, and TTL reduction to drop visible downtime to seconds

### 1.3 Migration Philosophy

1. **Preserve, don't translate.** Where Plesk and Tundra both wrap the same upstream tool (Postfix, Dovecot, MariaDB, Bind/PowerDNS), file formats and data carry over directly. The migration moves data, not concepts.
2. **One site at a time.** Each migration unit is a single site (domain + its applications + its databases + its mail). Failure of one migration never blocks others.
3. **Read-only on the source until cutover.** From the moment a site's data is captured to the moment DNS is cut over, the Plesk side is treated as read-only. This is enforced by maintenance pages, not honor system.
4. **Reversible until the cutover.** Until DNS is repointed, the Plesk side is fully functional. Operators can abort and resume normal Plesk operation up to that point.
5. **Verifiable.** Every migration produces a checksummed manifest of what was moved. The operator can verify byte-for-byte fidelity before cutover.

### 1.4 What This Document Does Not Cover

- Non-Plesk panels (cPanel, DirectAdmin, ISPConfig). Documented in future companion plans.
- Plesk *Onyx* (17.x). Onyx → Obsidian → Tundra is documented separately; running migrations directly from Onyx is untested.
- Windows-based Plesk installations. Tundra is Linux-only.
- Plesk reseller hierarchies. Tundra v1.0 is single-tenant; reseller customers must be flattened to operator accounts before migration.

---

## 2. Plesk Obsidian Inventory

Before migration begins, the operator must produce a complete inventory of what is on the Plesk server. Tundra ships a tool — `tundra-import plesk-inventory` — that performs this automatically by reading Plesk's database, configuration files, and filesystem layout.

### 2.1 Where Plesk Stores Things

Plesk's data layout on a Linux host is consistent across the Obsidian line:

| Plesk Asset                   | Filesystem Location                                                                                                               | Authority              |
|-------------------------------|-----------------------------------------------------------------------------------------------------------------------------------|------------------------|
| Plesk configuration           | `/etc/psa/`, `/usr/local/psa/admin/conf/`                                                                                         | Plesk                  |
| Plesk MySQL database (`psa`)  | `/var/lib/psa/` (data dir for Plesk's own MySQL)                                                                                  | Plesk internal MySQL   |
| Site document roots           | `/var/www/vhosts/<domain>/` with subdirs `httpdocs`, `httpsdocs`, `cgi-bin`, `logs`, `statistics`                                 | Plesk                  |
| Site PHP-FPM pools            | `/etc/php/<version>/fpm/pool.d/<domain>.conf` (Debian/Ubuntu) or `/opt/plesk/php/<version>/etc/php-fpm.d/`                        | Plesk                  |
| Nginx vhost configs           | `/etc/nginx/plesk.conf.d/vhosts/<domain>.conf`                                                                                    | Plesk                  |
| Apache vhost configs          | `/etc/apache2/plesk.conf.d/vhosts/<domain>.conf` (where Apache is in the stack)                                                   | Plesk                  |
| User MySQL/MariaDB databases  | `/var/lib/mysql/`                                                                                                                 | Server's MariaDB/MySQL |
| User PostgreSQL databases     | `/var/lib/postgresql/<ver>/main/`                                                                                                 | Server's PostgreSQL    |
| Mail spools (Dovecot/Maildir) | `/var/qmail/mailnames/<domain>/<local>/Maildir` (legacy qmail layout retained) or `/var/vmail/<domain>/<local>`                   | Plesk Mail             |
| Mail aliases & forwards       | Stored in the `psa` database, materialized to Postfix maps                                                                        | Plesk Mail             |
| DNS zone data                 | Stored in the `psa` database, materialized to BIND zone files in `/var/named/run-root/var/` (RHEL) or `/var/cache/bind/` (Debian) | Plesk DNS              |
| SSL certificates              | Stored in the `psa` database, materialized to `/etc/plesk/ssl/` and Nginx-referenced paths                                        | Plesk                  |
| Scheduled tasks               | Stored in the `psa` database, materialized to per-user crontabs                                                                   | Plesk                  |
| Backups                       | `/var/lib/psa/dumps/`                                                                                                             | Plesk Backup Manager   |
| FTP users                     | Stored in the `psa` database, materialized to ProFTPD/PureFTPd config                                                             | Plesk                  |
| Webalizer/AWStats statistics  | `/var/www/vhosts/<domain>/statistics/`                                                                                            | Plesk                  |

### 2.2 The Inventory Command

```bash
# Run on the Plesk source server
tundra-import plesk-inventory \
    --output /tmp/plesk-inventory.json \
    --include-sizes \
    --include-checksums
```

The command produces a JSON document listing every site, with the following per-site shape:

```json
{
  "domain": "example.com",
  "subscription_id": 42,
  "owner": "client_user_03",
  "ipv4": "203.0.113.45",
  "ipv6": "2001:db8::45",
  "document_root": "/var/www/vhosts/example.com/httpdocs",
  "php_version": "8.4.18",
  "php_handler": "fpm-event",
  "applications": [
    { "type": "wordpress", "version": "6.6.2", "path": "/" }
  ],
  "databases": [
    { "type": "mysql", "name": "wp_example_com", "user": "wp_example", "size_bytes": 184320512 }
  ],
  "ssl": {
    "issuer": "letsencrypt",
    "expires_at": "2026-07-15T00:00:00Z",
    "san": ["example.com", "www.example.com"]
  },
  "mail": {
    "domain_active": true,
    "mailboxes": [
      { "address": "info@example.com", "quota_mb": 2048, "size_mb": 412 }
    ],
    "aliases": [
      { "source": "sales@example.com", "destination": ["info@example.com"] }
    ],
    "dkim_selector": "default"
  },
  "dns": {
    "managed_by_plesk": true,
    "records": [...]
  },
  "scheduled_tasks": [
    { "command": "/usr/bin/php /var/www/vhosts/example.com/httpdocs/cron.php", "cron": "*/15 * * * *" }
  ],
  "ftp_users": [
    { "username": "example_ftp", "home": "/var/www/vhosts/example.com" }
  ],
  "size_bytes": {
    "files": 8520093184,
    "databases": 184320512,
    "mail": 432217600,
    "total": 9136631296
  }
}
```

The inventory is the source of truth for every subsequent migration step. It is committed to a per-migration audit directory with a SHA-256 checksum.

### 2.3 Pre-Migration Audit Checklist

Before cutting over a single site, the operator must confirm:

1. **Plesk version is supported** — Obsidian 18.0.70 or newer. Older builds may use deprecated APS apps that need separate handling.
2. **Disk free space** — at least 1.5× the largest site's total size, on both source and target.
3. **Network connectivity** — source can reach target on SSH (port 22) and HTTPS (port 443).
4. **DNS authority for each domain** — operator knows where DNS is hosted (Plesk, registrar, Cloudflare, etc.) and has credentials to change records.
5. **Mail TLS hostnames** — for any domain whose mail is migrated, the MX hostname's TLS certificate must cover the new server's hostname.
6. **Database engine compatibility** — MySQL 5.7 / MariaDB 10.x source databases are dump/restored to MySQL 8.4 or MariaDB 11.4 on Tundra; PostgreSQL 12+ source dumps restore to PostgreSQL 18 cleanly.
7. **PHP version availability** — every PHP version in use on Plesk is available on Tundra. PHP 7.x sites must either upgrade or stay pinned to a Tundra-installed legacy PHP.
8. **Custom Plesk extensions** — operator has identified any installed Plesk extensions and decided the disposition (drop, replace with Tundra equivalent, custom port).
9. **Backup taken** — a full Plesk backup exists outside both servers (Tier-0 safety net).

---

## 3. Migration Architecture

### 3.1 The `tundra-import` Tool

`tundra-import` is a first-party Tundra component, distributed as a single static binary. It runs on either:

- The **Plesk source server** — for inventory and capture operations
- The **Tundra target server** — for restore operations

Or as a remote operation orchestrated from the Tundra control plane via SSH.

Subcommands:

```bash
tundra-import plesk-inventory          # Phase 1: enumerate
tundra-import plesk-capture            # Phase 2: capture site data into a transferable bundle
tundra-import plesk-transfer           # Phase 3: ship the bundle to the Tundra server
tundra-import plesk-restore            # Phase 4: import the bundle into Tundra
tundra-import plesk-verify             # Phase 5: post-restore verification
tundra-import plesk-cutover            # Phase 6: DNS and mail cutover assistance
tundra-import plesk-finalize           # Phase 7: lock source side read-only, mark complete
```

### 3.2 The Migration Bundle Format

Each captured site produces a bundle: a single tar archive (optionally compressed with zstd, optionally encrypted with age):

```
example.com-20260502T143000Z.tundra-bundle.tar.zst.age
├── manifest.json              # full metadata, checksums, source versions
├── filesystem/
│   ├── document_root.tar.zst
│   ├── shared/
│   │   ├── wp-content-uploads.tar.zst   (or analogous shared paths)
│   │   └── private/
│   └── certificates/
│       ├── fullchain.pem
│       ├── chain.pem
│       └── privkey.pem
├── databases/
│   ├── mysql/
│   │   └── wp_example_com.sql.zst
│   └── postgres/
│       └── (none for this site)
├── mail/
│   ├── domain.json             # DKIM keys, aliases, forwards
│   ├── mailboxes/
│   │   └── info@example.com.tar.zst       (Maildir tarball)
│   └── sieve/
│       └── info@example.com.sieve
├── dns/
│   └── zone.json               # canonical record list
├── tasks/
│   └── scheduled.json
├── ftp/
│   └── users.json
└── nginx/
    └── source-vhost.conf       # the original Plesk-generated config, archived for reference
```

The bundle is **self-describing**: any future version of `tundra-import` can replay an old bundle. The `manifest.json` records source Plesk version, source OS, capture timestamp, and the `tundra-import` version that produced it.

### 3.3 Site State Machine During Migration

A site moves through six states during migration. The Tundra panel database tracks state per-site in a dedicated table (`migration_jobs` — see §10):

```
   ┌─────────┐   inventory    ┌────────────┐   capture   ┌──────────┐
   │ source  │ ─────────────> │ inventoried│ ──────────> │ captured │
   │ (Plesk) │                └────────────┘             └──────────┘
   └─────────┘                                                 │
                                                               │ transfer + restore
                                                               v
   ┌─────────┐   finalize    ┌──────────┐   cutover     ┌──────────┐
   │ retired │ <──────────── │ cut-over │ <──────────── │ restored │
   └─────────┘               └──────────┘               └──────────┘
```

| State         | Source server status                   | Target server status                                                                               | Public-facing behavior                                |
|---------------|----------------------------------------|----------------------------------------------------------------------------------------------------|-------------------------------------------------------|
| `source`      | Live                                   | Not configured                                                                                     | Plesk serves the site                                 |
| `inventoried` | Live                                   | Awareness only                                                                                     | Plesk serves                                          |
| `captured`    | Live                                   | Bundle on disk, not deployed                                                                       | Plesk serves                                          |
| `restored`    | Live                                   | Site live on alternate hostname (e.g., `staging-example-com.tundra.<panel-host>`) for verification | Plesk serves; operator verifies on Tundra preview URL |
| `cut-over`    | Frozen (read-only or maintenance page) | Live, serving real domain                                                                          | Tundra serves                                         |
| `retired`     | Site removed                           | Live                                                                                               | Tundra serves; Plesk no longer has the site           |

This explicit state machine matters: it allows the operator to **stop at any state** and either continue forward or roll back to `source` without surprises.

---

## 4. Scenario A — Parallel Migration

### 4.1 When to Use

- The Plesk server is staying online during migration (production traffic continues).
- A separate VPS is available for Tundra (recommended: same provider, same region for transfer speed).
- Operator wants the option to roll back per-site for several days.
- Aggregate site count is large (10+ sites) and migration will be staged over time.

### 4.2 Topology

```
Day 0:                                  Cutover Day:
+---------------+                       +---------------+
| Plesk Server  | <-- traffic           | Plesk Server  |   (frozen, decommissioned later)
| 203.0.113.10  |                       | 203.0.113.10  |
+---------------+                       +---------------+
                                                 │ DNS cutover
+---------------+                       +---------------+
| Tundra Server | (being prepared)      | Tundra Server | <-- traffic
| 203.0.113.20  |                       | 203.0.113.20  |
+---------------+                       +---------------+
```

### 4.3 Phase Plan

#### Phase 1 — Tundra target preparation (no Plesk impact)

```bash
# On Tundra target server (fresh Ubuntu 24.04)
curl -fsSL https://tundra.<your-host>/install.sh | sudo bash
# Initial Owner setup, master key download, hostname configuration

# Install all PHP versions present on Plesk
tundra server packages install --php 8.1,8.2,8.3,8.4
tundra server packages install --node 20,22,24
tundra server packages install --python 3.11,3.12,3.13

# Install database engines matching Plesk
tundra server db install --engine mariadb --version 11.4
tundra server db install --engine postgres --version 18

# Provision mail and DNS roles (if migrating those)
tundra server role enable mail
tundra server role enable dns
```

#### Phase 2 — Inventory

```bash
# On Plesk source server
ssh root@plesk.example.net
curl -fsSL https://tundra.<your-host>/import.sh | bash    # installs tundra-import
tundra-import plesk-inventory --output /root/inventory.json
```

#### Phase 3 — Per-site capture & transfer

For each site:

```bash
# On Plesk source
tundra-import plesk-capture \
    --domain example.com \
    --output /tmp/example.com.tundra-bundle.tar.zst.age \
    --age-recipient $(cat /root/.tundra/transfer-pubkey)

# Stream directly to the Tundra server (no intermediate disk)
tundra-import plesk-capture \
    --domain example.com \
    --age-recipient $(cat /root/.tundra/transfer-pubkey) \
    --stream | ssh tundra@203.0.113.20 \
       'tundra-import plesk-restore --stream --age-identity /etc/tundra/transfer-key'
```

The `--stream` mode pipes the bundle directly without ever touching disk on the source — critical when source disk is near-full.

#### Phase 4 — Restore on Tundra (preview hostname)

```bash
# On Tundra target — restore creates a Site bound to a preview hostname
tundra-import plesk-restore \
    --bundle /tmp/example.com.tundra-bundle.tar.zst.age \
    --preview-hostname example-com.preview.tundra.<panel-host> \
    --target-server $(tundra server first --selector role=app)
```

Tundra now serves the site at `example-com.preview.tundra.<panel-host>` with a wildcard certificate. The operator browses to this URL and verifies that the site looks and behaves correctly — same WordPress dashboard login, same database content, same uploads.

The site's mail (if migrated) is also live, but mail clients still point at the Plesk MX. No mail loss yet — Plesk continues to receive mail.

#### Phase 5 — DNS cutover (per site)

The cutover strategy depends on the operator's downtime tolerance for that specific site. See §6 for the two cutover playbooks.

#### Phase 6 — Source freeze

After the operator confirms cutover and stable operation:

```bash
# On Plesk source — set the site to maintenance + stop accepting mail
tundra-import plesk-finalize \
    --domain example.com \
    --plesk-action maintenance-page \
    --plesk-mail-action redirect-to-target
```

The Plesk-side site is now serving a maintenance page indicating the move, and mail received on the old MX (rare but possible from caches) is forwarded to Tundra. The site is marked `retired` in the migration log.

#### Phase 7 — Decommission

After 14 days (configurable) with no rollback events:

```bash
tundra-import plesk-finalize \
    --domain example.com \
    --decommission \
    --confirm
```

This removes the site's vhost, document root, mail spool, databases, and DNS zone from Plesk. After all sites are decommissioned, the operator can uninstall Plesk entirely.

### 4.4 Suggested Schedule

For a server with ~30 mixed-workload sites:

| Day   | Activity                                                                              |
|-------|---------------------------------------------------------------------------------------|
| 1     | Tundra target provisioning, package installation, role configuration                  |
| 2     | Full inventory of Plesk source; produce migration plan with per-site cutover schedule |
| 3–7   | Capture, transfer, restore, and preview verification of all sites (no cutover yet)    |
| 8     | TTL reduction across all DNS zones to be cut over (drop to 60s, 24h before cutover)   |
| 9–11  | Cutover sites in batches (low-traffic ones first, weekend nights for high-traffic)    |
| 12–25 | Observation window — both servers running, Plesk in finalize state                    |
| 26    | Decommission Plesk; uninstall                                                         |

---

## 5. Scenario B — In-Place Migration

### 5.1 When to Use

- Only one VPS is available; a parallel server is not financially or operationally viable.
- Operator can accept a server-wide maintenance window (typical: 2–6 hours).
- Aggregate site count is small (1–10 sites) and they can be migrated in a single window.

### 5.2 Risk Profile

In-place migration is intrinsically riskier than parallel migration: there is no live source to roll back to mid-migration. The mitigation is **two off-server backups**, not one:

1. A full Plesk backup stored off-server (Tier 0 safety net) — taken before anything is touched.
2. A complete `/etc`, `/var/www`, `/var/lib/mysql`, `/var/lib/psa`, `/var/qmail`, `/var/vmail` snapshot using Restic to a remote target (Tier 1 safety net).

Both must complete and verify before any destructive step is taken.

### 5.3 Phase Plan

#### Phase 1 — Tier-0 and Tier-1 backups

```bash
# Plesk-native backup
plesk bin pleskbackup --server -v --output-file=/root/preserved-plesk-backup.tar
rsync -avP /root/preserved-plesk-backup.tar offsite-store:/safety-net/

# Tier-1 Restic snapshot
restic -r s3:s3.amazonaws.com/forge-safety/$(hostname) backup \
    /etc /var/www /var/lib/mysql /var/lib/psa /var/qmail /var/vmail /etc/letsencrypt
restic -r s3:s3.amazonaws.com/forge-safety/$(hostname) check
```

Without both passing, do not proceed.

#### Phase 2 — Capture all sites (Plesk still running)

```bash
tundra-import plesk-inventory --output /root/inventory.json

# Capture every site to a local directory (not yet imported into a Tundra panel)
mkdir -p /root/migration-bundles
for d in $(jq -r '.sites[].domain' /root/inventory.json); do
  tundra-import plesk-capture --domain "$d" \
      --output "/root/migration-bundles/$d.tundra-bundle.tar.zst"
done

# Verify checksums
tundra-import plesk-verify --bundles-dir /root/migration-bundles
```

#### Phase 3 — Maintenance page (start of downtime)

```bash
# Single command flips every site to a Plesk maintenance page
plesk bin site -u --maintenance-mode true --all
# Optional: pause all mail handling
plesk bin mailserver --update -spam-detection false
systemctl stop postfix dovecot
```

Downtime begins now.

#### Phase 4 — Plesk uninstall

This is the destructive step. Plesk's official uninstaller is used:

```bash
plesk uninstaller --select-product-id panel --remove-all
```

The uninstaller leaves user databases (`/var/lib/mysql`, `/var/lib/postgresql`) intact by default but removes Plesk's services. Verify nothing critical is left:

```bash
systemctl list-units --type=service | grep -E 'psa|plesk' || echo "Clean."
ls /etc/psa /usr/local/psa 2>/dev/null && echo "Stragglers — investigate." || echo "Clean."
```

#### Phase 5 — Tundra install on the same host

```bash
curl -fsSL https://tundra.<your-host>/install.sh | sudo bash
# Initial Owner setup
```

Tundra installs alongside the surviving MariaDB/PostgreSQL data. The Tundra installer detects existing database servers and offers to adopt them rather than initializing fresh ones.

#### Phase 6 — Restore all bundles

```bash
for b in /root/migration-bundles/*.tundra-bundle.tar.zst; do
  tundra-import plesk-restore --bundle "$b" --target-server local
done
```

Each restore creates a Site, an Application, the mailbox/database/DNS records; renders Nginx configs; reissues SSL certificates (Let's Encrypt fresh issuance because the old certs were tied to Plesk's renewal infrastructure).

#### Phase 7 — DNS verification & cutover

In-place, the IP address has not changed, so DNS may not require any update — but the **nameservers** likely do, because Plesk was running a BIND/PowerDNS instance that no longer exists. The operator needs to either:

- Repoint NS records at registrar to Tundra's PowerDNS (hosted on the same IP, Tundra-managed)
- Or move DNS hosting to an external provider (Cloudflare, Route53) and import zones from the bundle

Tundra's `tundra-import plesk-cutover --in-place` automates the local-DNS path: enables PowerDNS, imports zones, and the operator updates NS records at the registrar.

#### Phase 8 — Bring services online

```bash
tundra site list --status pending | xargs -L1 tundra site enable
tundra mail enable --all
tundra dns enable --all
```

Sites become reachable at the original IP. Downtime ends.

### 5.4 Estimated Maintenance Window

| Workload                                      | Estimated downtime |
|-----------------------------------------------|--------------------|
| 1–3 small sites (<1 GB each), no mail         | 45–75 min          |
| 5–10 mixed sites with mail, total <20 GB      | 90–150 min         |
| 10–20 sites with significant data (50–100 GB) | 3–5 hours          |

The capture phase is the longest for large datasets; snapshot-based capture (LVM or filesystem snapshots) can move significant work outside the maintenance window.

---

## 6. Cutover Strategies

For Scenario A (parallel migration), the per-site cutover decision drives downtime. Two playbooks are documented.

### 6.1 Strategy 1 — Scheduled-Window Cutover

Suitable for sites where a 5–15 minute interruption is acceptable.

**T-7 days:** Lower DNS TTL on the site's primary records (A, AAAA, MX) from typical 3600/86400 down to 60.

```bash
# At the registrar or DNS host
example.com.       60   IN   A      203.0.113.10
www.example.com.   60   IN   A      203.0.113.10
mail.example.com.  60   IN   A      203.0.113.10
```

Wait at least 24 hours past the original TTL to ensure caches expire.

**T-0 (cutover moment):**

1. Enable maintenance page on Plesk for the site (`plesk bin site -u --maintenance-mode true --domain example.com`).
2. Run a final delta capture (only changes since the last bundle):

   ```bash
   tundra-import plesk-capture --domain example.com --delta --since-bundle <prev>
   ```

3. Apply delta to the Tundra target:

   ```bash
   tundra-import plesk-restore --delta /tmp/example.com.delta.tundra-bundle.tar.zst
   ```

4. Run final verification (`tundra-import plesk-verify --post-restore`).
5. Update DNS: A/AAAA records to Tundra IP, MX to Tundra mail hostname.

   ```bash
   example.com.       60   IN   A      203.0.113.20
   ```

6. Within 60–90 seconds, traffic flows to Tundra. Plesk's maintenance page is visible only to clients with stale DNS caches.
7. Confirm by tailing Tundra access logs: `tundra logs example.com --follow`.
8. After 24 hours of clean traffic, raise TTL back to 3600.

### 6.2 Strategy 2 — Zero-Downtime Cutover (DNS-flip with dual-running)

Suitable for sites where any visible interruption is unacceptable.

**Prerequisite:** the application is "stateless enough" — meaning user-uploaded content is either (a) stored in object storage already, or (b) reconciled by the delta-capture step at cutover. WordPress with media in `wp-content/uploads` qualifies if delta-capture runs immediately before cutover and the operator accepts that any uploads landing in the final cutover seconds may need reconciliation.

**T-7 days:** TTL reduction (same as Strategy 1).

**T-0 (cutover):**

1. Tundra target is already serving the site at `example-com.preview.tundra.<panel-host>` AND has been configured with `Host: example.com` accepting on the production-bound Nginx config (a "future-domain" configuration with the Let's Encrypt cert pre-issued via DNS-01 challenge).
2. Run the **final live delta capture** with the source still serving traffic:

   ```bash
   tundra-import plesk-capture --domain example.com --delta-live
   ```

3. Apply delta on Tundra (database is now caught up; files are caught up; mail spool is caught up).
4. Update DNS A/AAAA records. Both servers are now serving valid content for the same domain.
5. Plesk side is configured to **forward writes** during the dual-running window: any POST/PUT/PATCH it receives is reverse-proxied to the Tundra server's IP by an Nginx snippet `tundra-import` injects into the Plesk vhost. This eliminates split-brain on database writes during DNS propagation.
6. After ~5 minutes (well past propagation for clients with TTL=60), retire the Plesk vhost.
7. Run reconciliation: `tundra-import plesk-verify --reconcile-window 600s`. This compares any database rows changed in the last 10 minutes between source (now read-only) and target. Any divergence is reported; the operator accepts or applies.

**Caveats — clearly stated:**

- Mail in flight during cutover may land at either server. Tundra's `--mail-bridge` mode forwards Plesk-received mail to Tundra during the window.
- Long-running uploads in progress at the cutover instant may fail and need retry by the user — this is the only visible artifact, and it affects only users who happen to be uploading at that exact moment.

### 6.3 Choosing a Strategy Per Site

| Site type                                                                | Recommended strategy               |
|--------------------------------------------------------------------------|------------------------------------|
| Static brochure site                                                     | Either; Strategy 1 simpler         |
| WordPress (low traffic, mostly read)                                     | Strategy 1                         |
| WordPress (high traffic, frequent writes — comments, WooCommerce orders) | Strategy 2                         |
| Laravel SaaS application                                                 | Strategy 2                         |
| Node.js / API service                                                    | Strategy 2                         |
| Mailbox-only domain                                                      | Strategy 1 with `--mail-bridge`    |
| Subdomain of a larger app (e.g., `cdn.example.com`)                      | Strategy 1; coordinate with parent |

---

## 7. Feature Parity Matrix — Plesk → Tundra

This is the authoritative mapping of every meaningful Plesk feature to its Tundra equivalent and the migration mechanism.

### 7.1 Hosting & Sites

| Plesk Feature                   | Tundra Equivalent                                      | Migration Mechanism                                                                                                      |
|---------------------------------|--------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------|
| Subscription / Webspace         | Site                                                   | One Site per Plesk subscription's primary domain; addon domains become separate Sites                                    |
| Domain (primary)                | Site.domain                                            | Direct map                                                                                                               |
| Subdomain                       | Site (separate) or Site.aliases                        | Operator choice during restore                                                                                           |
| Domain alias                    | Site.aliases[]                                         | Direct map                                                                                                               |
| Apache + Nginx (proxy)          | Nginx only (Apache discarded)                          | Plesk's `.htaccess` rules captured and converted to Nginx equivalents where automatable; manual review for complex rules |
| PHP version per site            | Site.runtime_version                                   | Direct map                                                                                                               |
| PHP handler (FPM, FastCGI, CGI) | PHP-FPM only                                           | All sites converted to FPM; operator notified for sites previously using CGI/Apache module                               |
| Custom php.ini per domain       | Per-pool PHP-FPM settings                              | Plesk's `panel.ini` per-domain settings extracted, mapped to FPM `env[]`, `php_admin_value[]`                            |
| Document root                   | Site.document_root                                     | Direct map; Plesk's `httpdocs` or `httpsdocs` distinction collapses to one root                                          |
| `.htaccess` allowed             | Nginx `try_files` + per-location rules                 | Auto-converted for common patterns (WordPress, Laravel rewrites); manual review prompt for unrecognized rules            |
| Hotlink protection              | Nginx `valid_referers` config                          | Captured from Plesk settings, rendered to Nginx                                                                          |
| IP address binding              | Nginx `listen` directives                              | Direct map                                                                                                               |
| Custom error documents          | Nginx `error_page` directives                          | Direct map                                                                                                               |
| HTTP → HTTPS redirect           | Site.redirect_to_https                                 | Direct map                                                                                                               |
| Server-Side Includes (SSI)      | Nginx `ssi on`                                         | Direct map (rare; preserved if used)                                                                                     |
| Web server logs                 | `/srv/sites/<id>/shared/logs/nginx-{access,error}.log` | Plesk log retention rules carried over; logs archived (not transferred)                                                  |

### 7.2 Database Servers

| Plesk Feature           | Tundra Equivalent                         | Migration Mechanism                                                                                                             |
|-------------------------|-------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| MySQL/MariaDB databases | Tundra Database (engine=mariadb or mysql) | `mysqldump --single-transaction` → restore on Tundra DB server                                                                  |
| PostgreSQL databases    | Tundra Database (engine=postgres)         | `pg_dump -Fc` → `pg_restore` on Tundra                                                                                          |
| Database users          | Tundra DatabaseUser                       | Username preserved; **password reset to a new random value during migration** (Plesk stores hashes; cleartext is unrecoverable) |
| Database grants         | Tundra DatabaseGrant                      | Direct map of GRANTed privileges                                                                                                |
| phpMyAdmin / phpPgAdmin | Built-in Tundra query console             | Tundra's web SQL console replaces both                                                                                          |
| Remote DB access        | Tundra DB endpoint with TLS               | Plesk's per-IP allowlists translated to firewall rules                                                                          |

**Important:** Database user passwords are reset during migration because Plesk stores them in a recoverable but vendor-internal way; Tundra refuses to store cleartext from another panel for security reasons. The migration tool produces a new password and updates the application's `.env`/wp-config.php in lockstep.

### 7.3 Mail (Postfix / Dovecot)

| Plesk Feature              | Tundra Equivalent                  | Migration Mechanism                                                                                                                         |
|----------------------------|------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| Mail domain                | Tundra MailDomain                  | Direct map                                                                                                                                  |
| Mailbox                    | Tundra Mailbox                     | Maildir tarball restored to `/var/vmail/<domain>/<local>`                                                                                   |
| Mailbox quota              | Tundra Mailbox.quota_bytes         | Direct map                                                                                                                                  |
| Mailbox password           | Tundra Mailbox.password_hash       | Plesk uses Dovecot's `{SHA512-CRYPT}` format compatible with Tundra; **passwords carry over without reset**                                 |
| Mail alias                 | Tundra MailAlias                   | Direct map                                                                                                                                  |
| Mail forward               | Tundra MailForward                 | Direct map                                                                                                                                  |
| Catch-all                  | Tundra MailAlias with `source='*'` | Direct map                                                                                                                                  |
| Auto-responder / vacation  | Sieve filter                       | Plesk vacation messages converted to Sieve rules                                                                                            |
| Sieve filters              | Sieve filters                      | Direct map; same upstream Pigeonhole format                                                                                                 |
| DKIM keys                  | Tundra DKIM                        | **Same key carried over** (no DNS update needed if DNS is on Plesk's side and migrating; DNS update needed if Plesk DNS is being abandoned) |
| SPF, DMARC                 | Tundra DNS records                 | Direct map of zone records                                                                                                                  |
| Anti-spam (SpamAssassin)   | Rspamd                             | Score thresholds carried over; learned Bayesian database not migrated (acceptable; Rspamd relearns)                                         |
| Mail queue                 | Postfix mail queue                 | Queue is drained on source before cutover; never migrated mid-flight                                                                        |
| Webmail (Roundcube)        | Webmail (Roundcube on Tundra)      | Roundcube user prefs migrated from `roundcubemail` MySQL DB                                                                                 |
| Mail server hostname / TLS | Tundra mail Server hostname / TLS  | New Let's Encrypt cert issued on Tundra mail hostname                                                                                       |

### 7.4 DNS

| Plesk Feature                              | Tundra Equivalent   | Migration Mechanism                                                                                                      |
|--------------------------------------------|---------------------|--------------------------------------------------------------------------------------------------------------------------|
| Authoritative DNS (BIND/PowerDNS in Plesk) | Tundra PowerDNS     | Zone exported via `pdnsutil list-zone <domain>` or Plesk's psa DB query, imported to Tundra                              |
| DNS templates                              | Tundra DNS template | Plesk DNS templates manually re-created (rare; usually one template per operator)                                        |
| DNSSEC                                     | Tundra DNSSEC       | **Re-key required** — DNSSEC keys do not migrate; operator schedules re-signing window with parent zone DS record update |
| Reverse DNS / PTR                          | Tundra DNS PTR      | Direct map; operator must coordinate with VPS provider for in-addr.arpa delegation                                       |
| Slave / secondary DNS                      | Tundra slave config | Direct map of master IP, zone list                                                                                       |

### 7.5 SSL / TLS

| Plesk Feature                                 | Tundra Equivalent                    | Migration Mechanism                                                                                                                                                               |
|-----------------------------------------------|--------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Let's Encrypt (Plesk extension)               | Tundra ACME (built-in)               | **Fresh issuance** on Tundra side; Plesk certs not transferred. The HTTP-01 challenge succeeds during preview phase using the preview hostname; production cert issues at cutover |
| ZeroSSL                                       | Tundra ACME (ZeroSSL provider)       | Same — fresh issuance                                                                                                                                                             |
| Manual / BYO certificate                      | Tundra Certificate (manual)          | Cert + key + chain transferred and registered as a manual certificate                                                                                                             |
| Wildcard certificate                          | Tundra wildcard via DNS-01           | Re-issued via Tundra's DNS-01 if Tundra hosts DNS, or operator provides DNS API credentials                                                                                       |
| SSL It! extension settings (HSTS, OCSP, etc.) | Site.hsts_enabled and Nginx settings | Direct map                                                                                                                                                                        |

### 7.6 Scheduled Tasks (Cron)

| Plesk Feature                 | Tundra Equivalent                            | Migration Mechanism                                           |
|-------------------------------|----------------------------------------------|---------------------------------------------------------------|
| Subscription cron tasks       | Tundra ScheduledTask                         | Captured from Plesk DB; cron expression and command preserved |
| Run-as user                   | Tundra ScheduledTask runs as Site's web_user | Direct map                                                    |
| Email notification on failure | Tundra ScheduledTask alerting                | Direct map; recipient address preserved                       |

### 7.7 Backups

| Plesk Feature                          | Tundra Equivalent   | Migration Mechanism                                                                                                                                                                                                                                           |
|----------------------------------------|---------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Plesk Backup Manager                   | Tundra BackupJob    | Plesk backup schedules captured; new Tundra BackupJobs configured to mirror. Existing Plesk backup archives are **not** migrated — they remain on the operator's backup target as cold archives (Plesk format), and Tundra starts fresh Restic-based backups. |
| Backup destinations (FTP, S3, Dropbox) | Tundra BackupTarget | Same destinations; new credentials + Restic repos initialized                                                                                                                                                                                                 |

### 7.8 Users, FTP, SSH

| Plesk Feature                        | Tundra Equivalent                          | Migration Mechanism                                                                                                                                    |
|--------------------------------------|--------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| Customer / Reseller / Admin accounts | Tundra Operator (Owner / Admin / Operator) | Plesk admin → Tundra Owner; Plesk customers do not have Tundra equivalents in v1.0 (single-tenant); each customer's sites become Sites under the Owner |
| FTP user                             | Tundra SftpUser                            | SFTP-only by default; FTP/FTPS opt-in for legacy clients                                                                                               |
| FTP password                         | New SFTP password generated                | Plesk passwords are not extractable; operator notifies users with new credentials                                                                      |
| SSH access                           | Operator SSH keys via Tundra               | Plesk shell users are converted to a single SSH key set per Site, managed centrally                                                                    |

### 7.9 Application Catalog

| Plesk Feature             | Tundra Equivalent                                    | Notes                                                                                                  |
|---------------------------|------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| WordPress Toolkit         | Tundra `wordpress` template + WP-CLI integration     | Tundra installs WP-CLI per site; bulk operations (update all WP, scan all WP) are first-class commands |
| Joomla! Toolkit           | Tundra `joomla` template (v1.5; v1.0 is generic PHP) | Migration restores files & DB; Toolkit features (cloning, scanning) are roadmap items                  |
| .NET site                 | Out of v1.0 scope                                    | Sites flagged for separate handling                                                                    |
| Ruby app                  | Tundra Ruby application type                         | Plesk uses Phusion Passenger; Tundra uses Puma/Unicorn behind Nginx                                    |
| Python app                | Tundra Python application type                       | Plesk uses mod_wsgi/Passenger; Tundra uses gunicorn/uvicorn behind Nginx                               |
| Node.js app               | Tundra Node.js application type                      | Plesk uses Phusion Passenger; Tundra uses systemd unit + reverse proxy                                 |
| Docker                    | Tundra Docker provider (v1.0)                        | Docker containers carry over; Plesk's docker-compose translation is preserved                          |
| Git deployment (built-in) | Tundra Git deploy (built-in)                         | Webhook URL changes; operator updates GitHub/GitLab webhook target                                     |

### 7.10 Statistics & Logs

| Plesk Feature       | Tundra Equivalent                                             | Migration Mechanism                                                               |
|---------------------|---------------------------------------------------------------|-----------------------------------------------------------------------------------|
| AWStats / Webalizer | GoAccess (built-in to Tundra) or external (Matomo, Plausible) | Historical Plesk stats archived but not converted; Tundra starts fresh statistics |
| Web log access      | Tundra log streaming + download                               | Direct map                                                                        |
| Mail statistics     | Tundra mail dashboard                                         | Plesk historical mail stats not migrated                                          |

### 7.11 Security & Firewall

| Plesk Feature          | Tundra Equivalent                   | Migration Mechanism                                                           |
|------------------------|-------------------------------------|-------------------------------------------------------------------------------|
| Plesk Firewall         | Tundra firewall (nftables)          | Rules exported from Plesk DB, translated to nftables                          |
| Fail2ban               | Tundra built-in fail2ban (in agent) | Jails carried over; ban list cleared (acceptable; bans regenerate quickly)    |
| ModSecurity            | Optional Nginx ModSecurity module   | Custom rule sets transferred; default rule set replaced with OWASP CRS latest |
| ImunifyAV / Imunify360 | Out of v1.0 scope                   | If used, operator must source replacement (e.g., ClamAV, MalCare)             |

### 7.12 Plesk Extensions With No Direct Equivalent

| Plesk Extension                          | Disposition                                                                        |
|------------------------------------------|------------------------------------------------------------------------------------|
| Sitejet Builder                          | Drop. Operator must export Sitejet content as static files first.                  |
| AI Website Generator                     | Drop. Generated content remains as static files.                                   |
| WP Toolkit Premium scanners              | Replaced by manual scans + custom scripts; community Tundra extensions in roadmap. |
| KernelCare / TuxCare                     | Direct upstream tooling; install on Tundra server independently if desired.        |
| Plesk Email Security                     | Built into Tundra (Rspamd + ARC).                                                  |
| Plesk Migrator                           | Replaced by `tundra-import`.                                                       |
| APS Catalog (deprecated by Plesk anyway) | No replacement; APS apps must be re-installed via Tundra templates or manually.    |

---

## 8. Edge Cases & Known Issues

### 8.1 PHP Version Already EOL

If a Plesk site runs PHP 7.4 (EOL) or earlier, two options:

1. **Upgrade in-place before migration** — Plesk supports running 8.x; switch on Plesk first, fix any breakage, then migrate.
2. **Carry over the EOL version** — Tundra will install legacy PHP from Sury's PPA; the site continues to run on PHP 7.4 with explicit acknowledgement that no security updates are forthcoming. Tundra logs a security warning.

### 8.2 Apache-Specific Sites

Plesk's "Apache + Nginx as proxy" mode is common. For sites that depend on Apache-specific features:

- **`mod_rewrite` with `.htaccess`** — auto-converted for known frameworks (WordPress, Laravel, Drupal, Joomla, Magento). Unrecognized rules are flagged for manual conversion; the operator can also enable Tundra's `htaccess-compat` mode (off by default), which uses an Apache reverse-proxy similar to Plesk.
- **`mod_*` modules with no Nginx equivalent** — explicitly flagged in the migration report. Common examples: `mod_perl`, `mod_python` (legacy), specific WebDAV configurations.

### 8.3 WordPress Multisite

Plesk's WP Toolkit handles Multisite as a single subscription. Tundra treats Multisite as a single Site. Migration:

- The WP Multisite database (with `wp_blogs`, `wp_site` tables) transfers as a single MySQL database.
- The `wp-config.php` `DOMAIN_CURRENT_SITE` constant is updated for the new domain *only if the domain itself changes*; in-place migration leaves it unchanged.
- Subsite domains (subdirectory or subdomain mode) work identically post-migration.
- Network-active plugins continue working; operator should verify on the preview hostname.

### 8.4 Mail Delivery During Cutover

Mail is the most fragile part of any migration because of MX caching:

- **MX TTL must be lowered to 60s 24+ hours before cutover** — this is a hard requirement.
- **Mail bridge (forwarder) on the source side** runs for 7 days post-cutover by default. Plesk's Postfix is reconfigured to forward all incoming mail for migrated domains to the Tundra MX. This catches stragglers from caches that didn't honor the low TTL.
- **DKIM validation during the bridge window** — when Plesk forwards mail to Tundra, the mail arrives "from Plesk's IP". Tundra's Rspamd must accept this without rejecting on SPF for the relay path. The bridge mode injects an `Authentication-Results` header and adds Plesk's IP to a permitted-relay list scoped to the migration window.

### 8.5 Active SSL Certificates Near Renewal

If a site's Let's Encrypt certificate has fewer than 14 days until expiry at migration time, the cert is reissued on Tundra at preview phase rather than at cutover, to ensure the cert is valid for the full 90 days from issuance. The Plesk-side cert continues to serve until cutover.

### 8.6 Long-Running Database Locks

`mysqldump --single-transaction` works for InnoDB but not MyISAM. For MyISAM-heavy databases (rare in 2026), the dump uses `--lock-tables` which briefly blocks writes. The migration tool warns and offers alternatives: convert to InnoDB pre-migration, or schedule an explicit maintenance window for that specific database.

### 8.7 Open Connections / WebSockets at Cutover

DNS-flip cutover does not gracefully terminate open WebSocket or long-poll connections. Clients reconnect within seconds — acceptable for chat-style apps, but the operator should flag any application that depends on persistent connections and decide whether to broadcast a "reconnect now" message before flipping.

### 8.8 Email Aliases to External Addresses

Plesk allows aliases pointing to addresses outside the hosted domains. Tundra preserves these. The bridge phase requires careful SPF/DKIM handling because forwarded mail from the bridge fails strict DMARC if the destination domain enforces it. Tundra applies SRS (Sender Rewriting Scheme) to forwarded mail during the bridge window, the same approach Plesk uses.

### 8.9 IP Address Changes Affecting Outbound Mail Reputation

When migration involves a new server (Scenario A), the new IP has no mail reputation history. Recommendations:

- **Warm the new IP** for 7+ days before cutover by sending low-volume legitimate mail through it.
- **Use a smarthost** (Mailgun, SES, Postmark) for outbound mail post-migration, regardless of warming. This is a Tundra first-class feature and preserves deliverability.
- **Update SPF** to include both old and new IPs during the bridge window, then drop the old IP.

### 8.10 Plesk's PostgreSQL on Old Versions

Plesk historically shipped PostgreSQL 12 or 13 by default. Tundra uses 18. Migration:

- Logical dump (`pg_dump -Fc`) restores cleanly across versions.
- Extensions: `tundra-import` enumerates installed extensions in each database (`SELECT * FROM pg_extension`) and ensures the same extensions are installed on the Tundra PG18 cluster before restore. `pgvector`, `postgis`, `pg_trgm`, `uuid-ossp` are all supported.

---

## 9. Verification & Acceptance Tests

### 9.1 Per-Site Verification

`tundra-import plesk-verify` runs the following checks after restore but before cutover:

| Check                          | Pass criterion                                                                        |
|--------------------------------|---------------------------------------------------------------------------------------|
| Document root file count       | Matches source ±0 (trivial files like `.htaccess.bak` excluded)                       |
| Document root total bytes      | Matches source ±2 KB (minor metadata variance)                                        |
| File checksum sample           | 50 random files, SHA-256 match between source and target                              |
| Database row counts            | Per-table counts match source ±0                                                      |
| Database checksum sample       | `SELECT MD5(GROUP_CONCAT(...))` over key tables matches                               |
| Mailbox message count          | Per-mailbox count matches source                                                      |
| Mailbox total bytes            | Matches source ±10 KB (Maildir metadata variance allowed)                             |
| HTTP probe                     | Preview URL returns 200 (or expected status); HTML body contains site-specific marker |
| Database connectivity from app | Application's `.env` credentials connect successfully                                 |
| SSL preview cert               | Valid, includes preview hostname                                                      |
| Cron task list                 | Count and command list match source                                                   |

### 9.2 Acceptance Test Suite (Operator-Driven)

For each migrated site, the operator runs an explicit acceptance check before cutover. Tundra surfaces a checklist:

- [ ] Login to admin/dashboard succeeds (WP-Admin, Laravel admin, custom login)
- [ ] At least one write action succeeds (create a draft post, edit a setting)
- [ ] Image/asset URLs render correctly
- [ ] Email send test (registered user reset password, contact form submission)
- [ ] Search functionality (for sites with internal search)
- [ ] Payment flow test (where applicable; sandbox keys, do not charge)
- [ ] Page load time within 1.5× of source baseline

The migration is not marked `restored` until this list is checked. The checklist is logged to the audit trail.

### 9.3 Post-Cutover Monitoring

For 72 hours post-cutover, Tundra runs heightened monitoring:

- HTTP probe every 60s with alert on any 5xx
- Mail flow probe every 15 min (a synthetic mail sent from a mailbox-on-the-domain to an external probe address; round-trip verified)
- Database write probe (read-only verification of replication lag if read replicas exist; otherwise simple connectivity)
- DNS resolution check from 4 globally distributed resolvers (Google, Cloudflare, Quad9, OpenDNS)

Any check failing twice consecutively pages the operator.

---

## 10. Tundra Schema Additions for Migration

The following tables extend the schema defined in the main implementation plan (§6 of `tundra-technical-implementation-plan-v2.md`):

```sql
CREATE TABLE migration_sources (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id       UUID NOT NULL DEFAULT uuidv7() UNIQUE,
    kind            TEXT NOT NULL,                  -- 'plesk-obsidian'
    source_version  TEXT,                           -- '18.0.77'
    hostname        TEXT NOT NULL,
    ipv4            INET,
    ssh_user        TEXT,
    ssh_key_id      BIGINT,                         -- references operator SSH keys
    inventory       JSONB,                          -- last inventory snapshot
    inventory_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE migration_jobs (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id           UUID NOT NULL DEFAULT uuidv7() UNIQUE,
    source_id           BIGINT NOT NULL REFERENCES migration_sources(id) ON DELETE CASCADE,
    target_site_id      BIGINT REFERENCES sites(id) ON DELETE SET NULL,
    source_domain       TEXT NOT NULL,
    state               TEXT NOT NULL DEFAULT 'inventoried',
                                                    -- 'inventoried','captured','restored','cut-over','retired','failed'
    bundle_path         TEXT,
    bundle_bytes        BIGINT,
    bundle_sha256       BYTEA,
    captured_at         TIMESTAMPTZ,
    restored_at         TIMESTAMPTZ,
    cutover_at          TIMESTAMPTZ,
    retired_at          TIMESTAMPTZ,
    cutover_strategy    TEXT,                       -- 'scheduled','zero-downtime'
    verification_report JSONB,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_migration_jobs_state ON migration_jobs(state);
CREATE INDEX idx_migration_jobs_source ON migration_jobs(source_id, state);

CREATE TABLE migration_acceptance_checks (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id          BIGINT NOT NULL REFERENCES migration_jobs(id) ON DELETE CASCADE,
    check_key       TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('pending','pass','fail','skip')),
    note            TEXT,
    checked_by      BIGINT REFERENCES operators(id) ON DELETE SET NULL,
    checked_at      TIMESTAMPTZ
);

CREATE TABLE migration_bridges (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id          BIGINT NOT NULL REFERENCES migration_jobs(id) ON DELETE CASCADE,
    bridge_type     TEXT NOT NULL,                  -- 'mail','http','database-replica'
    started_at      TIMESTAMPTZ NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    config          JSONB NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);
```

The control plane exposes these via the API and CLI:

```bash
tundra migrate source add --kind plesk --hostname plesk.example.com --ssh-user root --ssh-key ~/.ssh/id_ed25519
tundra migrate inventory <source-id>
tundra migrate plan <source-id> --output migration-plan.md
tundra migrate run <source-id> --domain example.com --strategy scheduled
tundra migrate verify <job-id>
tundra migrate cutover <job-id>
tundra migrate finalize <job-id>
tundra migrate list --source <source-id>
tundra migrate rollback <job-id>     # only valid pre-cutover; restores Plesk-only operation
```

---

## 11. Rollback Procedures

### 11.1 Pre-Cutover Rollback

Trivial — Plesk has been live the entire time. Steps:

1. `tundra migrate rollback <job-id>` removes the Tundra-side Site, releases the IP, deletes the bundle on disk.
2. No DNS changes occurred; no client traffic ever reached Tundra.
3. The migration log is preserved for forensic review.

### 11.2 Post-Cutover Rollback (within 24 hours)

If a critical issue surfaces after DNS cutover:

1. Re-update DNS to point back at the Plesk IP. With TTL=60, traffic returns to Plesk within 60–90 seconds.
2. `tundra migrate rollback <job-id> --post-cutover` performs a *reverse delta capture* — any data changes that happened on Tundra since cutover are captured and applied back to Plesk.
3. The Tundra-side Site is moved to `failed` state but retained for forensic review.
4. The operator retries the migration after addressing the root cause.

**Caveat:** reverse delta capture is best-effort. Database schema changes (especially WordPress plugin updates that ran on Tundra and modified tables) may not roll back cleanly. The migration tool warns about this before allowing post-cutover rollback.

### 11.3 Post-Cutover Rollback (after 24 hours)

Not supported as a one-click operation. Beyond 24 hours of dual-running, the data divergence makes a clean rollback impractical. Instead:

1. Operator restores from the Tier-0 Plesk backup taken before migration.
2. Manually reconciles 24+ hours of changes (typically by exporting Tundra data and importing).
3. This is a manual procedure with no automated path; Tundra explicitly notifies the operator at hour 24 that the rollback window is closing.

---

## 12. Decommissioning Plesk

### 12.1 Pre-Decommission Checklist

Before removing Plesk:

- [ ] All sites in `cut-over` state for at least 14 days
- [ ] Bridge windows all closed (`tundra migrate bridge list --active` shows none)
- [ ] No traffic logged at Plesk in the last 7 days (`grep -c "" /var/log/nginx/access.log`)
- [ ] No mail delivered to Plesk in the last 7 days (Postfix queue empty + `mailq` archive review)
- [ ] Final off-server backup of `/var/www`, `/var/lib/mysql`, `/var/lib/psa`, `/var/qmail`, `/var/vmail`, `/etc/letsencrypt`
- [ ] Plesk license confirmed cancelled (avoid auto-renewal billing)

### 12.2 Decommissioning Steps

For Scenario A (parallel migration):

```bash
# On Plesk source
plesk uninstaller --select-product-id panel --remove-all

# Archive what's left, then wipe
restic -r ... backup /var/www /var/lib/mysql ... --tag final-plesk-archive
rm -rf /var/www/vhosts /var/qmail /var/vmail /var/lib/psa /etc/psa
apt purge 'plesk-*' 'psa-*'
apt autoremove
```

For Scenario B (in-place migration), Plesk was already removed during the migration; this section is a no-op.

### 12.3 The Final State

After decommissioning, the operator's infrastructure consists of:

- Tundra control plane (or single-server install)
- One or more Tundra-managed application nodes
- All sites, mail, DNS, and databases running on Tundra
- No Plesk binaries, no Plesk databases, no Plesk costs

The migration manifest, verification reports, and acceptance checklists remain in the Tundra audit log indefinitely as a record of what moved when.

---

## 13. Appendix A — Complete Per-Site Migration Runbook

This is the operator's at-the-keyboard checklist for migrating one site, end to end.

```bash
# ---- Phase 1: Plan ----
tundra migrate inventory <source-id>
tundra migrate plan <source-id> --domain example.com --output plan-example.md
# Review plan-example.md with the site owner; obtain go-ahead

# ---- Phase 2: TTL reduction ----
# At the registrar / DNS host: drop TTL on example.com A, AAAA, MX to 60
# Wait 24 hours

# ---- Phase 3: Capture ----
tundra migrate run <source-id> --domain example.com --strategy scheduled --capture-only

# ---- Phase 4: Restore (preview) ----
tundra migrate run <source-id> --domain example.com --restore-only
# Tundra outputs preview URL: https://example-com.preview.tundra.<panel-host>

# ---- Phase 5: Verify ----
tundra migrate verify <job-id>
# Run acceptance checks (UI or CLI):
tundra migrate accept <job-id> --check login --pass
tundra migrate accept <job-id> --check write-action --pass
tundra migrate accept <job-id> --check email-flow --pass
# ... etc

# ---- Phase 6: Final delta capture ----
tundra migrate run <source-id> --domain example.com --delta

# ---- Phase 7: Cutover ----
tundra migrate cutover <job-id>
# Manually update DNS at registrar to Tundra IP
# OR if Tundra hosts DNS:
tundra dns publish --domain example.com

# ---- Phase 8: Monitor ----
tundra migrate watch <job-id> --hours 72

# ---- Phase 9: Finalize ----
tundra migrate finalize <job-id>
# Confirms 14-day stability, configures Plesk-side maintenance page

# ---- Phase 10: Decommission (after 14 days) ----
tundra migrate finalize <job-id> --decommission --confirm
```

---

## 14. Appendix B — Plesk Inventory SQL Reference

For operators or developers who want to understand what `tundra-import` reads from Plesk's `psa` database, the canonical queries are:

```sql
-- All domains and their configuration
SELECT
    d.id, d.name, d.cr_date, d.status,
    h.www_root, h.php, h.php_handler_type, h.fpm_use, h.ssl,
    h.ssl_certificate_id
FROM domains d
LEFT JOIN hosting h ON h.dom_id = d.id;

-- Mailboxes
SELECT m.id, ma.account_id, ma.password, ma.type,
       d.name AS domain, mn.mail_name AS local_part,
       m.postbox, m.quota
FROM mail m
JOIN mail_aliases ma ON ma.mn_id = m.mn_id
JOIN mail_names mn ON mn.id = m.mn_id
JOIN domains d ON d.id = mn.dom_id
WHERE m.postbox = 'true';

-- Mail aliases / forwards
SELECT mn.id, d.name AS domain, mn.mail_name,
       GROUP_CONCAT(ma.alias) AS aliases,
       GROUP_CONCAT(mr.address) AS forwards
FROM mail_names mn
JOIN domains d ON d.id = mn.dom_id
LEFT JOIN mail_aliases ma ON ma.mn_id = mn.id AND ma.type = 'alias'
LEFT JOIN mail_redir mr ON mr.mn_id = mn.id
GROUP BY mn.id;

-- Databases
SELECT db.id, db.name, db.type, d.name AS domain,
       u.login AS db_user, u.password
FROM data_bases db
JOIN domains d ON d.id = db.dom_id
LEFT JOIN db_users u ON u.db_id = db.id;

-- DNS zones and records
SELECT d.name AS domain, dr.host, dr.type, dr.value, dr.opt, dr.ttl
FROM dns_recs dr
JOIN dns_zone dz ON dz.id = dr.dns_zone_id
JOIN domains d ON d.dns_zone_id = dz.id
ORDER BY d.name, dr.type, dr.host;

-- SSL certificates
SELECT c.id, c.name, c.cert_file, c.cert_file_size,
       c.csr_file, c.pvt_file, c.ca_file
FROM certificates c;

-- Scheduled tasks (cron)
SELECT s.id, s.cmd, s.params, s.minute, s.hour,
       s.dayofmonth, s.month, s.dayofweek, s.user_id, su.login
FROM scheduler s
LEFT JOIN sys_users su ON su.id = s.user_id;
```

These queries are stable across Plesk Obsidian 18.0.x — they have not changed in years and are unlikely to change. They form the reliable contract between Tundra's importer and Plesk's data layer.

---

## 15. Document Control

| Version | Date     | Author         | Changes                                                                          |
|---------|----------|----------------|----------------------------------------------------------------------------------|
| v1.0    | May 2026 | Al Amin Ahamed | Initial complete migration plan covering Plesk Obsidian 18.0.75–18.0.77 → Tundra |

**Companion Documents:**

- `tundra-technical-implementation-plan-v2.md` — primary architecture and implementation plan
- `tundra-installation-runbook.md` (planned) — operator install guide
- `tundra-disaster-recovery-runbooks.md` (planned) — restore procedures for production failures
- `tundra-migration-cpanel-plan.md` (future) — equivalent migration plan for cPanel
- `tundra-migration-onyx-plan.md` (future) — equivalent migration plan for Plesk Onyx (17.x)

**Open Items / Roadmap:**

- Reseller hierarchy support — required before Tundra can absorb multi-customer Plesk fleets in their original shape
- Joomla! Toolkit feature parity — clone, scan, mass-update operations
- ImunifyAV / Imunify360 replacement — community Tundra extension or first-party module
- Sitejet Builder export pipeline — automated capture of generated content as static bundles
