---
title: MCP Integration
description: Connect Claude Code, Claude Desktop, Cursor, and Zed to Tundra via the Model Context Protocol.
sidebar:
  order: 4
---

import { Tabs, TabItem, Steps, Aside } from '@astrojs/starlight/components'

The Tundra MCP plugin exposes your infrastructure as an MCP server, letting AI tools manage servers, sites, databases, DNS, and more through natural language.

## Enabling MCP

1. Go to **Plugins → Marketplace → MCP Server → Install**
2. Once installed, go to **Settings → AI Agents (MCP)**
3. Click **Create token** — choose a scope and expiry
4. Copy the connection URL

## Connecting your AI tool

<Tabs>
  <TabItem label="Claude Code">
    ```bash
    # Add to your Claude Code MCP config
    claude mcp add tundra \
      --transport http \
      --url https://panel.example.com/mcp/v1 \
      --header "Authorization: Bearer tnd_mcp_<token>"
    ```
  </TabItem>
  <TabItem label="Claude Desktop">
    Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
    ```json
    {
      "mcpServers": {
        "tundra": {
          "command": "npx",
          "args": ["-y", "@tundra/mcp-client"],
          "env": {
            "TUNDRA_URL": "https://panel.example.com",
            "TUNDRA_TOKEN": "tnd_mcp_<token>"
          }
        }
      }
    }
    ```
  </TabItem>
  <TabItem label="Cursor">
    In Cursor settings → MCP → Add server:
    ```json
    {
      "name": "tundra",
      "transport": "http",
      "url": "https://panel.example.com/mcp/v1",
      "headers": {
        "Authorization": "Bearer tnd_mcp_<token>"
      }
    }
    ```
  </TabItem>
  <TabItem label="Zed">
    Add to `~/.config/zed/settings.json`:
    ```json
    {
      "context_servers": {
        "tundra": {
          "command": {
            "path": "npx",
            "args": ["-y", "@tundra/mcp-client"],
            "env": {
              "TUNDRA_URL": "https://panel.example.com",
              "TUNDRA_TOKEN": "tnd_mcp_<token>"
            }
          }
        }
      }
    }
    ```
  </TabItem>
</Tabs>

## Available tools

| Tool | What it does |
|------|-------------|
| `list_servers` | List all enrolled servers |
| `list_sites` | List sites with status |
| `create_site` | Provision a new site |
| `trigger_deployment` | Deploy a site |
| `rollback_deployment` | Roll back to a previous release |
| `list_databases` | List databases |
| `list_domains` | List domains and DNS zones |
| `get_audit_log` | Fetch recent audit entries |
| `get_metrics` | Get server metrics |

## Token scopes

MCP tokens can be scoped to limit what the AI can do:

| Scope | Access |
|-------|--------|
| `read` | List and read all resources |
| `deployments` | Trigger and roll back deployments |
| `sites` | Create and manage sites |
| `admin` | Full access (same as owner session) |

<Aside type="tip">
For AI tools used in code review or planning, use a `read`-only token. Reserve `deployments` scope for CI/CD automations.
</Aside>

## Audit trail

All MCP tool invocations are logged in `plugin_mcp_tool_invocations` and visible in **Settings → Audit Log** filtered by `actor_type = mcp_token`.
