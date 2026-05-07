CREATE TABLE plugin_wordpress_backups (
    id              uuid        PRIMARY KEY DEFAULT uuidv7(),
    installation_id uuid        NOT NULL REFERENCES plugin_wordpress_installations(id) ON DELETE CASCADE,
    type            text        NOT NULL DEFAULT 'manual',  -- 'manual' | 'scheduled'
    status          text        NOT NULL DEFAULT 'running', -- 'running' | 'complete' | 'failed'
    note            text,
    size_bytes      bigint,
    file_path       text,
    error           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX plugin_wordpress_backups_installation_idx ON plugin_wordpress_backups (installation_id);

CREATE TRIGGER trg_wp_backups_updated_at
    BEFORE UPDATE ON plugin_wordpress_backups
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Backup schedule settings (one row per installation)
CREATE TABLE plugin_wordpress_backup_schedules (
    installation_id uuid PRIMARY KEY REFERENCES plugin_wordpress_installations(id) ON DELETE CASCADE,
    frequency       text NOT NULL DEFAULT 'disabled', -- 'disabled' | 'daily' | 'weekly' | 'monthly'
    retention       int  NOT NULL DEFAULT 7,
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_wp_backup_schedules_updated_at
    BEFORE UPDATE ON plugin_wordpress_backup_schedules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
