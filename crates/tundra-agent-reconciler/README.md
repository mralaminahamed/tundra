# tundra-agent-reconciler

Desired-state reconciliation engine for `tundra-agent`. Receives a desired-state document from `tundrad` and drives the managed server toward it.

## Model

The reconciler is **declarative and idempotent**. `tundrad` sends a complete desired-state document describing what the server should look like (PHP versions installed, PHP-FPM pools configured, Nginx vhosts, systemd units, firewall rules). The reconciler diffs current state against desired state and issues only the changes needed.

## Providers

Each resource type has a `Provider` implementation in `tundra-agent-providers`:
- `NginxProvider` — renders and reloads Nginx configuration
- `PhpFpmProvider` — manages PHP-FPM pools per site
- `SystemdProvider` — starts/stops/enables systemd units
- `FirewallProvider` — applies nftables/iptables rules

## Atomicity

Multi-step changes are written to staging directories and atomically swapped. For example:
1. New Nginx config written to `/etc/nginx/sites-available/<site>.tmp`
2. Validated with `nginx -t`
3. Renamed to final path
4. `nginx -s reload`
If any step fails, the staging file is removed and the previous config remains active.
