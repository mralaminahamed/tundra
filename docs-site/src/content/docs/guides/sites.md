---
title: Sites & Deployments
description: Manage web application sites, deployments, and rollbacks.
---

import { Aside } from '@astrojs/starlight/components'

## Site detail tabs

Each site has 10 nested sections:

| Tab | What's here |
|-----|------------|
| **Overview** | Status, domain, server, recent deployments |
| **Files** | In-browser file manager and code editor |
| **Deployments** | Deployment history, logs, rollback |
| **Databases** | Databases linked to this site |
| **PHP** | PHP version picker, FPM pool settings |
| **Logs** | Real-time and historical access/error logs |
| **Analytics** | Page views, bandwidth, top paths |
| **SSL** | Certificate status, force-renew |
| **Backups** | Site-scoped backup jobs and snapshots |
| **Settings** | Domain aliases, environment variables, danger zone |

## Deployment sources

Sites can be deployed from:

- **Git** — GitHub, GitLab, Bitbucket (webhook-triggered or manual)
- **Template** — one of 13 built-in starter templates
- **ZIP** — upload an archive
- **WordPress** — WP-CLI managed install

## Blue/green deployment

Every deployment follows a 6-stage pipeline:

```
1. clone       Clone or extract source to a release directory
2. build       Run build commands (npm run build, cargo build, etc.)
3. release-dir Create /srv/sites/{site}/releases/{timestamp}/
4. env-write   Write encrypted env vars to .env in the release dir
5. symlink-swap Atomically swap /srv/sites/{site}/current → new release
6. prune       Remove releases older than the last 5
```

The symlink swap is atomic — no downtime between old and new version.

## Rollback

Go to **Deployments**, find any previous release, click **Roll back**.  
The current symlink points back to the old release directory.

## Daemons

Long-running processes (queue workers, WebSocket servers) are managed as daemons:

- Go to **Sites → [site] → Settings → Daemons**
- Set command, working directory, environment, restart policy
- Tundra writes a systemd unit and manages it via the agent

## Scheduled tasks

Cron-style tasks run on the server's local timezone:

```
# Examples
0 2 * * *     php artisan schedule:run
*/5 * * * *   node scripts/sync.js
```

<Aside type="tip">
Use the **Run now** button to test scheduled tasks without waiting for the next scheduled time.
</Aside>
