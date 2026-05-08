---
title: Multi-server Fleet
description: Manage multiple servers, move sites between them, and handle maintenance.
---

## Fleet overview

The **Servers** list shows all enrolled servers grouped by region:

| Column | Details |
|--------|---------|
| Name | Hostname, OS, region |
| Status | Active / Degraded / Maintenance |
| Agent | Version, last heartbeat |
| CPU/RAM/Disk | Latest snapshot from metrics |
| Sites | Site count on this server |

## Moving a site between servers

Cross-server site move uses a 7-stage atomic pipeline:

```
1. snapshot      Create a point-in-time snapshot on the source server
2. push          Transfer files + DB dump to the destination server
3. verify        Checksum verification on destination
4. cut-over      Swap the site's server assignment in tundrad
5. DNS update    Update A/AAAA records to destination IP
6. cleanup       Remove transferred files from source
7. confirm       Operator confirms move is complete
```

Each stage is recorded in `site_moves`. If any stage fails, the move can be retried from that stage.

**Start a move:** Go to **Sites → [site] → Settings → Move to server**.

## Maintenance windows

Schedule downtime for planned maintenance:

1. Go to **Servers → [server] → Maintenance**
2. Set start time, duration, and reason
3. During a maintenance window:
   - Alerts for this server are suppressed
   - Deployments are queued (not blocked)
   - The server shows a `Maintenance` badge in the fleet view

## Rate limiting and circuit breaker

The agent connection has built-in reliability mechanisms:

- **Rate limiter** — token bucket per agent; prevents a misbehaving agent from flooding the control plane
- **Circuit breaker** — if an agent fails health checks N times, the circuit opens and tundrad stops sending operations until the agent recovers (half-open probe every 30s)

## Agent certificates

Each agent has a short-lived mTLS client certificate issued by Tundra's internal CA:

- 1-year validity, auto-renewed 30 days before expiry
- SAN URI: `tundra-agent://server-{id}`
- Private key never leaves the agent host

Rotate agent certificates manually: **Servers → [server] → Security → Rotate Certificate**.
