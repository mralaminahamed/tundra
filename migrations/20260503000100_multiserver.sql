-- P6: Multi-server additions

-- ── agent_credentials: rate limiting + circuit breaker ────────────────────────
ALTER TABLE agent_credentials
  ADD COLUMN IF NOT EXISTS suspended_at    timestamptz NULL,
  ADD COLUMN IF NOT EXISTS suspend_reason  text        NULL,
  ADD COLUMN IF NOT EXISTS last_seen_nonce bigint      NULL;   -- monotonic replay fence

CREATE INDEX IF NOT EXISTS idx_agent_creds_suspended ON agent_credentials (suspended_at)
  WHERE suspended_at IS NOT NULL;

-- ── server_metrics_state: per-server resource pressure ────────────────────────
CREATE TABLE server_metrics_state (
  server_id        uuid        PRIMARY KEY REFERENCES servers (id) ON DELETE CASCADE,
  cpu_cores        int         NOT NULL DEFAULT 0,
  cpu_used_pct     numeric(5,2) NOT NULL DEFAULT 0,
  ram_total_mb     bigint      NOT NULL DEFAULT 0,
  ram_used_mb      bigint      NOT NULL DEFAULT 0,
  disk_total_gb    bigint      NOT NULL DEFAULT 0,
  disk_used_gb     bigint      NOT NULL DEFAULT 0,
  site_count       int         NOT NULL DEFAULT 0,
  refreshed_at     timestamptz NOT NULL DEFAULT now()
);

-- ── servers: maintenance windows ──────────────────────────────────────────────
ALTER TABLE servers
  ADD COLUMN IF NOT EXISTS maintenance_starts_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS maintenance_ends_at   timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_servers_maintenance ON servers (maintenance_starts_at)
  WHERE maintenance_starts_at IS NOT NULL;

-- ── site_moves: cross-server migration journal ────────────────────────────────
CREATE TABLE site_moves (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  site_id         uuid        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  from_server_id  uuid        NOT NULL REFERENCES servers (id),
  to_server_id    uuid        NOT NULL REFERENCES servers (id),
  status          text        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','succeeded','failed','abandoned')),
  current_stage   text        NULL,
  error           text        NULL,
  initiated_by    uuid        NULL REFERENCES operators (id) ON DELETE SET NULL,
  started_at      timestamptz NULL,
  finished_at     timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_site_moves_site   ON site_moves (site_id, created_at DESC);
CREATE INDEX idx_site_moves_status ON site_moves (status) WHERE status IN ('pending','running');
