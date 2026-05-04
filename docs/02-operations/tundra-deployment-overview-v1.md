# Tundra — Deployment Runbook (Operator Edition)

> Install, upgrade, back up, and restore Tundra on your server.
> Written for the operator running Tundra — not the engineer building it.

---

**Author:** Al Amin Ahamed
**GitHub:** [@mralaminahamed](https://github.com/mralaminahamed)
**X:** [@mralaminahamed](https://x.com/mralaminahamed)

**Document Version:** v1.0
**Document Date:** May 2026
**Companion to:** `tundra-deployment-runbook-v1.md` (the deeper version)
**Audience:** Operators — system administrators, hosting providers, agency owners running Tundra

---

## 1. Before You Start

Tundra is a self-hosted control plane. You install it on one Linux server (the **control plane host**), and it manages your other servers (the **fleet**). You can also run Tundra in single-host mode, where the control plane and the only managed server are the same machine — that's how most people start.

This runbook is the friendly version. It covers the parts of Tundra you're likely to actually do: install it, log in for the first time, add a server, upgrade to a new release, take a backup of Tundra itself, and recover if something goes wrong.

If you need the deeper "what does each command actually do" view — service unit files, manual master-key rotation, verifying backups byte-by-byte, troubleshooting a stuck agent — that lives in the **Engineering Edition** of this runbook. This document points to it whenever a topic needs more depth.

### 1.1 What You Need

| Resource         | Recommendation                                                                          |
|------------------|-----------------------------------------------------------------------------------------|
| Operating system | Ubuntu 24.04 LTS or Debian 12 (other modern Linux works; these are tested)              |
| CPU              | 2 cores minimum, 4+ for a busy control plane                                            |
| RAM              | 4 GiB minimum, 8 GiB recommended                                                        |
| Disk             | 40 GiB minimum on the control plane (more for backups)                                  |
| Network          | A public IPv4 address (IPv6 optional but recommended); ports 80, 443 reachable for ACME |
| DNS              | A subdomain pointing at the control plane host — `panel.example.com` is conventional    |
| Email            | One real email address for the owner account and ACME notifications                     |

You do not need: a managed PostgreSQL service (Tundra installs Postgres locally), a load balancer, Docker, or root SSH on the servers Tundra will manage (a sudoer account is enough).

### 1.2 What Tundra Installs On Your Server

When you run the installer, it installs and configures:

- The **`tundrad`** control plane daemon, served on port 7400 internally and reverse-proxied by Caddy on 443.
- **PostgreSQL 18** for Tundra's own database. (You are still free to install other Postgres versions for your sites — Tundra manages those separately.)
- **Valkey 8** for caching and the job queue.
- **Caddy** as the panel's reverse proxy and ACME client (handles HTTPS for the panel itself).
- A system user named `tundra` that owns the daemon's files at `/var/lib/tundra/`.
- A systemd service unit so `tundrad` starts on boot.

If you already have any of these on the host, the installer detects and reuses them — see the Engineering Edition §3 for how that detection works.

---

## 2. Install (One-Line)

The fastest path. On a fresh Ubuntu 24.04 server, as a sudoer:

```bash
curl -fsSL https://tundra.dev/install.sh | sudo bash
```

The installer:

1. Detects your OS, asks one or two confirmation questions.
2. Installs the prerequisites (PostgreSQL, Valkey, Caddy).
3. Downloads the latest stable `tundrad` binary.
4. Creates the `tundra` system user and `/var/lib/tundra/` tree.
5. Generates a master encryption key and stashes it at `/var/lib/tundra/data/master.key`.
6. Initializes the Tundra database and runs all migrations.
7. Starts `tundrad` under systemd.
8. Prints a one-time **setup URL** ending in `/setup?token=...` — visit this in your browser within 30 minutes.

The setup URL takes you to a single-page wizard that creates your owner account. After that, you're logged in.

### 2.1 First Login — What You'll See

The first thing you see after setup is the **Dashboard**: four tiles (Servers, Sites, Deploys today, Alerts), an empty activity feed, and a hint at the top reading "Add your first server to get started."

Tundra is intentionally quiet on the first run. Nothing happens until you add a server.

### 2.2 If the One-Line Installer Doesn't Suit You

The shell script is the fast path. If your environment has stricter requirements (proxy, custom Postgres, no internet during install), the **Engineering Edition §2** has the manual install procedure step by step.

---

## 3. Add Your First Server

A server in Tundra is just a Linux box you want to manage. It might be the same machine Tundra is running on (single-host mode), or a separate VPS somewhere.

### 3.1 The Browser Path (Recommended)

In the panel: **Servers → Add Server**. The wizard has five steps:

1. **Where is the server?** — pick a name (e.g., `vps-fra-01`), enter the public hostname or IP, optionally a region label.
2. **How will Tundra reach it?** — paste an SSH command Tundra can run (`ssh tundra@vps-fra-01.example.com`). Tundra runs this once, in your browser-tab session, just to install the agent. It doesn't store the SSH credentials.
3. **Confirm fingerprint** — Tundra shows the server's SSH host key fingerprint; you confirm it matches what your hosting provider gave you. This is your protection against a man-in-the-middle on first contact.
4. **Install** — the wizard runs the agent installer over the established SSH session, watches the progress live, and shows you any failures with their exit codes.
5. **Done** — the new server appears with status `provisioning` for ~30 seconds, then `active`.

The whole flow takes about a minute on a fast connection.

### 3.2 The Command-Line Path

If you prefer terminal:

On the control plane host:

```bash
sudo tundra server add vps-fra-01.example.com
```

This prints a one-line install command including a short-lived enrollment token. SSH into the target server, paste the command, and the agent connects back to Tundra.

### 3.3 Single-Host Mode

If Tundra is going to manage the same machine it runs on:

```bash
sudo tundra server add localhost
```

The agent installs to `/usr/local/bin/tundra-agent` and a system service starts. The agent and `tundrad` talk over a Unix socket; no network is involved.

---

## 4. Upgrade Tundra

New Tundra releases ship roughly monthly. Each release is announced on the GitHub releases page with notes describing what's new and any migration concerns.

### 4.1 The Browser Path

In the panel: **Settings → Advanced → Update**. If a new release is available, you see a card showing the current and target version, the changelog, and an "Install Update" button.

The update process:

1. Tundra downloads the new binary, verifies its signature, and stages it next to the current one.
2. Tundra runs the new binary's `--migrate-only` mode against your database. This applies any new schema migrations.
3. Tundra restarts `tundrad` to the new binary. The browser briefly disconnects and reconnects.
4. Agent fleets receive the new agent binary asynchronously over the next few minutes; agents auto-update one at a time, never all at once.

The update is **online** — sites stay up. The control plane is unavailable for ~30 seconds while it restarts.

### 4.2 The Command-Line Path

```bash
sudo tundra upgrade
```

Same operation, no browser.

### 4.3 If Something Goes Wrong During Upgrade

Tundra's upgrade is designed to roll back automatically if the new binary fails to start within 60 seconds. The previous binary stays at `/usr/local/bin/tundrad.previous` and systemd is reverted to it.

If the rollback itself fails (rare but possible — usually because of a database migration that can't be undone), the daemon stays down and the panel is unreachable. Steps:

1. SSH into the control plane host.
2. Run `sudo systemctl status tundrad` to see the failure mode.
3. Run `sudo journalctl -u tundrad -n 100` to see the last hundred log lines.
4. Refer to the **Engineering Edition §6** ("Recovering from a failed upgrade") for the procedure.

If you can't recover from the host, the recovery path is to restore from your most recent self-backup (§6 below).

---

## 5. Add a Second Operator (Team Member)

Tundra supports multiple operators with role-based access.

In the panel: **Settings → Operators → Invite**. Enter the new operator's email and choose their role:

| Role          | Can do                                                                                                             |
|---------------|--------------------------------------------------------------------------------------------------------------------|
| **Owner**     | Everything. Only one owner exists; ownership transfers via Settings.                                               |
| **Admin**     | Everything except changing the owner or deleting Tundra itself.                                                    |
| **Operator**  | Day-to-day work: deploy, manage sites, review backups. Cannot create servers, manage operators, or change billing. |
| **Read-only** | View everything, change nothing. Useful for stakeholders or investors.                                             |

The invitee receives an email with a link valid for 7 days. They follow the link, set up their password (and optionally a passkey), and they're in.

### 5.1 Scoped Roles

For agencies and team setups, you can grant a role **scoped to specific servers or sites**. In **Settings → Operators → [name] → Add scoped grant**: pick a role (e.g., `operator`) and pick the servers or sites it applies to. The operator can act on those resources but nothing else.

### 5.2 Two-Factor and Passkeys

Every operator can register a passkey under **Settings → Security**. Passkeys are recommended over passwords; once registered, the operator can sign in with just their email and a fingerprint or face scan on their device.

If your team policy requires it, the owner can enforce passkey-or-2FA for all operators under **Settings → Security → Authentication policy**.

---

## 6. Back Up Tundra Itself

Tundra backs up your sites, but **you** need to back up Tundra's own database. The backup contains:

- The Tundra Postgres database (operators, servers, sites, settings, audit log — everything that defines your control plane).
- The master encryption key.
- The internal CA used to authenticate agents.
- Any plugin data Tundra holds at the control plane.

**Without a Tundra self-backup, you cannot restore Tundra.** The site backups you took for your customers don't help — they're encrypted with the master key, which is in this self-backup.

### 6.1 Configure the Self-Backup Target

Tundra ships with a separate backup tool — `tundra-self-backup` — that runs on a schedule and uploads to a target you choose. The important rule: **the self-backup target must not be managed by Tundra itself**. If your only backup is in storage Tundra controls, a Tundra failure is unrecoverable.

In the panel: **Settings → Advanced → Self-backup**. Configure:

1. **Schedule** — daily at 02:30 by default; weekday choice and time configurable.
2. **Target** — pick from supported backends: a remote SSH/rsync target, S3-compatible storage (any provider you administer separately), or local disk (for staging only — copy off-server with another tool).
3. **Encryption** — paste a GPG public key. Backups are encrypted for that key before upload. The matching private key never lives on the control plane.
4. **Retention** — how many backups to keep. Default 30 daily.

The first backup runs immediately to verify the target is reachable. After that, the schedule takes over.

### 6.2 Verify a Backup

In the panel: **Settings → Advanced → Self-backup → Verify latest**. Tundra downloads the latest backup, decrypts it (you'll be prompted for the GPG passphrase), checks the manifest and SHA-256 sums, and reports.

A passing verification means the backup file is intact, can be decrypted with the configured key, and contains all expected components. It does **not** prove the backup will restore successfully — that requires a real restore drill (§7), which we recommend doing once a quarter.

### 6.3 What's Not in the Self-Backup

The self-backup contains everything Tundra needs to come back online. It does **not** contain:

- The websites and applications you run. Those are backed up by the regular **Backups** module — separate, scoped, scheduled per site.
- Email content. Mailbox contents are backed up by the regular Backups module.
- The OS, the kernel, the system packages. If you lose the host entirely, you'll provision a fresh one and restore the self-backup onto it.

---

## 7. Restore Tundra from a Self-Backup

This is the path you'll walk if your control-plane host fails entirely or its database becomes corrupted.

### 7.1 Provision a Fresh Host

Stand up a new server with the same operating system as the previous one (Ubuntu 24.04, etc.). The hostname and IP can change — Tundra rewires DNS for the panel hostname during restore.

### 7.2 Run the Restore Tool

Copy the encrypted backup to the new host (`/tmp/tundra-backup.tar.gpg`), copy your GPG private key to the host (`/tmp/operator.gpg`), then:

```bash
sudo tundra-restore /tmp/tundra-backup.tar.gpg --gpg-key /tmp/operator.gpg
```

The tool prompts for the GPG passphrase, decrypts and verifies the backup, halts any partial `tundrad` install on the host, restores the database, restores `/var/lib/tundra/data/`, and starts `tundrad`.

The restore takes ~5 minutes for a small Tundra (under 10k sites) and proportionally longer for larger ones.

### 7.3 Reconnect Your Agents

Your managed servers' agents have credentials issued by Tundra's CA. The restored Tundra uses the same CA, so the agents reconnect automatically within their next heartbeat (default 30s).

If agents don't reconnect within 5 minutes, the **Engineering Edition §10** has the recovery procedure for re-issuing agent credentials.

### 7.4 Verify

Once Tundra is back up, verify:

1. Sign in to the panel using your owner account.
2. Visit **Servers** — every server should show `active`.
3. Visit **Sites** — each site should show its expected status.
4. Visit **Settings → Advanced → Self-backup** and run a fresh backup immediately. The new host should be writing to the same target the old one was.

If a server stays `offline` for more than 5 minutes after restore, see §10 of the Engineering Edition.

---

## 8. Routine Operations

A short list of the operations you'll perform regularly, with one-line summaries. Each links to deeper coverage.

### 8.1 Add a Site

In the panel: **Sites → Create site**. Wizard takes you through source (GitHub, GitLab, blank, template), application type and runtime, domain and TLS, and confirmation. Initial deploy starts immediately. See the Frontend UI Spec §12.3 for the wizard's full flow.

### 8.2 Trigger a Deploy

In the panel: site detail page → **Deploy**. Or via CLI:

```bash
tundra site deploy example.com
```

### 8.3 Renew a TLS Certificate Manually

Tundra renews automatically. To force a renewal:

In the panel: site detail → **Settings → TLS → Renew now**. Or:

```bash
tundra site tls renew example.com
```

### 8.4 Look at Logs for a Site

In the panel: site detail → **Logs**. Filterable by level, time range, search; live-tails by default. Or:

```bash
tundra site logs example.com --follow
```

### 8.5 Pause or Suspend a Site

In the panel: site detail → **Settings → Suspend site**. The site returns 503 until you un-suspend; the configuration and files are untouched.

### 8.6 Move a Site to a Different Server

In the panel: site detail → **Settings → Move to server**. Tundra runs a coordinated migration: snapshot, ship, restore, switch DNS. Detailed in the Engineering Edition §8.

---

## 9. When to Read the Engineering Edition

Use the Engineering Edition for:

- Manual install (no internet, custom layout, behind a corporate proxy).
- Recovering from a failed upgrade.
- Master-key rotation.
- Re-issuing agent mTLS certificates.
- Tundra in HA / multi-region mode.
- Anything involving direct database access.
- Anything involving systemd unit modifications.

The split exists because most operators won't need any of that on most days. When you do, the Engineering Edition is the deeper reference.

---

## 10. Getting Help

If you're stuck:

- **Logs first.** `sudo journalctl -u tundrad -n 200` shows the last 200 lines of `tundrad` output. Most issues are visible there.
- **Health check.** Visit `https://panel.example.com/api/v1/health` — if it returns 200, the daemon is fine and the issue is elsewhere.
- **GitHub issues.** [github.com/mralaminahamed/tundra/issues](https://github.com/mralaminahamed/tundra/issues) — search before you post; if you post, include your Tundra version (`tundra --version`), OS, and the relevant log slice.
- **Discussions.** [github.com/mralaminahamed/tundra/discussions](https://github.com/mralaminahamed/tundra/discussions) — for "is this the right way to..." questions where there isn't necessarily a bug.

---

## 11. Document Control

| Version | Date     | Author         | Changes                                                                                                                                                                                                                                        |
|---------|----------|----------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| v1.0    | May 2026 | Al Amin Ahamed | Initial operator-facing deployment runbook. Install via one-line script, first-time setup, adding servers, upgrades, operator management, self-backup configuration, restore procedure. Pointers to the Engineering Edition for deeper topics. |

**Companion Documents:**

- `tundra-deployment-runbook-v1.md` — the deeper, command-dense edition
- `tundra-technical-implementation-plan-v2.md` — primary architecture
- `tundra-security-overview-v1.md` — the security counterpart written for operators
- `tundra-acceptance-checklist-v1.md` — UAT and acceptance testing for new releases
