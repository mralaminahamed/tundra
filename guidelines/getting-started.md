# Tundra — Getting Started

Operator guide: install Tundra, add your first server, deploy your first site, and go to production.

---

## Requirements

- **OS:** Ubuntu 24.04 LTS, Debian 12/13, or RHEL 9/10
- **Hardware:** 4 GiB RAM, 40 GiB disk, public IPv4
- **DNS:** A record for your panel subdomain pointing at the server (`panel.example.com`)

---

## Install

```bash
curl -fsSL https://tundra.dev/install.sh | sudo bash
```

The installer takes ~3 minutes. At the end it prints a setup URL — visit it within 30 minutes to create the owner account.

> **Verify before running in production.** The installer is minisign-signed. Check `docs/security.md` for the verification steps.

---

## Add your first server

Tundra controls servers via a lightweight agent it installs over SSH.

**Panel:** Servers → Add Server

The wizard:
1. Asks for the server hostname
2. Shows the SSH fingerprint for you to confirm
3. Installs the agent over SSH
4. Connects the agent back to the control plane via mTLS

**CLI equivalent:**
```bash
tundra server add vps.example.com
```

For single-host mode (control plane + sites on the same machine), the agent is already installed and connected over a Unix domain socket.

---

## Deploy your first site

**Panel:** Sites → New Site

1. **Source** — pick a template (WordPress, Laravel, Next.js, Django, Rails, and 8 more), connect a GitHub/GitLab repo, or start blank
2. **Application** — runtime (PHP, Node.js, Python, Go, Ruby, .NET, Static), version, build + start commands
3. **Domain** — primary domain + which server to deploy to
4. **Confirm** — review and submit

Tundra provisions the site directory, issues a TLS certificate via Let's Encrypt, and queues the first deployment. The site detail page shows live build logs.

### Site templates

| Template    | Runtime     | Notes                                     |
|-------------|-------------|-------------------------------------------|
| Static      | —           | Plain HTML/CSS/JS, no build step required |
| Astro       | Node.js 22  | Static site generator                     |
| Hugo        | Go          | Fastest SSG; uses `hugo` binary           |
| Next.js     | Node.js 22  | React SSR/SSG; requires standalone output |
| SvelteKit   | Node.js 22  | Svelte framework                          |
| Laravel     | PHP 8.4     | PHP framework; Composer + artisan         |
| Django      | Python 3.13 | Gunicorn in production                    |
| FastAPI     | Python 3.13 | Uvicorn in production                     |
| Rails       | Ruby 3.4    | Puma in production                        |
| Ghost       | Node.js 22  | Publishing platform                       |
| Directus    | Node.js 22  | Headless CMS                              |
| Strapi      | Node.js 22  | Headless CMS                              |
| WordPress   | PHP 8.4     | Requires WordPress plugin (see below)     |
| WooCommerce | PHP 8.4     | Requires WordPress plugin                 |

WordPress and WooCommerce templates appear in the wizard only when the **WordPress plugin** is enabled (Plugins → WordPress → Enable).

---

## Manage databases

**Panel:** Databases → Create Database

Supports PostgreSQL, MySQL, MariaDB, and Valkey. Each database is bound to a server. Connection credentials are encrypted at rest and accessible from the site detail page.

---

## Set up email

**Panel:** Mail → Add Domain

Tundra provisions Postfix + Dovecot + Rspamd + DKIM for a domain. You control mailboxes, aliases, and spam rules per domain.

DNS records (MX, SPF, DKIM, DMARC) are shown after setup; apply them at your DNS provider.

---

## Backups

**Panel:** Servers → (server) → Backups

Backups use restic under the hood. Configure a backup target (local, S3-compatible, or SFTP), a schedule, and a GPG public key for encryption. Tundra never has your GPG private key.

Restore shows a diff of what will change before it applies anything (preview-then-confirm).

---

## Plugins

Tundra ships with core plugins disabled by default. Enable them from **Plugins**.

| Plugin          | What it adds                                                         |
|-----------------|----------------------------------------------------------------------|
| WordPress       | One-click WP/WooCommerce installs; per-site plugin and theme manager |
| AI Agents (MCP) | Connect Claude, Cursor, Zed, and other AI agents                     |
| Namecheap       | DNS management via Namecheap API                                     |
| GitHub          | Webhook-triggered deployments from GitHub                            |
| Plesk Migration | Import sites from Plesk                                              |
| Cloudflare DNS  | DNS management via Cloudflare API                                    |
| Mailgun         | Smarthost relay via Mailgun                                          |
| Slack Alerts    | Push deployment and alert notifications to Slack                     |
| Discord Alerts  | Push deployment and alert notifications to Discord                   |
| S3 Backup       | Backup target using any S3-compatible storage                        |

---

## Verify your installation

```bash
tundra acceptance run --url https://panel.example.com --section smoke
tundra acceptance run --url https://panel.example.com --section identity
tundra acceptance run --url https://panel.example.com --section all
```

Run `--section all` before going to production. The acceptance CLI checks TLS config, auth flows, agent connectivity, and key management.

---

## Upgrade

```bash
sudo tundra upgrade
```

The upgrade process: downloads + verifies the new binary, dry-runs migrations, applies migrations, atomically swaps the binary, restarts `tundrad`. Auto-rolls back if startup fails within 30 seconds.

To upgrade to a specific version:
```bash
sudo tundra upgrade --version 1.2.4
```

See `docs/UPGRADING.md` for the full migration policy and major-version upgrade notes.

---

## Next steps

- [MCP Guide](mcp-guide.md) — connect an AI agent to your panel
- [Plugin Development](plugin-development.md) — write your own plugin
- [API Reference](api-reference.md) — automate Tundra via the REST API
- [Deployment Runbook](../docs/02-operations/tundra-deployment-runbook-v1.md) — manual install, HA setup, disaster recovery
- [Security Overview](../docs/security.md) — hardening checklist and trust model
