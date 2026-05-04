-- Sites module: sites, applications, deployments, env_vars, releases, aliases, health_checks.

-- ── sites ─────────────────────────────────────────────────────────────────────

CREATE TABLE sites (
    id              uuid        PRIMARY KEY DEFAULT uuidv7(),
    name            text        NOT NULL,
    primary_domain  citext      NOT NULL,
    server_id       uuid        NOT NULL REFERENCES servers (id) ON DELETE RESTRICT,
    application_id  uuid        NULL,  -- forward ref; set after application created
    status          text        NOT NULL DEFAULT 'provisioning'
                    CHECK (status IN ('provisioning','active','suspended','migrating','archived')),
    document_root   text        NOT NULL,
    base_path       text        NOT NULL DEFAULT '/',
    notes           text        NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz NULL,

    CONSTRAINT sites_primary_domain_unique UNIQUE (primary_domain)
);

CREATE INDEX idx_sites_server  ON sites (server_id)       WHERE deleted_at IS NULL;
CREATE INDEX idx_sites_status  ON sites (status)          WHERE deleted_at IS NULL;
CREATE INDEX idx_sites_trgm    ON sites USING gin (primary_domain gin_trgm_ops);

CREATE TRIGGER trg_sites_updated_at
    BEFORE UPDATE ON sites
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── applications ──────────────────────────────────────────────────────────────

CREATE TABLE applications (
    id                 uuid   PRIMARY KEY DEFAULT uuidv7(),
    site_id            uuid   NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
    kind               text   NOT NULL
                       CHECK (kind IN ('static','php','laravel','nodejs','python','go','rust','docker')),
    runtime_version    text   NOT NULL,
    build_command      text   NULL,
    start_command      text   NULL,
    process_count      int    NOT NULL DEFAULT 1,
    health_check_path  text   NOT NULL DEFAULT '/',
    source_kind        text   NOT NULL
                       CHECK (source_kind IN ('github','gitlab','blank','template','tarball')),
    source_config      jsonb  NOT NULL DEFAULT '{}',
    current_release_id uuid   NULL,
    resources_limits   jsonb  NOT NULL DEFAULT '{}',
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT applications_site_unique UNIQUE (site_id)
);

CREATE TRIGGER trg_applications_updated_at
    BEFORE UPDATE ON applications
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── deployments ───────────────────────────────────────────────────────────────

CREATE TABLE deployments (
    id              uuid        PRIMARY KEY DEFAULT uuidv7(),
    application_id  uuid        NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
    site_id         uuid        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
    triggered_by    text        NOT NULL
                    CHECK (triggered_by IN ('manual','webhook','schedule','rollback','plugin','migration')),
    triggered_by_id uuid        NULL,
    source_ref      text        NULL,
    source_message  text        NULL,
    status          text        NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
    started_at      timestamptz NULL,
    finished_at     timestamptz NULL,
    log_path        text        NULL,
    error           text        NULL,
    release_path    text        NULL,
    metadata        jsonb       NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_deployments_app_created  ON deployments (application_id, created_at DESC);
CREATE INDEX idx_deployments_site_created ON deployments (site_id, created_at DESC);
CREATE INDEX idx_deployments_active       ON deployments (status)
    WHERE status IN ('queued','running');

CREATE TRIGGER trg_deployments_updated_at
    BEFORE UPDATE ON deployments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── env_vars ──────────────────────────────────────────────────────────────────

CREATE TABLE env_vars (
    id              uuid        PRIMARY KEY DEFAULT uuidv7(),
    application_id  uuid        NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
    key             text        NOT NULL,
    value_plain     text        NULL,     -- used when is_secret = false
    value_encrypted bytea       NULL,     -- EncryptedField<String, EnvVarFamily> when is_secret = true
    is_secret       boolean     NOT NULL DEFAULT false,
    updated_by      uuid        NULL REFERENCES operators (id) ON DELETE SET NULL,
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT env_vars_app_key_unique UNIQUE (application_id, key)
);

CREATE INDEX idx_env_vars_app ON env_vars (application_id);

-- ── releases ──────────────────────────────────────────────────────────────────

CREATE TABLE releases (
    id             uuid        PRIMARY KEY DEFAULT uuidv7(),
    application_id uuid        NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
    deployment_id  uuid        NOT NULL REFERENCES deployments (id) ON DELETE CASCADE,
    path           text        NOT NULL,   -- absolute path on the server
    source_ref     text        NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_releases_app ON releases (application_id, created_at DESC);

-- ── site_aliases ──────────────────────────────────────────────────────────────

CREATE TABLE site_aliases (
    id          uuid        PRIMARY KEY DEFAULT uuidv7(),
    site_id     uuid        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
    domain      citext      NOT NULL UNIQUE,
    tls_status  text        NOT NULL DEFAULT 'pending'
                CHECK (tls_status IN ('pending','active','failed')),
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_site_aliases_site ON site_aliases (site_id);

-- ── site_health_checks ────────────────────────────────────────────────────────

CREATE TABLE site_health_checks (
    id              uuid        PRIMARY KEY DEFAULT uuidv7(),
    site_id         uuid        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
    path            text        NOT NULL DEFAULT '/',
    interval_secs   int         NOT NULL DEFAULT 30,
    timeout_secs    int         NOT NULL DEFAULT 5,
    expected_status int         NOT NULL DEFAULT 200,
    last_check_at   timestamptz NULL,
    last_status     int         NULL,
    consecutive_ok  int         NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_health_checks_updated_at
    BEFORE UPDATE ON site_health_checks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
