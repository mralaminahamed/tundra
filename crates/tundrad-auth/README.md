# tundrad-auth

Authentication, authorization, and cryptographic identity management for the Tundra control plane.

## Responsibilities

| Component | Description |
|-----------|-------------|
| Password auth | Argon2id verify (m=64 MiB, t=3, p=1) + HIBP k-anonymity breach check |
| TOTP | RFC 6238 enrolment, verification, recovery codes |
| WebAuthn | FIDO2 passkey registration and authentication via `webauthn-rs` |
| Session lifecycle | Issue, rotate, touch, revoke refresh tokens; step-up enforcement |
| API tokens | Mint `tnd_<env>_<base64url>` tokens; store SHA-256 hash; verify |
| RBAC | `Action` × `Resource` permission matrix; `authz.require(actor, action, resource)` |

## Step-up window

Sensitive operations (server deletion, master-key rotation, admin token issuance) require fresh authentication within the last 5 minutes. Handlers call:

```rust
authz.require_step_up(&session)?;  // returns 401 + WWW-Authenticate: TundraStepUp if stale
```

## API token format

```
tnd_prod_<43-char base64url random>
```

The raw token is returned once on creation. Only `SHA-256(token)` is stored in the database.

## Security constraints

- Argon2id parameters are non-negotiable — never downgrade
- TOTP verification window: ±1 step (30 s drift tolerance)
- Passkey counter monotonicity enforced on every authentication
