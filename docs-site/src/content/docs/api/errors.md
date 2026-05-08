---
title: Errors & Pagination
description: Error envelope format and cursor-based pagination.
sidebar:
  order: 3
---

## Error envelope

Every error response follows this structure:

```json
{
  "error": {
    "code": "sites.not_found",
    "message": "Site '01j4k...' does not exist",
    "request_id": "req_01j4k5m6n7p8q9r0",
    "details": {
      "field": "site_id"
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `code` | string | Machine-readable error code (dot-separated resource.verb) |
| `message` | string | Human-readable description |
| `request_id` | string | Unique ID for this request — include in bug reports |
| `details` | object | Optional extra context (field names, expected values) |

## HTTP status codes

| Status | When |
|--------|------|
| 200 OK | Successful read or update |
| 201 Created | Resource created |
| 204 No Content | Successful delete |
| 400 Bad Request | Malformed request body |
| 401 Unauthorized | Missing or invalid session/token |
| 403 Forbidden | Authenticated but wrong role or step-up needed |
| 404 Not Found | Resource doesn't exist |
| 409 Conflict | Duplicate resource or invalid state transition |
| 422 Unprocessable Entity | Validation failure (see `details`) |
| 429 Too Many Requests | Rate limit exceeded |
| 500 Internal Server Error | Unexpected server error |

## Cursor pagination

List endpoints return cursor-based pagination. Example request + response:

```http
GET /api/v1/sites?limit=20
```

```json
{
  "data": [
    { "id": "01j4k...", "name": "my-site", ... },
    ...
  ],
  "next_cursor": "eyJpZCI6IjAxajRr...",
  "has_more": true
}
```

To get the next page:

```http
GET /api/v1/sites?limit=20&cursor=eyJpZCI6IjAxajRr...
```

When `has_more` is `false`, you've reached the last page.

### Parameters

| Parameter | Default | Max | Description |
|-----------|---------|-----|-------------|
| `limit` | 20 | 100 | Items per page |
| `cursor` | — | — | Opaque cursor from previous response |

Cursors are stable for the lifetime of the underlying data. If the resource is deleted, the cursor skips over it.
