---
title: Security Hardening
description: Post-install security checklist and trust model.
sidebar:
  order: 5
---

import { Aside } from '@astrojs/starlight/components'

## Post-install checklist

```bash
tundra acceptance run --url https://panel.example.com --section identity
```

This runs automated security acceptance tests. For manual verification:

- [ ] HTTPS enforced (HTTP redirects to HTTPS)
- [ ] HSTS header present with `max-age` ≥ 31536000
- [ ] CSP `default-src 'self'` header present
- [ ] Session cookies: `HttpOnly; Secure; SameSite=Strict`
- [ ] Master key file mode is `0400`, owned by `tundra`
- [ ] PostgreSQL not accessible from public network
- [ ] Valkey not accessible from public network
- [ ] Agent gRPC port (7447) accessible only from trusted agent IPs

## Trust boundaries

| Boundary | Protection |
|----------|-----------|
| Browser ↔ panel | TLS 1.3, session cookies, CSRF double-submit, CSP, HSTS |
| External ↔ API | Bearer API tokens (SHA-256 stored), MCP scope tokens, HMAC webhooks |
| Control plane ↔ agent | mTLS 1.3, per-agent client cert, nonce replay protection |
| Agent ↔ workloads | Per-site Unix UID isolation, `open_basedir` for PHP, systemd hardening |
| Plugin sandbox ↔ host | Wasmtime fuel/memory/epoch limits, capability-checked host calls |
| Tundra ↔ third-party APIs | TLS verification, credentials encrypted at rest |

## Encryption at rest

| Data | Algorithm |
|------|-----------|
| Passwords | Argon2id (m=64 MiB, t=3, p=1) |
| TOTP secrets, API keys, env vars, DKIM private keys | AES-256-GCM + HKDF-derived per-column keys |
| Backup repo passwords | AES-256-GCM |
| Master key | 32 raw bytes + BLAKE3-256 integrity trailer, mode 0400 |
| Backups | GPG (operator's public key; private key never on server) |

## Step-up authentication

Sensitive operations require re-authentication within the last 5 minutes:

- Server deletion
- Master key rotation
- Admin API token issuance
- Connection string reveal (database passwords)

If your session is older than 5 minutes, you'll be prompted to enter your password before proceeding.

## API tokens

Token format: `tnd_{env}_{32-byte-base64url}`

- Only the SHA-256 hash is stored — never the plaintext token
- Tokens are shown only once at creation time
- Scope per token: can be restricted to specific resources

## Audit log

Every state-changing operation writes a row to `audit_log`:

- Actor (session-based or API token)
- Action and resource
- Request ID (for correlation)
- Chain hash (SHA-3/256 of the previous row's hash — tamper-evident)

Export the audit log in **Settings → Audit Log** or via `GET /api/v1/audit-log`.

<Aside type="caution">
The audit log chain hash is verified on export. If the chain is broken, the export will fail with an integrity error. This is by design.
</Aside>

## Vulnerability reporting

See [SECURITY.md](https://github.com/mralaminahamed/tundra/blob/main/.github/SECURITY.md) — we respond within 48 hours.
