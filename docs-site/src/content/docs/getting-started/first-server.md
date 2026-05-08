---
title: Add Your First Server
description: Enroll a managed server into your Tundra fleet.
sidebar:
  order: 3
---

import { Steps, Aside } from '@astrojs/starlight/components'

Tundra manages servers through the `tundra-agent` — a lightweight binary that runs on each server and communicates with the control plane over mTLS gRPC.

## Single-host mode (same server)

If you installed Tundra on the server you want to manage, the local server is **automatically enrolled** during install. You'll see it in **Servers** with status `Active`.

## Adding a remote server

<Steps>

1. **Open the Add Server wizard**

   In the panel, go to **Servers → Add Server**.

2. **Enter the server details**

   - Hostname or IP address
   - SSH port (default: 22)
   - SSH username (must have sudo)
   - SSH key or password

3. **Confirm the SSH fingerprint**

   Tundra connects over SSH and shows the server's host key fingerprint. Verify it matches your server before proceeding.

4. **Install the agent**

   Tundra runs the agent install script over SSH. The agent is installed as a systemd service and immediately enrolls with the control plane using a short-lived setup token.

5. **Verify enrollment**

   The server status changes from `Enrolling` → `Active` once the agent connects. CPU, RAM, and disk metrics appear within 30 seconds.

</Steps>

## Manual enrollment

If SSH access isn't available, you can enroll manually:

```bash
# On the control plane — generate an enrollment token
tundra server token create --server-id <id>

# On the managed server — run the agent installer
curl -fsSL https://tundra.dev/agent-install.sh | sudo bash -s -- \
  --control-plane https://your-panel.example.com:7447 \
  --token tnd_setup_<token>
```

<Aside type="note">
Setup tokens expire after 24 hours. Generate a new one if enrollment doesn't complete in time.
</Aside>

## What the agent manages

Once enrolled, the agent handles:

| Capability | Details |
|-----------|---------|
| **Site provisioning** | Creates directories, configures Caddy vhosts, PHP-FPM pools |
| **Deployments** | Blue/green with atomic symlink swap |
| **Certificates** | ACME via Let's Encrypt / ZeroSSL |
| **Metrics** | CPU, RAM, disk, network — scraped every 30s |
| **Logs** | Forwards site logs to tundrad over gRPC stream |

## Server detail page

Click a server to see:

- **Overview** — uptime, resource usage, OS, agent version
- **Sites** — sites hosted on this server
- **Databases** — database servers and instances
- **Firewall** — inbound/outbound rules
- **Updates** — pending system package updates
- **Processes** — running processes (top 20 by CPU)
- **SSH** — web-based terminal via xterm.js
