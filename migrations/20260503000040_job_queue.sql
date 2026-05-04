-- Durable job queue — persists across daemon restarts.
-- Simple jobs (notify, cache rebuild) stay in Valkey DB 1.
-- Durable jobs (deploys, cert renewals, backups) live here.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS
    priority int NOT NULL DEFAULT 100;

-- Partial index the dispatcher polls every tick.
-- Already defined in P1 migration; safe to recreate conditionally.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'jobs' AND indexname = 'idx_jobs_pending'
    ) THEN
        CREATE INDEX idx_jobs_pending ON jobs (kind, next_run_at)
            WHERE status = 'pending';
    END IF;
END $$;

-- Per-kind concurrency semaphore: running_count tracks in-flight workers.
-- Updated atomically by the dispatcher with SELECT … FOR UPDATE SKIP LOCKED.
CREATE TABLE IF NOT EXISTS job_kind_config (
    kind            text    PRIMARY KEY,
    max_concurrency int     NOT NULL DEFAULT 3,
    timeout_secs    int     NOT NULL DEFAULT 300
);

INSERT INTO job_kind_config (kind, max_concurrency, timeout_secs) VALUES
    ('deploy',       1,  1800),   -- one deploy at a time per site (enforced by deploy lock)
    ('cert_renew',   5,   120),
    ('backup',       2,  3600),
    ('audit_export', 1,   300),
    ('session_prune',1,    60)
ON CONFLICT (kind) DO NOTHING;
