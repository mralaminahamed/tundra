# tundrad-api

Axum 0.8 HTTP route handlers and request/response DTOs for the Tundra control-plane REST API.

## Role

Implements every endpoint defined in `proto/openapi.yaml` (spec-first — code must match spec). Responsibilities:

- Route definitions (`/api/v1/…`)
- Request deserialization and input validation
- Response serialization with the canonical error envelope
- Per-handler authorization via `tundrad-auth::AuthzService`
- Audit log writes on every state-changing request

## Error envelope

```json
{
  "error": {
    "code": "SCREAMING_SNAKE_CASE",
    "message": "Human-readable description",
    "request_id": "req_…",
    "details": {}
  }
}
```

## Key routes (P1)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/healthz` | Liveness probe |
| `GET` | `/readyz` | Readiness probe (DB + Valkey) |
| `POST` | `/api/v1/auth/login` | Password or passkey authentication |
| `POST` | `/api/v1/auth/logout` | Revoke current session |
| `GET` | `/api/v1/operators` | List operators |
| `GET` | `/api/v1/operators/me` | Current operator profile |
| `GET/POST` | `/api/v1/operators/me/tokens` | Manage API tokens |
| `GET` | `/api/v1/audit-log` | Paginated audit log |

## Constraints

- No `unwrap()` in handlers — use `?` + explicit error mapping
- No `format!()` into SQL — all queries are parameterized
- Every mutation writes an `audit_log` row before returning
