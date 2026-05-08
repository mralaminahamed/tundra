---
title: API Overview
description: REST API, authentication, error format, and WebSocket events.
sidebar:
  order: 1
---

Tundra exposes a REST API at `/api/v1/`. The API is spec-first — `proto/openapi.yaml` is the canonical source of truth.

## Base URL

```
https://panel.example.com/api/v1
```

## Authentication

### Session cookie (browser)

After logging in via `POST /api/v1/auth/login`, a `tundra_session` HttpOnly cookie is set automatically. All subsequent requests from the browser use this cookie.

### API token (programmatic access)

```http
Authorization: Bearer tnd_prod_<token>
```

Generate tokens in **Settings → API Tokens** or `POST /api/v1/operators/me/tokens`.

Token format: `tnd_{env}_{32-byte-base64url}`. Only the SHA-256 hash is stored server-side — the plaintext is shown once at creation.

## Error format

All errors return a consistent envelope:

```json
{
  "error": {
    "code": "resource.verb",
    "message": "Human-readable description",
    "request_id": "req_01j4k5m6n7p8q9r0",
    "details": {}
  }
}
```

Common error codes:

| Code | HTTP | Meaning |
|------|------|---------|
| `auth.unauthenticated` | 401 | No valid session or token |
| `auth.forbidden` | 403 | Authenticated but insufficient role |
| `auth.step_up_required` | 403 | Step-up re-authentication needed |
| `resource.not_found` | 404 | Resource doesn't exist |
| `resource.conflict` | 409 | Duplicate or state conflict |
| `validation.invalid` | 422 | Request body validation failed |
| `server.internal` | 500 | Internal server error |

## Pagination

List endpoints return cursor-based pagination:

```json
{
  "data": [...],
  "next_cursor": "eyJpZCI6IjAxajRr...",
  "has_more": true
}
```

Pass `?cursor=<next_cursor>` to fetch the next page. `?limit=N` controls page size (default 20, max 100).

## Rate limiting

The API applies per-session and per-token rate limits. Responses include:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 997
X-RateLimit-Reset: 1714000000
```

When exceeded: `429 Too Many Requests` with a `Retry-After` header.
