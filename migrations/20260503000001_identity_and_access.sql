-- Identity & Access module: operators, sessions, passkeys, RBAC, audit_log, api_tokens.

-- ── operators ─────────────────────────────────────────────────────────────────

CREATE TABLE operators (
    id                    uuid        PRIMARY KEY DEFAULT uuidv7(),
    public_id             text        NOT NULL,
    email                 citext      NOT NULL,
    email_verified_at     timestamptz NULL,
    full_name             text        NOT NULL,
    role                  text        NOT NULL
                          CHECK (role IN ('owner', 'admin', 'operator', 'readonly')),
    password_hash         text        NULL,            -- argon2id PHC string; NULL if passkey-only
    totp_secret_encrypted bytea       NULL,            -- AES-256-GCM, EncryptedField<String>
    recovery_codes_encrypted bytea    NULL,            -- AES-256-GCM, EncryptedField<Vec<String>>
    is_active             boolean     NOT NULL DEFAULT true,
    last_login_at         timestamptz NULL,
    last_login_ip         inet        NULL,
    preferred_locale      text        NOT NULL DEFAULT 'en',
    avatar_path           text        NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    deleted_at            timestamptz NULL,

    CONSTRAINT operators_email_unique    UNIQUE (email),
    CONSTRAINT operators_public_id_unique UNIQUE (public_id)
);

