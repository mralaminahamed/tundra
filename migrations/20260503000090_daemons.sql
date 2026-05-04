-- daemons: long-running background processes per site
CREATE TABLE daemons (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  site_id         uuid        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  command         text        NOT NULL,
  working_dir     text        NOT NULL DEFAULT '/srv/sites/%(public_id)s/current',
  env_file        text        NOT NULL DEFAULT '/srv/sites/%(public_id)s/shared/.env',
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daemons_site_name UNIQUE (site_id, name)
);
CREATE INDEX idx_daemons_site ON daemons (site_id);
CREATE TRIGGER trg_daemons_updated_at
  BEFORE UPDATE ON daemons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
