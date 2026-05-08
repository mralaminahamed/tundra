---
title: Authentication
description: Session-based and token-based authentication for the Tundra API.
sidebar:
  order: 2
---

## Password login

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "owner@example.com",
  "password": "your-password"
}
```

Response sets a `tundra_session` HttpOnly cookie. Returns `200` on success, `401` on invalid credentials.

## Logout

```http
POST /api/v1/auth/logout
```

Revokes the current session.

## API tokens

```http
POST /api/v1/operators/me/tokens
Content-Type: application/json

{
  "name": "CI deploy token",
  "expires_at": "2027-01-01T00:00:00Z"
}
```

Response:
```json
{
  "token": "tnd_prod_<plaintext>",
  "id": "01j4k...",
  "name": "CI deploy token",
  "created_at": "2026-05-09T12:00:00Z"
}
```

The `token` field is shown **once only**. Store it securely. Only the SHA-256 hash is stored by Tundra.

### List tokens

```http
GET /api/v1/operators/me/tokens
```

### Revoke a token

```http
DELETE /api/v1/operators/me/tokens/{id}
```

## Step-up authentication

Certain endpoints require recent full authentication (within the last 5 minutes):

```http
HTTP/1.1 403 Forbidden
{
  "error": {
    "code": "auth.step_up_required",
    "message": "Re-authenticate to proceed with this operation"
  }
}
```

Step up by sending your password to `POST /api/v1/auth/step-up`, then retry the original request.

## TOTP / MFA

If MFA is enabled, the login flow adds a second step:

```http
POST /api/v1/auth/login          # returns 200 with mfa_pending=true
POST /api/v1/auth/totp-verify    # { "code": "123456" }
```

Passkey (WebAuthn) authentication is also supported — use `POST /api/v1/auth/passkey/begin` and `/complete`.
