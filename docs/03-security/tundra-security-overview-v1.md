# Tundra — Security Audit (Operator Edition)

> A plain-language summary of how Tundra is secured, what's your responsibility, and what to watch for.

---

**Author:** Al Amin Ahamed
**GitHub:** [@mralaminahamed](https://github.com/mralaminahamed)
**X:** [@mralaminahamed](https://x.com/mralaminahamed)

**Document Version:** v1.0
**Document Date:** May 2026
**Companion to:** `tundra-security-audit-v1.md` (the technical threat model)
**Audience:** Operators — the person responsible for running Tundra and answering "is this secure?" to themselves and their stakeholders

---

## 1. What This Document Is

Tundra is a self-hosted control plane. When you run it, you're responsible for the security of your own infrastructure — Anthropic, AWS, or any third party isn't in the picture by default. This document explains what Tundra does to make that responsibility manageable, what you still need to do yourself, and what to do if something goes wrong.

It deliberately avoids jargon where plain words work, because the audience for this document includes operators who are not security specialists. The deeper technical version — STRIDE analysis, full threat model, attack-tree details, code-level controls — lives in `tundra-security-audit-v1.md` and is the document to read if you are a security specialist.

---

## 2. What Tundra Protects

Tundra holds three categories of data, and protects each differently:

### 2.1 Operator Identities

Your account, your team's accounts, the passwords or passkeys used to sign in, and the audit trail of what each operator has done.

**How it's protected.** Passwords are hashed with **argon2id** (the modern best-practice algorithm). They are never stored as readable text — even Tundra's database administrator cannot recover them, because there's nothing to recover. Passkeys (the modern passwordless option) use cryptographic keys stored on your device's secure hardware; only the corresponding public key reaches Tundra, which cannot be used to sign in by itself.

When you or a teammate signs in, Tundra creates a **session** that lasts up to 30 days unless you sign out earlier. The session is tied to a cookie (browser) or token (CLI). You can review and revoke active sessions at **Settings → Security → Active Sessions**.

**Two-factor authentication.** TOTP (time-based codes from apps like Authy, 1Password, or Google Authenticator) and passkeys both work as second factors. Owners can require 2FA for all operators in **Settings → Security → Authentication policy**.

### 2.2 Infrastructure Credentials

The keys, passwords, and API tokens that Tundra holds to manage your servers, databases, mail, and external services.

**How it's protected.** Every sensitive value — database passwords, registrar API keys, DKIM private keys, encrypted environment variables, agent mTLS keys — is encrypted in the Tundra database with **AES-256-GCM**. The encryption key (the **master key**) lives in a single file on the control-plane host with permissions that allow only Tundra to read it.

If an attacker gets a copy of Tundra's database alone (e.g., via a backup leak), they cannot decrypt these values without also having the master key. That separation is deliberate. Your job: keep the master key safe, especially in backups (see §4 below).

### 2.3 Workload Data

Your sites' files, your databases, your mailboxes. Tundra orchestrates these but typically doesn't store the content centrally — they live on the managed servers themselves.

**How it's protected.** Workload data is protected by:

- **The OS-level isolation Tundra applies on each server.** Each site runs as its own system user, with its files mode-protected from neighbours. PHP-FPM pools, Node.js processes, and Python apps are sandboxed to their site's user.
- **The TLS certificates Tundra obtains and renews automatically** for every public domain — encryption in transit comes for free.
- **Backups Tundra takes on a schedule** to whatever target you configured (S3, B2, SSH/rsync, local). Backup contents are encrypted with a key Tundra derives from the master key; backup integrity is checksummed; backup deletion is gated by retention policies you set.

Tundra does **not** automatically encrypt the disks of your managed servers — that's an OS-level setting (LUKS on Linux). For high-sensitivity workloads, enable disk encryption when you provision the server.

---

## 3. How You Sign In

The operator-side authentication options:

### 3.1 Password

A password is the simplest option. Tundra enforces:

- Minimum 12 characters.
- Not in the **Have I Been Pwned** dataset (validated by k-anonymity lookup at password-set time, not in real-time and never sending the password).
- Re-typed once at registration to catch typos.

There's no maximum length and no character-class requirement (length matters more than complexity, per current NIST guidance).

### 3.2 Passkey

A passkey replaces both the password and the second factor. It's a cryptographic key stored on your device's hardware (Touch ID, Face ID, Windows Hello, security key). Tundra sees only the public half.

Recommended for production — most operators set up at least one passkey per device. **Settings → Security → Passkeys → Register**.

### 3.3 Two-Factor (TOTP)

A 6-digit time-based code from an authenticator app, in addition to your password. Tundra supports backup recovery codes (printed once at setup; stored offline) for the case where your authenticator device is lost.

If your team policy is "everyone uses 2FA or a passkey," set it under **Settings → Security → Authentication policy**.

---

## 4. What's Your Responsibility

Tundra is self-hosted, so you take on responsibilities that a SaaS would handle. The list:

### 4.1 Keep the Host Secure

The control-plane host is where Tundra runs. If an attacker gets root on this host, they have everything Tundra has — there is no further compartmentalization that protects you.

- Keep the host's OS up to date (`unattended-upgrades` on Debian/Ubuntu).
- Restrict SSH to keys, not passwords. Better: a bastion or VPN.
- Limit the inbound firewall to ports 22 (or your bastion's), 80, 443, and your monitoring/logging endpoints.
- Use a Linux distribution with automatic security updates enabled.
- Don't run other services on the same host. Tundra is designed to be the only thing that matters on its host.

### 4.2 Keep the Master Key Backed Up

The master key file at `/var/lib/tundra/data/master.key` is the root of all Tundra encryption. If you lose it, every encrypted value in your database (passwords, API keys, secrets) becomes unrecoverable — even if you have the database itself.

- Tundra's self-backup includes the master key, encrypted with your GPG public key. Configure self-backup. Don't skip this step.
- Keep a separate offline copy of the master key, encrypted to an offline GPG key, in a physical safe or a separate secrets vault. The Operator Edition of the Deployment Runbook has the exact procedure (§4.1).

### 4.3 Configure the Self-Backup Target

The self-backup target must be **outside Tundra's control plane**. If your only backup is in a place Tundra manages, you can't recover from "Tundra is broken." Use a different cloud account, a different physical server, or both.

The self-backup is encrypted to a GPG public key. The matching private key must not live on the control-plane host.

### 4.4 Manage Your Operators

Add operators only as needed. Use the **Read-only** role for stakeholders who just need visibility. Use **scoped roles** for team members who only manage specific servers or sites.

Remove operators promptly when they leave. Tundra revokes all their sessions and tokens immediately on removal.

Review **Settings → Security → Recent activity** monthly. Look for sign-ins from unfamiliar IPs, deploys at unusual times, failed sign-in spikes.

### 4.5 Watch the Audit Log

Tundra records every consequential action: sign-ins, deploys, server changes, plugin installs, capability grants. The log is at **Audit log** in the side menu.

Filter by `actor` to see what a specific operator did, by `resource` to see what's happened to a site or server, by `action` to see all deploys or all permission changes. The log is append-only — entries are never modified or deleted.

For a high-volume environment, configure **alert rules** under **Settings → Notifications** to email or SMS you on suspicious patterns: ten failed sign-ins, a new operator role granted, an MCP token created.

---

## 5. What Tundra Does on Your Behalf

Some categories of security work that Tundra handles automatically, so you don't have to:

### 5.1 TLS Certificates

Tundra obtains a TLS certificate for every public domain (via Let's Encrypt or another ACME provider you configure). It renews them automatically 30 days before expiry. If renewal fails, you get an alert.

The panel itself is HTTPS-only — there's no HTTP listener except for ACME validation redirects.

### 5.2 Agent Authentication

The agent on each managed server uses **mutual TLS** (mTLS) — both sides verify each other's identity with cryptographic certificates. The agent's certificate is short-lived (90 days) and Tundra rotates it automatically 30 days before expiry. If an agent's host is compromised, you can revoke its certificate from the panel (**Servers → [name] → Settings → Revoke agent certificate**) and the agent is locked out instantly.

### 5.3 Sandboxed Plugins

Plugins (third-party extensions) run inside a sandbox that limits what they can read, write, and reach over the network. Capabilities are explicitly granted (or refused) per plugin in **Plugins → [name] → Capabilities**. You can revoke a capability at any time, and Tundra immediately stops honoring it.

### 5.4 Encrypted Backups

When Tundra backs up your sites' data, the backup is encrypted before it leaves the server. The encryption key is derived from your Tundra master key — backups in the storage target are useless to anyone who doesn't also have the master key.

### 5.5 Rate Limiting

The panel API rate-limits sign-in attempts (10 per IP per hour, with exponential backoff after 3 failures), API calls, and webhook traffic. This protects against credential-stuffing, DoS, and runaway integrations.

### 5.6 Security Headers

The panel sends modern security response headers on every request: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

### 5.7 Audit Trail

Every consequential action is logged with the actor, the resource, the IP, the user agent, and the change made. The audit log can't be edited from the panel — it's append-only by design.

---

## 6. What to Watch For

Indicators that something is wrong, ranked from "noticeable" to "subtle":

### 6.1 Loud Signals

- A sign-in from a country you've never operated from.
- An unfamiliar operator account in your team.
- A new API token you didn't create.
- A deploy you didn't trigger.
- An agent that suddenly went `offline`.
- A new plugin installed.
- A capability granted you don't recognize.

These are loud because they're rare and visible. Tundra surfaces them on the Dashboard's recent-activity feed and via configurable alerts.

### 6.2 Quiet Signals

- Repeated failed sign-in attempts on a single account (not enough to trigger an alert, but persistent).
- A small but steady stream of `403` responses from the audit log — attempted privilege escalation.
- An MCP session active for longer than your session policy allows.
- Self-backup verification starting to fail.
- An agent's last-seen time creeping up over hours instead of being near-real-time.

These are quiet because they require pattern recognition. Tundra has alert rules for several of them; review the rule set under **Settings → Notifications → Alert Rules**.

### 6.3 Things That Aren't Your Concern

For clarity, things you do **not** need to actively manage:

- The encryption of secret values in the database — Tundra does this for every encrypted column automatically.
- The rotation of agent certificates — automatic, every 60 days.
- The renewal of TLS certificates — automatic, 30 days before expiry.
- The integrity verification of binaries — `tundra upgrade` verifies signatures before installing.
- The pruning of old audit log rows — automatic, after 90 days, with archiving to disk.

---

## 7. If Something Goes Wrong

### 7.1 You Suspect Account Compromise

If you think an operator account has been compromised:

1. **Settings → Operators → [name]** → **Revoke all sessions**. Every active session for that account is killed.
2. Reset the operator's password (they'll need to reset their passkey too on next login).
3. Review the audit log filtered to that operator. Look for what they touched in the last 24 hours.
4. If they had `owner` or `admin` and the compromise has been longer-running, follow §7.4 (host-compromise procedure).

### 7.2 You Suspect Agent Compromise

If an agent's host has been compromised:

1. **Servers → [name] → Settings → Revoke agent certificate**. The agent is locked out instantly.
2. Treat the host as compromised: rebuild it from a known-good image, do not just clean it.
3. Re-enroll the rebuilt host as a new server. Move sites onto it from the compromised one.
4. Review all sites that were on the compromised host. Rotate any application secrets they had in env vars. Restore from a pre-compromise backup if necessary.
5. Review the audit log for what the compromised agent might have done.

### 7.3 You Suspect Master-Key Compromise

The master key is the most sensitive value in Tundra. If it's been exposed:

1. Schedule a maintenance window (10–30 minutes for typical Tundra installations).
2. Run the master-key rotation procedure from the Engineering Edition of the Deployment Runbook (§4.2).
3. After rotation, every previous backup is encrypted with the old key. They are not invalid — but if the old key is also exposed, those backups are exposed too. Take a fresh backup immediately and consider the older ones unsafe.
4. Rotate any secrets that may have been visible if the database was also accessed: every encrypted env var, registrar API keys (regenerate at the registrar), DKIM keys, etc. The Engineering Edition has the per-secret-type procedures.

### 7.4 You Suspect Control-Plane-Host Compromise

The worst case. If the host running `tundrad` has been compromised:

1. Take the host offline (don't leave it running while you investigate — every additional minute is more exposure).
2. Stand up a fresh host with a fresh OS install.
3. Restore Tundra from a self-backup that pre-dates the compromise.
4. Rotate the master key after restoring (§7.3 procedure).
5. Rotate every operator's sessions (forced sign-out) and require password resets.
6. Review and rotate every secret that Tundra holds — env vars, registrar tokens, DKIM keys, agent certs, ACME account keys.
7. Re-enroll every agent against the rebuilt control plane.
8. Treat any host whose agent was compromised before the rebuild as suspect.

This is the procedure Tundra is designed to make survivable, but it's a multi-hour incident. The way to avoid running it is the §4 hygiene above: keep the master key backed up offline, keep the host minimal, keep audit-log review routine.

---

## 8. Reporting Vulnerabilities

If you find a security issue in Tundra itself, please **don't** post it to the public issue tracker. Use the responsible-disclosure channel:

- **Email** the project author with `[security]` in the subject.
- **GitHub Security Advisories** at [github.com/mralaminahamed/tundra/security/advisories](https://github.com/mralaminahamed/tundra/security/advisories) — supports private reports.

The project author will acknowledge within 72 hours, agree on a disclosure timeline (typically 90 days), and credit you in the release notes once the fix is shipped, unless you prefer to remain anonymous.

---

## 9. The Short Checklist

If you read nothing else in this document, do these:

1. Configure the **self-backup** with a target outside Tundra and a GPG public key whose private key isn't on the control-plane host.
2. Keep an **offline copy of the master key**, encrypted to an offline GPG key.
3. Enable **2FA or a passkey** for the owner account. Strongly recommend the same for every operator.
4. Limit **inbound firewall** on the control-plane host to ports 22, 80, 443.
5. Review the **audit log** at least monthly. Configure alerts for the patterns you care about.
6. **Drill a restore** in staging once a quarter. The first time you restore from backup should not be the day you have to restore from backup.

---

## 10. Document Control

| Version | Date     | Author         | Changes                                                                                                                                                                                                                                                     |
|---------|----------|----------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| v1.0    | May 2026 | Al Amin Ahamed | Initial operator-facing security audit. Plain-language summary of Tundra's security model, operator responsibilities, indicators of compromise, incident response procedures, vulnerability reporting. Pointers to Engineering Edition for technical depth. |

**Companion Documents:**

- `tundra-security-audit-v1.md` — full STRIDE threat model, controls catalog, attack trees
- `tundra-deployment-overview-v1.md` — operational procedures
- `tundra-deployment-runbook-v1.md` — master-key rotation, agent cert revocation
- `tundra-acceptance-checklist-v1.md` — UAT including security validations
