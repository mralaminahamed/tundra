---
title: Hard Constraints
description: Non-negotiable rules that every contributor must follow.
sidebar:
  order: 5
---

import { Aside } from '@astrojs/starlight/components'

These constraints are enforced by CI and code review. PRs that violate them are blocked.

## 1. No OpenSSL

`deny.toml` bans `openssl`, `openssl-sys`, and `openssl-probe`. Use `rustls` for all TLS.

If a new dependency transitively requires OpenSSL, it must be replaced or feature-flagged out.

```bash
# Check before adding a dep
cargo deny check
```

## 2. Up-only migrations

Never write a `down` migration. The policy:

- Forward-only: each migration is permanent
- Reverting a bad migration = code revert + new forward migration
- Production has data in those tables; `down` migrations that `DROP` columns destroy data

```bash
# Create migration
sqlx migrate add <description>

# Verify (no down file)
ls migrations/  # should only show .sql files, not .down.sql
```

## 3. EncryptedField\<T\> for secrets

Every column holding a secret must be `bytea` + `EncryptedField<T>`.

**Secret columns** include: TOTP secrets, recovery codes, API key values, env var values with `is_secret=true`, DKIM private keys, backup repo passwords, database user passwords.

Plaintext secrets in the DB are a security bug and will be flagged in code review.

```rust
// ✅ Correct
pub totp_secret: Option<EncryptedField<String, TotpSecretFamily>>,

// ❌ Wrong
pub totp_secret: Option<String>,
```

## 4. Spec-first REST

New endpoints must be designed in `proto/openapi.yaml` first. `tests/openapi_drift.rs` fails CI if code diverges.

This prevents the spec from becoming documentation-only fiction.

## 5. Audit every mutation

Every state-changing handler writes a row to `audit_log`:

```rust
AuditLogRepo::new(&pool).append(NewAuditEntry {
    actor: session.actor(),
    action: "site.created",
    resource_type: "site",
    resource_id: site.id,
    ..Default::default()
}).await?;
```

Missing audit writes are a compliance bug.

## 6. TLS 1.3 only

`rustls` is configured with an explicit AEAD cipher list. No plaintext fallback, no TLS 1.2 downgrade.

## 7. No unwrap() in handlers

```rust
// ❌ Crashes the worker thread
let data = some_option.unwrap();

// ✅ Returns 500 with request_id
let data = some_option.ok_or_else(|| ApiError::internal())?;
```

<Aside type="note">
`unwrap()` is allowed in tests and in code paths where the invariant is provably held (e.g. a literal string parsed as a regex). In HTTP handlers, it is always wrong.
</Aside>

## 8. publish = false on all binaries

All binary crates have `publish = false` in `Cargo.toml`. Library crates are workspace-internal.
