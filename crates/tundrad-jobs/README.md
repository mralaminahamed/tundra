# tundrad-jobs

Background job type definitions and dispatch logic for the Tundra control plane.

## Job queue hybrid

- **Valkey (DB 1)** — lightweight, ephemeral jobs: cache invalidation, notification dispatch, metric aggregation triggers. Lost on Valkey crash (acceptable).
- **PostgreSQL `jobs` table** — durable jobs: deployments, database backups, certificate renewals, migration runs. Survive `tundrad` restarts.

## Durable job lifecycle

```
pending → running → succeeded
                 → failed (retried up to max_attempts)
                 → cancelled
```

The dispatcher polls `WHERE status = 'pending' AND next_run_at <= now()` with a short-lived row lock (`SELECT … FOR UPDATE SKIP LOCKED`).

## Job kinds (P1)

| Kind | Description |
|------|-------------|
| `deploy` | Site deployment triggered by operator or webhook |
| `cert_renew` | ACME certificate renewal |
| `backup` | Site or database backup |
| `audit_export` | Export old audit log rows to Parquet |
| `session_cleanup` | Prune expired/revoked sessions older than 30 days |
