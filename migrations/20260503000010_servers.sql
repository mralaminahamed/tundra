-- Servers module: managed hosts, agent credentials, services, packages, firewall rules.

-- ── servers ───────────────────────────────────────────────────────────────────

CREATE TABLE servers (
    id                     uuid        PRIMARY KEY DEFAULT uuidv7(),
    name                   text        NOT NULL,
    hostname               text        NOT NULL,
    region                 text        NULL,
    public_ip              inet        NULL,
    private_ip             inet        NULL,
    os                     text        NOT NULL DEFAULT 'ubuntu-24.04',
    os_version             text        NOT NULL DEFAULT '',
    arch                   text        NOT NULL DEFAULT 'x86_64',
    agent_version          text        NULL,
    status                 text        NOT NULL DEFAULT 'provisioning'
                           CHECK (status IN ('provisioning','active','degraded','offline','disabled')),
    agent_last_seen_at     timestamptz NULL,
    capabilities           jsonb       NOT NULL DEFAULT '{}',
    resources_total        jsonb       NOT NULL DEFAULT '{}',
    agent_cert_fingerprint text        NULL,
    -- Setup token (single-use, 24h TTL, SHA-256 hashed)
    setup_token_hash       bytea       NULL,
    setup_token_expires_at timestamptz NULL,
    notes                  text        NULL,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    deleted_at             timestamptz NULL,

    CONSTRAINT servers_hostname_unique UNIQUE (hostname)
);

CREATE INDEX idx_servers_status    ON servers (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_servers_last_seen ON servers (agent_last_seen_at);

CREATE TRIGGER trg_servers_updated_at
    BEFORE UPDATE ON servers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── agent_credentials ─────────────────────────────────────────────────────────

CREATE TABLE agent_credentials (
    id              uuid        PRIMARY KEY DEFAULT uuidv7(),
    server_id       uuid        NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
    cert_pem        text        NOT NULL,
    cert_fingerprint text       NOT NULL,
    not_before      timestamptz NOT NULL,
    not_after       timestamptz NOT NULL,
    revoked_at      timestamptz NULL,
    revoke_reason   text        NULL,
    rotated_from_id uuid        NULL REFERENCES agent_credentials (id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE        INDEX idx_agent_creds_server      ON agent_credentials (server_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX idx_agent_creds_fingerprint ON agent_credentials (cert_fingerprint) WHERE revoked_at IS NULL;

-- ── services ──────────────────────────────────────────────────────────────────

CREATE TABLE services (
    id            uuid        PRIMARY KEY DEFAULT uuidv7(),
    server_id     uuid        NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
    kind          text        NOT NULL,
    name          text        NOT NULL,
    version       text        NULL,
    managed       boolean     NOT NULL DEFAULT true,
    status        text        NOT NULL DEFAULT 'unknown'
                  CHECK (status IN ('running','stopped','failed','unknown')),
    config        jsonb       NOT NULL DEFAULT '{}',
    last_check_at timestamptz NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT services_unique UNIQUE (server_id, kind, name)
);

CREATE INDEX idx_services_server_kind ON services (server_id, kind);
CREATE INDEX idx_services_status      ON services (status);

CREATE TRIGGER trg_services_updated_at
    BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── packages ──────────────────────────────────────────────────────────────────

CREATE TABLE packages (
    id          uuid        PRIMARY KEY DEFAULT uuidv7(),
    server_id   uuid        NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
    name        text        NOT NULL,
    version     text        NOT NULL,
    source      text        NOT NULL DEFAULT 'apt',
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT packages_unique UNIQUE (server_id, name)
);

CREATE INDEX idx_packages_server ON packages (server_id);

-- ── firewall_rules ────────────────────────────────────────────────────────────

CREATE TABLE firewall_rules (
    id          uuid        PRIMARY KEY DEFAULT uuidv7(),
    server_id   uuid        NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
    direction   text        NOT NULL CHECK (direction IN ('inbound','outbound')),
    protocol    text        NOT NULL CHECK (protocol IN ('tcp','udp','icmp','any')),
    port_from   int         NULL CHECK (port_from BETWEEN 0 AND 65535),
    port_to     int         NULL CHECK (port_to BETWEEN 0 AND 65535),
    source_cidr text        NULL,
    action      text        NOT NULL DEFAULT 'allow' CHECK (action IN ('allow','deny')),
    priority    int         NOT NULL DEFAULT 100,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_firewall_server ON firewall_rules (server_id, priority);

CREATE TRIGGER trg_firewall_updated_at
    BEFORE UPDATE ON firewall_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
