# tundrad-repo

SQLx repository layer for the Tundra control plane. All database access is owned here; no other crate issues SQL directly.

## Design principles

- Repositories are short-lived structs borrowing a `&PgPool`
- Soft-deletable tables always filter `WHERE deleted_at IS NULL` — explicit `.with_deleted()` required to bypass
- Runtime query API (`sqlx::query_as::<_, Row>(sql).bind(…)`) used instead of compile-time macros so the workspace compiles without a live database; integration tests in `tundra-test-harness` provide SQL validation
- No business logic — pure data access; domain logic lives in `tundrad-domain`

## Repositories (P1)

| Struct | Table(s) |
|--------|----------|
| `OperatorRepo` | `operators` |
| `SessionRepo` | `sessions` |
| `AuditLogRepo` | `audit_log` (append-only) |

## Transactional boundaries

Handlers that touch multiple tables open an explicit `pool.begin()` transaction and pass the executor to all repo calls within the transaction scope.

## Error types

`RepoError::NotFound` → HTTP 404  
`RepoError::Conflict` → HTTP 409  
`RepoError::Sqlx` → HTTP 500 (logged, not exposed)
