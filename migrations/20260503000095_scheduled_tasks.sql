-- scheduled_tasks: cron-style jobs per site managed via systemd timers
CREATE TABLE scheduled_tasks (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  site_id         uuid        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  schedule        text        NOT NULL,   -- systemd OnCalendar expression, e.g. "*-*-* 02:00:00"
  command         text        NOT NULL,
  working_dir     text        NOT NULL DEFAULT '/srv/sites/%(public_id)s/current',
  is_active       boolean     NOT NULL DEFAULT true,
  last_run_at     timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduled_tasks_site_name UNIQUE (site_id, name)
);
CREATE INDEX idx_scheduled_tasks_site ON scheduled_tasks (site_id);
CREATE TRIGGER trg_scheduled_tasks_updated_at
  BEFORE UPDATE ON scheduled_tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
