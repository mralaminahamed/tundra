---
title: Plugin Overview
description: Extend Tundra with first-party and third-party plugins.
sidebar:
  order: 1
---

import { Card, CardGrid } from '@astrojs/starlight/components'

Tundra's plugin system uses **Wasmtime** to run plugins in an isolated sandbox. Plugins can't escape the sandbox: all host interactions go through a capability-checked API.

## Official plugins

<CardGrid>
  <Card title="WordPress" icon="puzzle">
    WP-CLI lifecycle management, plugin/theme registry, staging, cloning.
  </Card>
  <Card title="GitHub" icon="github">
    GitHub App auth, webhook-triggered deploys, PR preview environments.
  </Card>
  <Card title="Namecheap" icon="external">
    Domain registrar — NS updates, auto-renewal, DNS sync.
  </Card>
  <Card title="MCP Server" icon="star">
    Model Context Protocol — connect Claude, Cursor, Zed to manage infrastructure via AI.
  </Card>
  <Card title="Cloudflare" icon="external">
    DNS management and CDN integration via Cloudflare API.
  </Card>
  <Card title="Mailgun" icon="email">
    Transactional email via Mailgun API.
  </Card>
</CardGrid>

## Plugin capabilities

Plugins declare capabilities in their manifest. Tundra enforces at the host-call level:

| Capability | What it allows |
|-----------|---------------|
| `http.outbound` | Make outbound HTTP requests (allowlist of domains) |
| `kv.read` / `kv.write` | Read/write plugin key-value store |
| `events.publish` | Publish events to tundrad |
| `audit.write` | Write audit log entries |
| `sites.read` | Read site metadata |
| `deployments.trigger` | Trigger a deployment |

## Plugin marketplace

Browse and install plugins in **Plugins → Marketplace**.

- **Available** tab — plugins not yet installed
- **Installed** tab — installed plugins with enable/disable/uninstall

## Plugin settings

Each plugin has an isolated settings store (AES-256-GCM encrypted). Configure in **Plugins → [plugin] → Settings**.
