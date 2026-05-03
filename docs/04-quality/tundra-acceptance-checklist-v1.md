# Tundra — Acceptance Checklist

> The "did it work?" checklist for installations, upgrades, and recovery exercises.
> Walk these checklists in order; each item is a yes/no verification an operator can perform from the panel or CLI.

---

**Author:** Al Amin Ahamed
**GitHub:** [@mralaminahamed](https://github.com/mralaminahamed)
**X:** [@mralaminahamed](https://x.com/mralaminahamed)

**Document Version:** v1.0
**Document Date:** May 2026
**Companion to:** `tundra-deployment-runbook-v1.md`, `tundra-test-plan-v1.md`
**Audience:** Operators, project managers, anyone signing off on a Tundra deployment

---

## 1. How to Use This Document

This is the operator's UAT (User Acceptance Test) checklist for Tundra. Each section is a yes/no verification list — you click through the panel, run a command, observe the result, check the box.

The checklists exist because "Tundra is installed" is not the same as "Tundra works." Walking these lists once at install time, again after each upgrade, and quarterly as a routine practice catches the silent failures that quietly accumulate (a backup repo whose credentials expired, a TLS auto-renew that's been failing for weeks, a notification that no one ever wired up).

The checklists are organized by lifecycle phase. Use the table of contents to jump to the relevant section.

### Table of Contents

1. After install (single-server) — §2
2. After install (control-plane) — §3
3. After enrolling a server — §4
4. After creating your first site — §5
5. After your first deploy — §6
6. After enabling backups — §7
7. After enabling mail — §8
8. After installing a plugin — §9
9. After an upgrade — §10
10. Routine quarterly review — §11
11. Disaster recovery test — §12
12. Security review — §13

Each item uses these symbols:

- ☐ Pending verification
- ✓ Passed (note: replace ☐ with ✓ as you verify)
- ✗ Failed (do not proceed; fix the failed item first)
- N/A Not applicable to this deployment

---

## 2. After Install — Single-Server

Run this checklist after running the single-server install one-liner.

### 2.1 Panel Reachability

- ☐ The panel URL (`https://panel.your-tundra.example`) loads in a browser
- ☐ The TLS certificate is valid (browser shows green padlock, no warnings)
- ☐ The certificate is issued by Let's Encrypt or your configured CA
- ☐ The owner setup screen is visible (or, if already configured, the login screen)

### 2.2 Owner Account

- ☐ You can complete the owner setup with your email and password
- ☐ You are signed in to the panel after setup
- ☐ You can sign out and sign back in
- ☐ Your operator profile is visible at **Settings → Profile**
- ☐ Your role is `owner`

### 2.3 Two-Factor Authentication

- ☐ You have enabled either TOTP or a passkey on the owner account
- ☐ Sign-out and sign-in succeeds with the second factor
- ☐ Recovery codes (TOTP) are saved somewhere safe

### 2.4 Underlying Services

- ☐ `sudo systemctl status tundrad` reports `active (running)`
- ☐ `sudo systemctl status tundra-agent` reports `active (running)`
- ☐ `sudo systemctl status postgresql` reports `active (running)`
- ☐ `sudo systemctl status valkey` reports `active (running)`
- ☐ `sudo tundra panel diagnose` returns all green

### 2.5 Logs

- ☐ `sudo journalctl -u tundrad --since '5 minutes ago'` shows no errors
- ☐ Log rotation is configured (`ls /var/log/tundra/`)

### 2.6 The Local Server Is Enrolled

In single-server mode, the panel host is also a managed server.

- ☐ The local host appears in **Servers**
- ☐ Its status is `active`
- ☐ Capabilities (PHP versions, etc.) are detected and listed

### 2.7 Master Key & Recovery

- ☐ The recovery passphrase that the installer printed is saved in a password manager
- ☐ A backup printed copy is in a fire-safe or other physical secure storage
- ☐ The location of the saved passphrase is documented somewhere your team can find it (without exposing the passphrase itself)

**If any item in §2 fails:** stop. Do not proceed to creating sites until the install is healthy.

---

## 3. After Install — Control-Plane

Run this checklist after running the control-plane install one-liner.

### 3.1 Panel Reachability

- ☐ The panel URL loads in a browser
- ☐ The TLS certificate is valid
- ☐ The owner setup screen completes successfully

### 3.2 Owner Account

(Same as §2.2 — same items apply.)

### 3.3 Two-Factor Authentication

(Same as §2.3.)

### 3.4 Underlying Services

- ☐ `sudo systemctl status tundrad` reports `active (running)`
- ☐ `sudo systemctl status postgresql` reports `active (running)`
- ☐ `sudo systemctl status valkey` reports `active (running)`
- ☐ The control-plane host does **not** run `tundra-agent` (it should not have any sites)
- ☐ `sudo tundra panel diagnose` returns all green

### 3.5 Network Posture

- ☐ TCP 443 is reachable from the public internet (panel HTTPS)
- ☐ TCP 80 is reachable (HTTP redirect, ACME)
- ☐ TCP 7401 is reachable from your managed-server network
- ☐ Firewall rules are documented (security group, ufw, iptables — wherever they live)

### 3.6 Master Key & Recovery

(Same as §2.7.)

### 3.7 No Servers Yet

- ☐ The **Servers** page is empty (this is correct at this stage)
- ☐ The dashboard shows "0 servers" / "0 sites" — also correct

**Proceed to §4 to enroll your first server.**

---

## 4. After Enrolling a Server

Run this checklist after running the agent install command on a managed server.

### 4.1 Server Appears

- ☐ The new server appears at **Servers** within 30 seconds
- ☐ Its status transitions from `provisioning` to `active`
- ☐ The hostname, region, IP, OS distro, kernel are populated correctly
- ☐ CPU/memory/disk values match the server's actual specs

### 4.2 Capabilities Detected

- ☐ Detected runtimes (PHP, Node, Python, etc.) match what's installed on the server
- ☐ The Docker capability is detected if Docker is installed
- ☐ Mail capability is detected if mail packages are installed

### 4.3 Heartbeat Healthy

- ☐ "Last heartbeat" updates within the last 30 seconds
- ☐ The server's metrics graph populates within 5 minutes
- ☐ No alerts about the new server

### 4.4 Agent Service

On the new server:

- ☐ `sudo systemctl status tundra-agent` reports `active (running)`
- ☐ `sudo journalctl -u tundra-agent --since '5 minutes ago'` shows no errors
- ☐ `sudo tundra-agent diagnose` returns all green

### 4.5 Enrollment Token Consumed

- ☐ The enrollment token used is no longer valid (try it again from the panel — it should be rejected)
- ☐ The enrollment is recorded in the audit log

**If any item in §4 fails:** investigate the agent's logs before proceeding. A misenrolled server cannot reliably host sites.

---

## 5. After Creating Your First Site

Run this checklist after creating a site through the panel's "Create site" wizard.

### 5.1 Site Provisioned

- ☐ The site appears in **Sites**
- ☐ Its status transitions from `provisioning` to `active` within 60 seconds
- ☐ Its health status is `healthy` after the first health check
- ☐ The application metadata (type, runtime version) is correct

### 5.2 System User & File Layout

On the managed server:

- ☐ `id tundra-<site-public-id>` shows the user exists
- ☐ `ls -la /home/tundra-<site-public-id>/sites/<domain>/` shows `current`, `releases/`, `shared/`
- ☐ The `current` symlink points to the latest release directory
- ☐ Permissions are `tundra-<id>:tundra-<id>` ownership

### 5.3 Domain & TLS

- ☐ The domain appears in **Domains**
- ☐ DNS records visible at the panel match what's actually resolving (use `dig` to confirm)
- ☐ A TLS certificate has been issued (visible at **Domains → \<domain\> → Certificates**)
- ☐ The certificate is current and auto-renew is enabled
- ☐ Browsing to the domain over HTTPS shows your site without certificate warnings

### 5.4 First Page Loads

- ☐ The site's primary domain returns the expected response (200 OK or your application's default page)
- ☐ HTTP redirects to HTTPS
- ☐ Response time is reasonable (< 1s for a static page; a few seconds is fine for a complex framework)

### 5.5 Logs

- ☐ Site access logs visible at **Site → Logs**
- ☐ Application logs visible (for runtimes that emit them)
- ☐ Live tail works (open the page, refresh the site, see the request appear)

---

## 6. After Your First Deploy

Run this checklist after triggering your first deploy on a site.

### 6.1 Deploy Succeeds

- ☐ The deploy reaches `succeeded` status in the panel
- ☐ The build log is visible and complete
- ☐ The release appears under **Site → Deploys**
- ☐ The site's `current` symlink now points to the new release

### 6.2 Site Reflects the Deploy

- ☐ Browsing to the domain shows the new content
- ☐ The site's health status remains `healthy` after the deploy
- ☐ No errors in the application log immediately after deploy

### 6.3 Rollback Works

Pick a quiet moment for this:

- ☐ Click **Rollback** on the previous release
- ☐ Within 10 seconds, the site is back to the previous release
- ☐ Browsing to the domain shows the previous content
- ☐ No downtime was perceptible (the symlink swap is atomic)
- ☐ Forward-roll back to the new release works the same way

### 6.4 Webhook Auto-Deploy (if configured)

- ☐ A push to the configured branch triggered a deploy automatically
- ☐ The webhook delivery is visible at **Settings → Webhooks → Recent deliveries**
- ☐ The signature was validated (no `signature.invalid` events)

### 6.5 Environment Variables

- ☐ Env vars set in the panel are visible to the application at runtime
- ☐ Secrets are masked in the panel (you must click "Reveal" to see them)
- ☐ Reveal events appear in the audit log

---

## 7. After Enabling Backups

This is **critical for production deployments.** Walk this carefully.

### 7.1 Repository Configured

- ☐ A backup repository is configured at **Backups → Repositories**
- ☐ The backend is **off-host** (S3, B2, SFTP — not local disk on the panel host)
- ☐ The repository connectivity check passes
- ☐ The repository passphrase is saved in your password manager

### 7.2 Schedule Set

- ☐ At least one backup schedule exists for sites
- ☐ At least one backup schedule exists for databases
- ☐ At least one backup schedule covers the **panel itself** (Tundra's self-backup)
- ☐ Retention policies are sensible (default: 7 daily, 4 weekly, 6 monthly, 2 yearly)

### 7.3 First Backup Runs

- ☐ Trigger a manual backup; it completes successfully
- ☐ The snapshot appears at **Backups → Snapshots** with reasonable size
- ☐ The repository total size grew by approximately the snapshot size

### 7.4 Restore Works (Critical)

This is the single most important verification. Backup that hasn't been restored is hope, not data.

- ☐ Pick a recent snapshot
- ☐ Restore it to a **preview** target (creates a new site at a temporary domain)
- ☐ The restored site loads and shows the expected content
- ☐ The restored database (if any) contains the expected data
- ☐ Restored env vars are present
- ☐ Discard the preview when verified

### 7.5 Self-Backup Verified

The Tundra self-backup is what you'll need to recover if the panel host dies. Verify it works.

- ☐ A successful self-backup is visible at **Backups → Snapshots → Tundra self**
- ☐ The recovery passphrase you saved at install can be used to decrypt a self-backup snapshot (test in a sandbox, not production)
- ☐ Recovery procedure documented in your team's runbook

**If any item in §7 fails:** treat it as a P0. You do not have functional backups until everything in this section passes.

---

## 8. After Enabling Mail

If you're using Tundra's mail subsystem, walk this checklist for each mail domain.

### 8.1 Mail Domain Set Up

- ☐ The mail domain appears at **Mail → Domains**
- ☐ DKIM, SPF, and DMARC records are visible in the panel and resolving correctly via `dig`
- ☐ MX record points to the panel host (or your mail server)
- ☐ Reverse DNS (PTR) for the IP matches the hostname (request from your VPS provider if missing)

### 8.2 First Mailbox Works

- ☐ Create a test mailbox (e.g., `test@yourdomain.example`)
- ☐ Send mail **to** it from an external address (Gmail, Outlook); receipt confirmed
- ☐ Send mail **from** it to an external address; receipt confirmed
- ☐ The sent mail does not land in spam (check Gmail's "Show original" for SPF/DKIM/DMARC pass)

### 8.3 Quota & Aliases

- ☐ Mailbox quota is set sensibly
- ☐ A test alias forwards correctly
- ☐ Forwards to external addresses survive SPF (configured properly)

### 8.4 Mail Queue & Logs

- ☐ The mail queue is empty (no stuck messages)
- ☐ Mail log entries appear in **Mail → Logs**
- ☐ Bounce handling works (send to a non-existent address; bounce is logged)

### 8.5 Reputation

- ☐ Your sending IP is **not** on Spamhaus or similar major blocklists
- ☐ Your domain has no DMARC reports indicating issues
- ☐ Test sends to mail-tester.com score 9+/10

---

## 9. After Installing a Plugin

Walk this for each plugin you install.

### 9.1 Capability Review

- ☐ You read the plugin's capability requirements before granting
- ☐ You only granted capabilities the plugin actually needs
- ☐ The plugin author is trusted (built-in, official Tundra, or vetted third party)

### 9.2 Plugin Active

- ☐ The plugin appears at **Plugins** with status `enabled`
- ☐ The plugin's capabilities show as `granted`
- ☐ The plugin's UI extensions appear where expected (settings page, sidebar item, etc.)

### 9.3 Plugin Functions

- ☐ The plugin's primary function works (e.g., for a registrar plugin: connect, list domains)
- ☐ Plugin-side actions appear in the audit log
- ☐ Plugin errors (if any) are visible at **Plugins → \<plugin\> → Logs**

### 9.4 Sandbox Healthy

- ☐ Plugin CPU/memory usage is reasonable
- ☐ No `plugin.sandbox.timeout` or `plugin.sandbox.oom` events in the event log
- ☐ Plugin jobs (if any) are completing, not stuck in `running`

---

## 10. After an Upgrade

Walk this checklist after every upgrade — minor or major.

### 10.1 Upgrade Completed

- ☐ `tundra version` reports the new version
- ☐ `sudo systemctl status tundrad` reports `active (running)`
- ☐ The panel is reachable
- ☐ All operators can sign in
- ☐ Migrations completed successfully (visible in the upgrade log)

### 10.2 Sites Healthy

- ☐ All sites are still `active` and `healthy`
- ☐ A spot-check of a few sites confirms they load correctly
- ☐ Recent deploys still work; trigger a no-op deploy to verify

### 10.3 Agents Upgraded

- ☐ All agents have updated to the matching version (visible at **Servers → \<server\> → Agent version**)
- ☐ No servers are stuck in `provisioning` or `degraded`
- ☐ Agent metrics are flowing

### 10.4 Backups Still Running

- ☐ The most recent scheduled backup ran successfully
- ☐ The backup repository connectivity check still passes

### 10.5 Plugins Still Working

- ☐ All installed plugins are still `enabled`
- ☐ Plugin grants are unchanged
- ☐ A plugin function spot-check works

### 10.6 No New Alerts

- ☐ The alerts page shows no new entries since the upgrade

**If any item in §10 fails:** consider rolling back. The runbook covers `tundra rollback-version` for emergency reversion.

---

## 11. Routine Quarterly Review

Run this every quarter. Calendar-block it.

### 11.1 Operator Hygiene

- ☐ Operators list reviewed; departed people removed
- ☐ All owner/admin operators have 2FA enabled
- ☐ API tokens reviewed; unused tokens revoked
- ☐ API tokens with unbounded expiry have been considered for replacement with bounded ones

### 11.2 Plugin Hygiene

- ☐ Installed plugins are all still needed
- ☐ Plugins have been updated to their latest stable versions
- ☐ No plugin has capabilities it no longer needs

### 11.3 Security Posture

- ☐ Tundra is on a current stable release (or LTS if you're on the LTS channel)
- ☐ No outstanding security advisories apply
- ☐ TLS certificates are healthy; auto-renew working
- ☐ Operator audit log spot-checked for anomalies

### 11.4 Backups Tested

- ☐ A restore test was performed this quarter (do this here if not done since last quarter)
- ☐ Restore time was within acceptable RTO
- ☐ Restored data was complete (RPO objective met)
- ☐ Self-backup tested by spinning up a recovery to a temporary host

### 11.5 Capacity

- ☐ No managed server is consistently above 80% disk
- ☐ No managed server is consistently above 80% memory
- ☐ Database growth is sustainable; old events/metrics partitions being dropped on schedule
- ☐ Sufficient headroom for new sites/servers without upgrade

### 11.6 Documentation

- ☐ Your team's local runbook is up to date
- ☐ Recovery procedures still match the deployment
- ☐ On-call rotation knows how to handle Tundra incidents

---

## 12. Disaster Recovery Test

Run this annually, or before any major architectural change. This is the test that proves your backups actually save you.

### 12.1 Preparation

- ☐ Schedule a maintenance window
- ☐ Notify stakeholders
- ☐ Prepare a fresh test host (separate from production)
- ☐ Have your recovery passphrase ready

### 12.2 Recovery to a Fresh Host

- ☐ Run `tundra recover` on the fresh host pointing at the off-host backup repo
- ☐ The recovery completes successfully
- ☐ The new "panel" comes up with the restored database
- ☐ Sign in as the owner with your existing credentials

### 12.3 Verify Restoration

- ☐ All servers, sites, domains, certificates appear correctly
- ☐ Operator accounts are intact
- ☐ Plugin state is intact
- ☐ Audit log is intact

### 12.4 Verify Agent Reconnection (if testing in a network where agents can reach the test host)

- ☐ Agents reconnect to the recovered control plane (this requires the test host to either share the production hostname or have its own enrollment for a test agent)
- ☐ Agent capabilities re-detected
- ☐ Sites reachable

### 12.5 Document Findings

- ☐ Total recovery time noted (target RTO: 4 hours)
- ☐ Data freshness noted (target RPO: 15 minutes)
- ☐ Any procedural friction documented for runbook update
- ☐ Test host torn down

---

## 13. Security Review

Run this every six months or after any security incident.

### 13.1 Access

- ☐ All operator accounts use strong passwords (enforce policy if not)
- ☐ All owner/admin accounts use 2FA
- ☐ No shared accounts (every human has their own)
- ☐ No API tokens are unnecessarily long-lived
- ☐ SSH access to the panel host is restricted (key-only, IP allowlist or bastion)

### 13.2 Audit Log Review

- ☐ Review the audit log for the past month
- ☐ All actions trace to known operators
- ☐ No unexpected secret reveals
- ☐ No unexpected privilege escalations
- ☐ No unexpected plugin installs

### 13.3 Surface Area

- ☐ No unnecessary services running on the panel host
- ☐ Only TCP 443, 80, 7401 (control plane) are open externally
- ☐ Postgres and Valkey are bound to localhost
- ☐ Metrics endpoint is bound to localhost

### 13.4 Supply Chain

- ☐ Tundra binary signature was verified at last upgrade
- ☐ Plugins are from trusted sources only
- ☐ The OS receives security updates (`unattended-upgrades` running)

### 13.5 Incident Readiness

- ☐ Your team has an incident response plan that covers Tundra
- ☐ The plan has been exercised (tabletop or live)
- ☐ Contact information for on-call is current
- ☐ The recovery passphrase is accessible to whoever would need to use it in an emergency

---

## 14. Sign-Off Template

For formal acceptance (e.g., handing a deployment from setup to operations), use the template below.

```
Tundra Deployment Acceptance — Sign-Off

Project name:    _______________________________
Deployment mode: [ ] Single-server  [ ] Control-plane
Panel hostname:  _______________________________
Number of managed servers:    ___
Number of sites at acceptance: ___

Checklists completed:
[ ] §2 / §3  Install
[ ] §4       Server enrollment
[ ] §5       First site
[ ] §6       First deploy
[ ] §7       Backups (CRITICAL)
[ ] §8       Mail (if used)
[ ] §9       Plugins (if installed)
[ ] §13      Security review

Outstanding items (any unchecked above):
________________________________________________
________________________________________________

Operator acceptance:
   Name:      _______________________________
   Role:      _______________________________
   Signature: _______________________________
   Date:      _______________________________

Engineering acceptance:
   Name:      _______________________________
   Role:      _______________________________
   Signature: _______________________________
   Date:      _______________________________
```

---

## 15. Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.0 | May 2026 | Al Amin Ahamed | Initial complete acceptance checklist. Install (single-server, control-plane), server enrollment, first site, first deploy, backups, mail, plugins, upgrade, quarterly review, disaster recovery test, security review, sign-off template. |

**Companion Documents:**

- `tundra-deployment-overview-v1.md` — what to expect from a deployment
- `tundra-deployment-runbook-v1.md` — engineering edition with the commands behind these checks
- `tundra-security-overview-v1.md` — operator-facing security context
- `tundra-test-plan-v1.md` — engineering test architecture (this is the operator-facing companion)
