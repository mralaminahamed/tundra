---
title: Quick Install
description: Install Tundra on a fresh server in under 5 minutes.
sidebar:
  order: 2
---

import { Aside, Steps, Tabs, TabItem } from '@astrojs/starlight/components'

## Prerequisites

- A fresh VPS or dedicated server
- Root or sudo access
- One of: Ubuntu 24.04, Debian 12/13, RHEL 9/10
- Ports 80, 443, 7400, 7447 open in your firewall

## One-line install

```bash
curl -fsSL https://raw.githubusercontent.com/mralaminahamed/tundra/main/installer/install.sh | sudo bash
```

The installer will:

1. Install PostgreSQL 18, Valkey 8, Caddy, and system dependencies
2. Create the `tundra` system user
3. Download and verify binaries (SHA-256 + SLSA provenance)
4. Generate a master encryption key
5. Run database migrations
6. Configure and start systemd services
7. Self-register the local server
8. Print the setup URL

<Aside type="tip">
Verify the installer SHA-256 before running in production. See the [security docs](/tundra/self-hosting/security/) for verification steps.
</Aside>

## Setup wizard

After install, visit the printed URL (typically `http://your-server-ip:7400/setup`) to create your owner account.

The setup wizard is a two-step flow:

1. **Account** — name, email, password (minimum 8 characters, strength meter shown)
2. **Configure** — optional instance name displayed in the panel header

Once complete, sign in with your new credentials.

## Manual install (advanced)

<Steps>

1. **Download binaries**

   ```bash
   VERSION=1.0.0
   curl -fsSL "https://github.com/mralaminahamed/tundra/releases/download/v${VERSION}/tundrad-linux-x86_64.tar.gz" \
     | sudo tar -xz -C /usr/local/bin
   ```

2. **Create system user and directories**

   ```bash
   sudo useradd --system --home /var/lib/tundra --shell /usr/sbin/nologin tundra
   sudo mkdir -p /var/lib/tundra/data /etc/tundra
   sudo chown -R tundra:tundra /var/lib/tundra
   ```

3. **Generate master key**

   ```bash
   sudo -u tundra tundrad master-key generate --path /var/lib/tundra/data/master.key
   ```

4. **Configure**

   ```bash
   sudo tee /etc/tundra/tundrad.toml <<'EOF'
   [server]
   listen_addr = "0.0.0.0"
   port        = 7400

   [database]
   url = "postgres://tundra@/tundra?host=/var/run/postgresql"

   [security]
   master_key_path = "/var/lib/tundra/data/master.key"
   EOF
   ```

5. **Run migrations**

   ```bash
   sudo -u tundra tundrad migrate
   ```

6. **Start the service**

   ```bash
   sudo systemctl enable --now tundrad
   ```

</Steps>

## Docker Compose

For a containerised deployment, see the [Docker Compose guide](/tundra/self-hosting/docker-compose/).

## Post-install checklist

- [ ] Visit `/setup` and create your owner account
- [ ] Configure a reverse proxy with TLS (Caddy handles this automatically)
- [ ] Set up your first backup target in **Backups → Targets**
- [ ] Review the [security hardening guide](/tundra/self-hosting/security/)
