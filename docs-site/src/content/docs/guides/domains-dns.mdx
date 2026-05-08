---
title: Domains & DNS
description: Manage domains, DNS zones, and use pre-built DNS templates.
---

import { Aside } from '@astrojs/starlight/components'

## Adding a domain

1. Go to **Domains → Add Domain**
2. Enter the apex domain (e.g. `example.com`)
3. Choose DNS management: **Tundra-managed** (PowerDNS) or **External** (point NS elsewhere)
4. Optionally link to a site

## DNS zone editor

Click a domain to open the DNS zone editor. The record table shows all records with:

- Type (A, AAAA, CNAME, MX, TXT, NS, SRV, CAA, DKIM, SPF, DMARC)
- Name, value, TTL
- Lock icon on managed records (created by Tundra — e.g. DKIM keys, ACME challenges)

### Adding a record

Click **Add Record**, fill in type/name/value/TTL, click **Save**.  
Tundra calls the PowerDNS HTTP API; changes propagate within the zone's SOA serial TTL.

### Batch import (DNS templates)

Click **Import Template** to apply a pre-built DNS configuration:

## DNS templates

Tundra ships 30 DNS templates across 5 categories:

| Category | Templates |
|----------|----------|
| **Web Hosting** | Basic web, dual-stack (IPv6), full hosting stack, WordPress |
| **Email** | Self-hosted mail, Google Workspace, Microsoft 365, Zoho, Mailgun, SendGrid, Amazon SES, ProtonMail, Fastmail, Resend, Postmark |
| **Deployments** | GitHub Pages, Vercel, Netlify, Fly.io, Render, Railway |
| **Security** | CAA (Let's Encrypt), CAA (ZeroSSL), MTA-STS, DMARC enforce, BIMI |
| **Utilities** | Parked domain, subdomain delegation, Google Site Verification, Cloudflare Email |

### Using a template

1. In the DNS zone editor, click **Import Template**
2. Browse by category or search
3. Select a template — a preview shows all records that will be created
4. Fill in required variables (e.g. `{{domain}}`, `{{ip}}`, `{{verification_token}}`)
5. Click **Import** — records are batch-replaced atomically

<Aside type="note">
Templates marked with ⚠️ **Needs extra step** require an action outside Tundra (e.g. adding a verification TXT record in Google Search Console).
</Aside>

## Domain linking

Link a domain to a site for automatic DNS record creation when the site is provisioned. Go to **Domain → Settings → Link to Site**.

When linked, Tundra automatically creates and updates the A/AAAA records when the site's server IP changes.
