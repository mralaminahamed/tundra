---
title: Deploy a Site
description: Deploy your first web application with Tundra.
sidebar:
  order: 4
---

import { Steps, Aside, Tabs, TabItem } from '@astrojs/starlight/components'

## Create a site

<Steps>

1. **Open the Create Site wizard**

   Go to **Sites → New Site**.

2. **Choose a source**

   | Source | Use when |
   |--------|---------|
   | **Blank** | Empty directory, configure manually |
   | **WordPress** | Install WordPress via WP-CLI |
   | **Template** | Pick from 13 built-in starter templates |
   | **GitHub** | Clone from a GitHub repository |
   | **GitLab** | Clone from a GitLab repository |
   | **Bitbucket** | Clone from a Bitbucket repository |
   | **ZIP** | Upload a ZIP archive |

3. **Configure the runtime**

   Select your runtime and version:

   - **PHP** — 8.1, 8.2, 8.3, 8.4 (with EOL and security-only badges)
   - **Node.js** — 20 LTS, 22 LTS, 24
   - **Python** — 3.11, 3.12, 3.13
   - **Go** — 1.22, 1.23, 1.24
   - **Rust** — stable, beta
   - **Ruby** — 3.2, 3.3, 3.4
   - **.NET** — 8, 9

4. **Set the domain**

   Enter the primary domain (e.g. `example.com`). Tundra automatically:
   - Provisions a Caddy vhost
   - Requests a TLS certificate from Let's Encrypt

5. **Choose a server**

   Select which enrolled server to deploy to.

6. **Create**

   Tundra provisions the site directory, configures the web server and runtime, and shows deployment logs in real time.

</Steps>

## Deployment flow

Every push to the site triggers a 6-stage blue/green deployment:

```
clone → build → release-dir → env-write → symlink-swap → prune
```

The live directory is an atomic symlink swap — zero-downtime. Tundra keeps the last 5 releases for instant rollback.

## Rolling back

Go to **Sites → [site] → Deployments**, find any previous deployment, and click **Roll back**. The symlink swaps back in milliseconds.

## Starter templates

Tundra ships 13 built-in templates:

<Tabs>
  <TabItem label="PHP">
    - **WordPress** — full WP install via WP-CLI
    - **WooCommerce** — WordPress + WooCommerce plugin
    - **Laravel** — Laravel with Vite frontend
  </TabItem>
  <TabItem label="JavaScript">
    - **Next.js** — App Router, TypeScript
    - **Nuxt** — Nuxt 3, TypeScript
    - **Remix** — Remix with Vite
    - **Node API** — Express + TypeScript
  </TabItem>
  <TabItem label="Python">
    - **Django** — Django 5 with Gunicorn
    - **FastAPI** — FastAPI with Uvicorn
  </TabItem>
  <TabItem label="Other">
    - **Rails** — Ruby on Rails 7
    - **Go API** — net/http + chi
    - **Rust API** — Axum 0.8
    - **Static** — plain HTML/CSS/JS
  </TabItem>
</Tabs>

## Environment variables

Add environment variables in **Sites → [site] → Settings → Environment**.  
Secret values are encrypted at rest with AES-256-GCM.

<Aside type="caution">
Never commit `.env` files with real secrets to your repository. Use Tundra's encrypted environment variable store instead.
</Aside>
