-- Fix: deployments table missing index on server_id (via sites.server_id join)
-- reported as slow panel dashboard on fleets > 50 servers
CREATE INDEX IF NOT EXISTS idx_deployments_created_at_desc
    ON deployments (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sites_server_id_status
    ON sites (server_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_occurred_at_desc
    ON audit_log (occurred_at DESC);

-- Fix: agent_credentials lookup by server_id was doing full scan
CREATE INDEX IF NOT EXISTS idx_agent_creds_server_id
    ON agent_credentials (server_id)
    WHERE suspended_at IS NULL;
