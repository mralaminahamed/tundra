---
title: WordPress
description: Install, configure, and manage WordPress sites with Tundra.
---

import { Steps, Aside, Tabs, TabItem } from '@astrojs/starlight/components'

Tundra provides first-class WordPress support via the `tundrad-plugin-wordpress` plugin, which uses WP-CLI for all lifecycle operations.

## Installing WordPress

<Steps>

1. Create a new site and select **WordPress** as the source.
2. Choose PHP version (8.2+ recommended).
3. Enter the primary domain.
4. Complete the 3-step install wizard:
   - **Step 1**: Site title, admin username, admin email
   - **Step 2**: Database settings (auto-generated credentials)
   - **Step 3**: Confirm and install

</Steps>

Tundra runs the full WP-CLI provisioning sequence:
- Creates a dedicated MySQL database and user
- Installs WordPress core via `wp core download` + `wp core install`
- Configures `wp-config.php` with encrypted credentials
- Sets up `wp-cron` as a proper systemd timer

## WordPress detail tabs

| Tab | What's here |
|-----|------------|
| **Overview** | Version, PHP, disk usage, SSL status, last backup |
| **Plugins** | Install/activate/deactivate/delete via WP.org search |
| **Themes** | Install/activate/delete via WP.org search |
| **Users** | WordPress user list, role management |
| **PHP** | PHP version picker with searchable combobox |
| **Database** | Connection details, password rotation, phpMyAdmin SQL editor |
| **Security** | File editing toggle, security checklist |
| **Backups** | Site-scoped snapshots |
| **Danger** | Delete installation, reset admin password |

## Plugin & theme management

Search WordPress.org directly from the panel:

```
Plugins → Search WP.org → install → activate
```

Tundra runs WP-CLI commands on the server:
- `wp plugin install {slug} --activate`
- `wp theme install {slug} --activate`
- `wp plugin update --all`

## PHP version management

Change PHP version without downtime:

1. Go to **WordPress → [install] → PHP**
2. Select a new version from the searchable picker
3. Tundra reconfigures the PHP-FPM pool and reloads Caddy

## Database tools

The built-in SQL editor (phpMyAdmin-style) supports:

- Syntax-highlighted SQL (CodeMirror, MySQL dialect)
- Dark and light mode
- Query results in a scrollable table
- Connection details with masked password + reveal button
- One-click password rotation (generates new credentials, updates wp-config.php)

## Staging and cloning

<Tabs>
  <TabItem label="Create staging">
    1. Go to **WordPress → [install] → Overview**
    2. Click **Create staging**
    3. Tundra: DB dump → file copy → new credentials → GUID rewrite → new domain
  </TabItem>
  <TabItem label="Clone to new site">
    1. Click **Clone**
    2. Enter the destination domain
    3. Tundra performs the same pipeline to a new site
  </TabItem>
  <TabItem label="Promote staging to production">
    1. On the staging install, click **Promote to production**
    2. Confirm — Tundra swaps the databases and file trees atomically
  </TabItem>
</Tabs>

<Aside type="caution">
Promoting staging to production replaces the production database. Back up first in **Backups**.
</Aside>

## Per-install database isolation

Each WordPress install gets its own MySQL database and user:

```
Database: wp_site123_production
User:     wp_site123_usr
Password: (auto-generated, encrypted at rest)
```

No WordPress install shares credentials with another, limiting blast radius if one is compromised.