CREATE INDEX idx_operators_active     ON operators (is_active)  WHERE deleted_at IS NULL;
CREATE INDEX idx_operators_deleted_at ON operators (deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TRIGGER trg_operators_updated_at
    BEFORE UPDATE ON operators
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── sessions ──────────────────────────────────────────────────────────────────

CREATE TABLE sessions (
    id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
    operator_id         uuid        NOT NULL REFERENCES operators (id) ON DELETE CASCADE,
    refresh_token_hash  bytea       NOT NULL,    -- SHA-256 of the opaque refresh token
    user_agent          text        NULL,
    ip                  inet        NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    last_seen_at        timestamptz NOT NULL DEFAULT now(),
    last_full_auth_at   timestamptz NOT NULL DEFAULT now(), -- for step-up window check
    expires_at          timestamptz NOT NULL,
    revoked_at          timestamptz NULL,
    revoke_reason       text        NULL
);

CREATE UNIQUE INDEX idx_sessions_token_hash   ON sessions (refresh_token_hash) WHERE revoked_at IS NULL;
CREATE        INDEX idx_sessions_op_active    ON sessions (operator_id, expires_at) WHERE revoked_at IS NULL;

-- ── passkeys ──────────────────────────────────────────────────────────────────

CREATE TABLE passkeys (
    id              uuid        PRIMARY KEY DEFAULT uuidv7(),
    operator_id     uuid        NOT NULL REFERENCES operators (id) ON DELETE CASCADE,
    credential_id   bytea       NOT NULL,
    public_key      bytea       NOT NULL,
    signature_count bigint      NOT NULL DEFAULT 0,
    transports      text[]      NULL,       -- ['usb','nfc','ble','internal']
    device_label    text        NULL,
    aaguid          uuid        NULL,
    last_used_at    timestamptz NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT passkeys_credential_id_unique UNIQUE (credential_id)
);

CREATE INDEX idx_passkeys_operator ON passkeys (operator_id);

CREATE TRIGGER trg_passkeys_updated_at
    BEFORE UPDATE ON passkeys
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── roles ─────────────────────────────────────────────────────────────────────

CREATE TABLE roles (
    id          uuid        PRIMARY KEY DEFAULT uuidv7(),
    slug        text        NOT NULL UNIQUE,
    name        text        NOT NULL,
    description text        NULL,
    is_system   boolean     NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── permissions ───────────────────────────────────────────────────────────────

CREATE TABLE permissions (
    id          uuid  PRIMARY KEY DEFAULT uuidv7(),
    slug        text  NOT NULL UNIQUE,      -- 'sites.create', 'mcp.write:safe'
    resource    text  NOT NULL,
    action      text  NOT NULL,
    description text  NULL
);

CREATE INDEX idx_permissions_resource ON permissions (resource);

-- ── role_permissions ──────────────────────────────────────────────────────────

CREATE TABLE role_permissions (
    role_id       uuid NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    permission_id uuid NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- ── operator_roles ────────────────────────────────────────────────────────────

CREATE TABLE operator_roles (
    operator_id uuid NOT NULL REFERENCES operators (id) ON DELETE CASCADE,
    role_id     uuid NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    scope_type  text NULL,   -- 'server' | 'site' | NULL (global)
    scope_id    uuid NULL
);

-- Composite unique: (operator, role, scope). COALESCE handles NULLable scope columns.
CREATE UNIQUE INDEX idx_operator_roles_unique ON operator_roles (
    operator_id,
    role_id,
    COALESCE(scope_type, ''),
    COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

CREATE INDEX idx_operator_roles_scope ON operator_roles (scope_type, scope_id);

-- ── audit_log (append-only) ───────────────────────────────────────────────────

CREATE TABLE audit_log (
    id            uuid        PRIMARY KEY DEFAULT uuidv7(),
    occurred_at   timestamptz NOT NULL DEFAULT now(),
    actor_type    text        NOT NULL, -- 'operator' | 'plugin' | 'mcp_session' | 'system'
    actor_id      uuid        NULL,
    action        text        NOT NULL, -- 'site.create', 'operator.delete', ...
    resource_type text        NULL,
    resource_id   uuid        NULL,
    ip            inet        NULL,
    user_agent    text        NULL,
    details       jsonb       NOT NULL DEFAULT '{}',
    chain_hash    bytea       NULL      -- sha3-256(prev_chain_hash || canonical_json)
);

CREATE INDEX idx_audit_occurred  ON audit_log (occurred_at DESC);
CREATE INDEX idx_audit_actor     ON audit_log (actor_type, actor_id);
CREATE INDEX idx_audit_resource  ON audit_log (resource_type, resource_id);
CREATE INDEX idx_audit_action    ON audit_log (action);

-- Audit chain trigger: each INSERT computes the forward-chained hash.
CREATE FUNCTION audit_log_chain_hash()
RETURNS TRIGGER AS $$
DECLARE
    prev_hash bytea;
    canonical jsonb;
BEGIN
    SELECT chain_hash INTO prev_hash
    FROM   audit_log
    ORDER  BY occurred_at DESC, id DESC
    LIMIT  1;

    IF prev_hash IS NULL THEN
        prev_hash := '\x00'::bytea;
    END IF;

    canonical := jsonb_build_object(
        'id',            NEW.id,
        'occurred_at',   NEW.occurred_at,
        'actor_type',    NEW.actor_type,
        'actor_id',      NEW.actor_id,
        'action',        NEW.action,
        'resource_type', NEW.resource_type,
        'resource_id',   NEW.resource_id,
        'details',       NEW.details
    );

    NEW.chain_hash := digest(
        prev_hash || convert_to(canonical::text, 'UTF8'),
        'sha3-256'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_chain
    BEFORE INSERT ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_chain_hash();

-- ── api_tokens ────────────────────────────────────────────────────────────────

CREATE TABLE api_tokens (
    id           uuid        PRIMARY KEY DEFAULT uuidv7(),
    operator_id  uuid        NULL REFERENCES operators (id) ON DELETE CASCADE,
    -- NULL operator_id = plugin/system-issued token; tracked by plugin_id in details
    name         text        NOT NULL,
    token_hash   bytea       NOT NULL UNIQUE, -- SHA-256 of the raw token
    scopes       text[]      NOT NULL DEFAULT '{}',
    expires_at   timestamptz NULL,
    last_used_at timestamptz NULL,
    last_used_ip inet        NULL,
    ip_allowlist inet[]      NULL,
    revoked_at   timestamptz NULL,
    revoke_reason text       NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_tokens_operator  ON api_tokens (operator_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_tokens_hash      ON api_tokens (token_hash)  WHERE revoked_at IS NULL;
