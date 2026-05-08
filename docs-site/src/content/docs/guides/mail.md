---
title: Mail
description: Set up email hosting with Postfix, Dovecot, Rspamd, and DKIM.
---

import { Steps } from '@astrojs/starlight/components'

Tundra manages a full mail stack: **Postfix** (SMTP), **Dovecot** (IMAP/POP3), **Rspamd** (spam filtering + DKIM signing), and optionally **Roundcube** (webmail).

## Setting up a mail domain

<Steps>

1. Go to **Mail → Domains → Add**

2. **Step 1 — Core records**
   - Enter the domain
   - Tundra generates the recommended MX and SPF records
   - Copy these to your DNS zone (or use a DNS template)

3. **Step 2 — DMARC & preview**
   - Configure DMARC policy (`none`, `quarantine`, `reject`)
   - Preview all DNS records before saving

4. **Generate DKIM key**
   - Click **Regenerate DKIM** on the domain detail page
   - Tundra generates a 2048-bit RSA keypair, stores the private key encrypted (AES-256-GCM), and shows the public key TXT record to add to DNS

</Steps>

## Mailboxes

Create mailboxes in **Mail → [domain] → Mailboxes → Add**:

- Username + password (Argon2id hashed)
- Quota (MB)
- Aliases

Password reset available via **Mailboxes → [mailbox] → Reset Password**.

## Aliases

Aliases forward to one or more mailboxes:

```
info@example.com  →  alice@example.com, bob@example.com
```

Create in **Mail → [domain] → Aliases → Add**.

## Mail queue

View and manage the Postfix queue in **Mail → Queue**:

- **Hold** — suspend delivery of a message
- **Release** — resume delivery
- **Delete** — permanently discard

## Diagnostics

**Mail → [domain] → Diagnostics** runs automated DNS checks:

| Check | What it verifies |
|-------|-----------------|
| MX | MX record points to your server |
| SPF | SPF record allows your server's IP |
| DKIM | DKIM public key matches the active key |
| DMARC | DMARC record is valid |

A **Send test email** button lets you verify delivery end-to-end.
