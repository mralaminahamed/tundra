-- P8: Add key_version column to all tables with encrypted columns.
--
-- key_version tracks which master key was used to encrypt the row.
--   1 = original key (all existing rows start here)
--   2 = rotated key
--   NULL = not yet migrated (treat as 1 for backwards compatibility)
--
-- This allows `tundra master-key rotate --resume` to continue a partial
-- rotation by skipping rows that already carry the new key_version.

ALTER TABLE operators        ADD COLUMN IF NOT EXISTS key_version smallint NOT NULL DEFAULT 1;
ALTER TABLE plugin_settings  ADD COLUMN IF NOT EXISTS key_version smallint NOT NULL DEFAULT 1;
ALTER TABLE api_tokens       ADD COLUMN IF NOT EXISTS key_version smallint NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- key_rotation_state — records the progress of an in-flight or completed
-- master-key rotation so that `rotate --resume` can continue safely.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS key_rotation_state (
    id              serial          PRIMARY KEY,
    started_at      timestamptz     NOT NULL DEFAULT now(),
    completed_at    timestamptz,
    old_key_sha256  bytea           NOT NULL,
    new_key_sha256  bytea           NOT NULL,
    tables_done     text[]          NOT NULL DEFAULT '{}',
    rows_processed  bigint          NOT NULL DEFAULT 0,
    status          text            NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'completed', 'failed'))
);

COMMENT ON TABLE key_rotation_state IS
    'Tracks the lifecycle of a master-key rotation operation. '
    'At most one row should be in ''running'' state at any time.';

COMMENT ON COLUMN key_rotation_state.old_key_sha256 IS
    'SHA-256 of the old master key (32 bytes) — used to verify the right key is loaded on resume.';

COMMENT ON COLUMN key_rotation_state.new_key_sha256 IS
    'SHA-256 of the new master key (32 bytes) — used to verify the right key is loaded on resume.';

COMMENT ON COLUMN key_rotation_state.tables_done IS
    'Array of table names whose rows have all been re-encrypted under the new key.';

COMMENT ON COLUMN key_rotation_state.rows_processed IS
    'Running total of rows that have been re-encrypted so far across all tables.';
