# Tundra Security Overview

## Trust model

Tundra has six trust boundaries, each enforced at the protocol level:

1. **Browser ↔ panel** — TLS 1.3, session cookies (`HttpOnly; Secure; SameSite=Strict`), CSRF double-submit (middleware exists in `crates/tundrad-api/src/middleware/csrf.rs` but is not applied to the router), CSP `default-src 'self'`, HSTS preload
2. **External integrations ↔ panel** — Bearer API tokens (SHA-256 stored, never plaintext), MCP scope tokens, HMAC-validated webhooks
3. **Control plane ↔ agent** — planned: mTLS 1.3 with per-agent client certificates from Tundra's internal CA. Current: HTTPS with an `X-Tundra-Server-Id` header, and the agent client does not verify the server certificate (`crates/tundra-agent-reconciler/src/tundra_client.rs`)
4. **Agent ↔ workloads** — per-site Unix UID isolation, `open_basedir` for PHP, systemd unit hardening
5. **Plugin sandbox ↔ host** — Wasmtime with fuel/memory/epoch limits, capability-checked host calls (host library not yet linked into `tundrad`)
6. **Tundra ↔ third-party APIs** — TLS verification, provider credentials encrypted at rest

## Encryption at rest

- **Passwords** — Argon2id (m=64 MiB, t=3, p=1)
- **Secrets (TOTP, API keys, env vars)** — AES-256-GCM with HKDF-derived per-column keys
- **Master key** — 32-byte key + BLAKE3-256 integrity trailer, mode 0400
- **Backups** — operator-supplied GPG public key; private key never on the server

## Reporting a vulnerability

Email `mrabir.ahamed@gmail.com` with subject `[VULN]`. We respond within 48 hours.
Coordinated disclosure; CVE filing for confirmed issues.

## Hardening checklist

After install, run:
```bash
tundra acceptance run --section identity
sudo tundra panel diagnose
```

See `docs/04-quality/tundra-acceptance-checklist-v1.md` for the full checklist.
