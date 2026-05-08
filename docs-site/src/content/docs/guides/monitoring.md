---
title: Monitoring & Alerts
description: Server and site metrics, alert rules, and notification channels.
---

## Metrics

Tundra scrapes metrics from each enrolled server every 30 seconds:

| Metric | Granularity |
|--------|-------------|
| CPU usage (%) | Per-core + aggregate |
| RAM usage (MB / %) | Used, cached, free |
| Disk usage (GB / %) | Per-mount |
| Network I/O (bytes/s) | Per-interface |
| Site request rate | Per-site, from Caddy logs |
| Site error rate | 4xx and 5xx counts |

Metrics are stored in `metrics_samples`, partitioned by week.

## Alert rules

Go to **Alerts → Rules → Add** to create threshold-based alerts:

| Field | Example |
|-------|---------|
| Metric | `server.cpu_usage_pct` |
| Condition | `> 90` |
| Duration | `5 minutes` (alert only if sustained) |
| Cooldown | `30 minutes` (suppress repeated firings) |

### Delivery channels

| Channel | Configuration |
|---------|--------------|
| Email | SMTP settings in **Settings → SMTP** |
| Slack | Webhook URL |
| Discord | Webhook URL |
| PagerDuty | Integration key |

Configure channels in **Settings → Notifications**.

## Active alerts

**Alerts → Active** shows currently firing alerts with time, severity, and affected resource.  
Click an alert to see the metric chart that triggered it.

## Dashboard

The main dashboard shows a fleet health summary:

- Server count with active/degraded breakdown
- Site count with active/provisioning breakdown
- Domain count
- Alert rule count and current firing count

Click any card to drill into the resource list.
