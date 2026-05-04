CREATE TABLE plugin_mcp_tokens (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id       uuid NOT NULL DEFAULT uuidv7() UNIQUE,
    operator_id     uuid NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    name            text NOT NULL,
    token_hash      bytea NOT NULL UNIQUE,
    token_prefix    text NOT NULL,
    scopes          text[] NOT NULL,
    restrict_ip     cidr,
    allowed_clients text[],
    max_uses        int,
    use_count       int NOT NULL DEFAULT 0,
    expires_at      timestamptz NOT NULL,
    revoked_at      timestamptz,
    revoke_reason   text,
    last_used_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcp_tokens_operator ON plugin_mcp_tokens(operator_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_mcp_tokens_expiry ON plugin_mcp_tokens(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE plugin_mcp_sessions (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id        uuid NOT NULL DEFAULT uuidv7() UNIQUE,
    token_id         bigint NOT NULL REFERENCES plugin_mcp_tokens(id) ON DELETE CASCADE,
    transport        text NOT NULL CHECK (transport IN ('stdio','http')),
    mode             text NOT NULL CHECK (mode IN ('read','write')),
    client_name      text,
    client_version   text,
    protocol_version text NOT NULL DEFAULT '2025-03-26',
    remote_ip        inet,
    started_at       timestamptz NOT NULL DEFAULT now(),
    last_activity_at timestamptz NOT NULL DEFAULT now(),
    ended_at         timestamptz,
    end_reason       text
);

CREATE INDEX idx_mcp_sessions_active ON plugin_mcp_sessions(token_id, ended_at) WHERE ended_at IS NULL;

CREATE TABLE plugin_mcp_tool_invocations (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id     uuid NOT NULL DEFAULT uuidv7() UNIQUE,
    session_id    bigint NOT NULL REFERENCES plugin_mcp_sessions(id) ON DELETE CASCADE,
    tool_name     text NOT NULL,
    arguments     jsonb NOT NULL,
    outcome       text NOT NULL CHECK (outcome IN ('success','error','denied','blocked','rate-limited','timeout')),
    error_code    text,
    error_summary text,
    duration_ms   int,
    audit_log_id  uuid REFERENCES audit_log(id) ON DELETE SET NULL,
    invoked_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcp_invocations_session ON plugin_mcp_tool_invocations(session_id, invoked_at DESC);
CREATE INDEX idx_mcp_invocations_tool ON plugin_mcp_tool_invocations(tool_name, invoked_at DESC);
