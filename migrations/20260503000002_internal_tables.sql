-- Internal tables: durable job queue, distributed locks, global settings.

-- ── jobs ──────────────────────────────────────────────────────────────────────

CREATE TABLE jobs (
    id          uuid        PRIMARY KEY DEFAULT uuidv7(),
    kind        text        NOT NULL,
    payload     jsonb       NOT NULL DEFAULT '{}',
    status      text        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
    attempts    int         NOT NULL DEFAULT 0,
    max_attempts int        NOT NULL DEFAULT 3,
    next_run_at timestamptz NOT NULL DEFAULT now(),
    locked_at   timestamptz NULL,
    locked_by   text        NULL,   -- instance ID of the tundrad worker holding the lock
    error       text        NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Hot-path index: dispatcher polls for pending work ordered by next_run_at.
CREATE INDEX idx_jobs_pending ON jobs (kind, next_run_at)
    WHERE status = 'pending';

CREATE TRIGGER trg_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── locks ─────────────────────────────────────────────────────────────────────

CREATE TABLE locks (
    key         text        PRIMARY KEY,    -- e.g. 'deploy:site:<uuid>'
    owner       text        NOT NULL,       -- instance ID / worker identifier
    acquired_at timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL
);

CREATE INDEX idx_locks_expires ON locks (expires_at);

-- ── settings ──────────────────────────────────────────────────────────────────

CREATE TABLE settings (
    key        text    PRIMARY KEY,
    value      jsonb   NOT NULL,
    is_public  boolean NOT NULL DEFAULT false,  -- exposed via GET /api/v1/settings/public
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid    NULL REFERENCES operators (id) ON DELETE SET NULL
);

CREATE TRIGGER trg_settings_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
