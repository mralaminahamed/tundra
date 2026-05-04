-- Backup subsystem: targets, jobs, snapshots, restores, advisory lock.

-- backup_targets: where backups are stored
CREATE TABLE backup_targets (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  name        text        NOT NULL UNIQUE,
  kind        text        NOT NULL
                CHECK (kind IN ('s3','local','sftp','b2','wasabi','r2')),
  config      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  repo_password_encrypted bytea NOT NULL,
  is_default  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_backup_targets_updated_at
    BEFORE UPDATE ON backup_targets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- backup_jobs: scheduled or on-demand backup jobs
CREATE TABLE backup_jobs (
  id               uuid        PRIMARY KEY DEFAULT uuidv7(),
  name             text        NOT NULL,
  scope_kind       text        NOT NULL
                     CHECK (scope_kind IN ('site','application','database','server','custom')),
  scope_id         uuid        NULL,
  target_id        uuid        NOT NULL REFERENCES backup_targets(id) ON DELETE RESTRICT,
  schedule_cron    text        NULL,
  retention_policy jsonb       NOT NULL DEFAULT '{}'::jsonb,
  is_active        boolean     NOT NULL DEFAULT true,
  last_run_at      timestamptz NULL,
  last_status      text        NULL,
  next_run_at      timestamptz NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_backup_jobs_next_run ON backup_jobs (next_run_at) WHERE is_active = true;
CREATE INDEX idx_backup_jobs_scope    ON backup_jobs (scope_kind, scope_id);

CREATE TRIGGER trg_backup_jobs_updated_at
    BEFORE UPDATE ON backup_jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- backup_snapshots: individual backup run results
CREATE TABLE backup_snapshots (
  id            uuid        PRIMARY KEY DEFAULT uuidv7(),
  job_id        uuid        NOT NULL REFERENCES backup_jobs(id) ON DELETE CASCADE,
  snapshot_id   text        NOT NULL,
  size_bytes    bigint      NOT NULL DEFAULT 0,
  files_new     bigint      NULL,
  files_changed bigint      NULL,
  duration_ms   int         NOT NULL DEFAULT 0,
  status        text        NOT NULL CHECK (status IN ('succeeded','failed','partial')),
  error         text        NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_backup_snapshots_job ON backup_snapshots (job_id, created_at DESC);

-- backup_restores: restore operations (preview-then-confirm)
CREATE TABLE backup_restores (
  id            uuid        PRIMARY KEY DEFAULT uuidv7(),
  snapshot_id   uuid        NOT NULL REFERENCES backup_snapshots(id) ON DELETE CASCADE,
  operator_id   uuid        NOT NULL REFERENCES operators(id),
  target_path   text        NULL,
  status        text        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','confirmed','running','succeeded','failed','cancelled')),
  preview       jsonb       NULL,
  started_at    timestamptz NULL,
  completed_at  timestamptz NULL,
  error         text        NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- backup_locks: single-row advisory lock so two restores can't run simultaneously
CREATE TABLE backup_locks (
  id            int         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  locked_by     uuid        NULL REFERENCES backup_restores(id),
  locked_at     timestamptz NULL
);
INSERT INTO backup_locks (id) VALUES (1);
