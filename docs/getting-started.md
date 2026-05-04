# Getting Started with Tundra

## Prerequisites

- Ubuntu 24.04 LTS, Debian 12, or RHEL 9 server
- 4 GiB RAM, 40 GiB disk, public IPv4
- A subdomain pointing at the server (`panel.example.com`)

## Install

```bash
curl -fsSL https://tundra.dev/install.sh | sudo bash
```

The installer takes ~3 minutes and prints a setup URL when done.
Visit the URL within 30 minutes to create your owner account.

## Add a server

In the panel: **Servers → Add Server**. The wizard:
1. Asks for a hostname
2. Shows the SSH fingerprint for you to confirm
3. Installs the agent over SSH
4. Connects the agent back to Tundra via mTLS

Or via CLI:
```bash
tundra server add vps.example.com
# Prints: ssh tundra@vps.example.com 'curl ... | bash -s -- --token=...'
```

## Deploy your first site

In the panel: **Sites → Create site**. Pick a template or blank:
- Select a server
- Enter a domain
- Choose runtime (PHP, Node.js, Python, Go, etc.)
- Connect a git repository

Tundra provisions the site, issues a TLS certificate, and runs the first deploy.

## Verify your installation

```bash
tundra acceptance run --url https://panel.example.com --section smoke
tundra acceptance run --url https://panel.example.com --section identity
```

Run `--section all` for the full suite before going to production.

## Next steps

- [Backups](../docs/02-operations/tundra-deployment-overview-v1.md#6-back-up-tundra-itself) — configure before going to production
- [Plugins](../docs/05-extensibility/tundra-plugin-architecture-plan-v1.md) — extend Tundra without forking
- [MCP server](../docs/06-mcp-server/tundra-mcp-server-operator-v1.md) — connect AI agents
- [Security](security.md) — hardening checklist
