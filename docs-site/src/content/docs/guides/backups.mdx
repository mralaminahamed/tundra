---
title: Backups
description: Restic-backed, GPG-encrypted backups with preview-then-confirm restore.
---

import { Aside } from '@astrojs/starlight/components'

Tundra uses **restic** for content-addressed, deduplicated snapshots. Backups are GPG-encrypted before leaving the server — your private key never touches Tundra.

## Backup targets

A **target** defines where backups are stored:

| Storage | Connection |
|---------|-----------|
| Amazon S3 | Bucket + IAM credentials |
| Backblaze B2 | Bucket + application key |
| Wasabi | S3-compatible endpoint |
| Cloudflare R2 | S3-compatible endpoint |
| SFTP | Host + path + SSH key |
| Local | Path on the managed server |

**Add a target:** Go to **Backups → Targets → Add** → choose storage type → fill in credentials.  
Use **Test** to verify connectivity before saving.

## Backup jobs

A **job** schedules regular snapshots of a scope:

| Scope | What's backed up |
|-------|-----------------|
| Site | Document root + env vars |
| Database | `pg_dump` or `mysqldump` |
| Server | Full `/var/lib/tundra/data` |

**Create a job:** Go to **Backups → Jobs → New** → select scope, target, schedule, and retention policy.

### Retention policy

```
Keep last 7 daily, 4 weekly, 12 monthly snapshots.
```

Restic's `forget --prune` runs after each backup to remove expired snapshots.

### Run now

Click **Run now** on any job to trigger an immediate backup outside the schedule.

## Restoring

Tundra uses a **preview-then-confirm** flow to prevent accidental data loss:

1. Go to **Backups → Snapshots**
2. Find the snapshot to restore, click **Restore**
3. Review the **preview** — files and databases that will be overwritten
4. Click **Confirm restore** within 10 minutes (token expires)

<Aside type="caution">
Restore overwrites live data. Always create a fresh backup before restoring to a production environment.
</Aside>

## Self-backup (control plane)

Back up the Tundra control plane itself:

```bash
sudo -u tundra tundra-self-backup run
```

This creates: `pg_dump` → data-dir copy → SHA-256 checksums → manifest.json → tar → GPG encrypt.

Restore with:

```bash
sudo tundra-restore /path/to/backup.tar.gpg
```

The restore process verifies checksums, validates the manifest, recreates the DB, and verifies the master key before restarting services.
