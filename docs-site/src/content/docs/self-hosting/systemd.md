---
title: Systemd (Production)
description: Run Tundra as hardened systemd services.
sidebar:
  order: 3
---

The `install.sh` script installs Tundra as two systemd services: `tundrad` and `tundra-agent`.

## Service overview

```bash
systemctl status tundrad        # Control plane
systemctl status tundra-agent   # Local agent
```

## Service files

### tundrad.service

```ini
[Unit]
Description=Tundra control plane
After=network.target postgresql.service

[Service]
Type=simple
User=tundra
Group=tundra
ExecStart=/usr/local/bin/tundrad serve
Restart=on-failure
RestartSec=5s

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/tundra
CapabilityBoundingSet=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
```

### tundra-agent.service

```ini
[Unit]
Description=Tundra agent
After=network.target

[Service]
Type=simple
User=tundra-agent
ExecStart=/usr/local/bin/tundra-agent serve
Restart=on-failure
RuntimeDirectory=tundra-agent

[Install]
WantedBy=multi-user.target
```

## Common operations

```bash
# View logs
journalctl -u tundrad -f
journalctl -u tundra-agent -f

# Restart after config change
systemctl restart tundrad

# Apply migrations manually
sudo -u tundra tundrad migrate

# Check health
curl -fsS http://localhost:7400/api/v1/healthz
curl -fsS http://localhost:7400/api/v1/readyz   # includes DB probe
```

## Log rotation

Logs go to systemd journal by default. To also write to files:

```toml
# /etc/tundra/tundrad.toml
[telemetry]
log_format = "json"
```

Then configure `logrotate` or use `journald`'s built-in rotation.
