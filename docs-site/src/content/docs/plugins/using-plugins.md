---
title: Using Plugins
description: Install, enable, configure, and update plugins.
sidebar:
  order: 2
---

## Installing a plugin

1. Go to **Plugins → Marketplace**
2. Find the plugin and click **Install**
3. Review the requested capabilities
4. Click **Confirm** — the plugin is downloaded, verified, and installed into the Wasmtime sandbox

## Enabling and disabling

Toggle the **Enabled** switch on any installed plugin. Disabling a plugin:
- Stops all running plugin jobs
- Disconnects any active MCP sessions
- Preserves plugin settings and data

Re-enabling restores the plugin to its previous state.

## Plugin settings

Each plugin has its own settings page: **Plugins → [plugin] → Settings**.

Settings are stored in an isolated key-value store, encrypted at rest (AES-256-GCM).

## Updating plugins

When a new version is available, a badge appears on the plugin card. Click **Update** to install the new version.

Updates are atomic — if the new version fails to load, the previous version is restored.

## Uninstalling

**Plugins → [plugin] → Uninstall**

This permanently deletes the plugin's settings, kv data, and job history. A confirmation is required.

## Plugin sandboxing

All plugins run inside a Wasmtime sandbox:

- **Fuel limit** — prevents infinite loops (default: 100M instructions per invocation)
- **Memory limit** — 256 MB per plugin
- **Epoch interrupts** — watchdog timer kills stuck plugins
- **Capability gate** — every host API call is checked against the plugin's declared capabilities; unauthorized calls return an error, not a crash
