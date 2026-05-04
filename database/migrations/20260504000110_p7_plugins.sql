CREATE TABLE plugins (
    id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
    plugin_id           text        NOT NULL UNIQUE,
    version             text        NOT NULL,
    manifest            jsonb       NOT NULL,
    install_path        text        NOT NULL,
    source              text        NOT NULL CHECK (source IN ('core','registry','sideload')),
    state               text        NOT NULL DEFAULT 'installed'
                        CHECK (state IN ('installed','granted','enabled','disabled','quarantined','upgrading')),
    enabled_at          timestamptz,
    disabled_at         timestamptz,
    installed_by        uuid        REFERENCES operators(id) ON DELETE SET NULL,
    signature_verified  boolean     NOT NULL DEFAULT false,
    signature_authority text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_plugins_state ON plugins(state);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON plugins
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE plugin_capabilities (
    plugin_id   uuid        NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
    capability  text        NOT NULL,
    granted_at  timestamptz NOT NULL DEFAULT now(),
    granted_by  uuid        NOT NULL REFERENCES operators(id),
    PRIMARY KEY (plugin_id, capability)
);

CREATE TABLE plugin_settings (
    plugin_id   uuid        NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
    key         text        NOT NULL,
    value       jsonb       NOT NULL,
    is_secret   boolean     NOT NULL DEFAULT false,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (plugin_id, key)
);

CREATE TABLE plugin_jobs (
    id          uuid        PRIMARY KEY DEFAULT uuidv7(),
    plugin_id   uuid        NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
    name        text        NOT NULL,
    payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status      text        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','succeeded','failed')),
    run_at      timestamptz NOT NULL DEFAULT now(),
    started_at  timestamptz,
    finished_at timestamptz,
    error       text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_plugin_jobs_pending ON plugin_jobs(plugin_id, run_at) WHERE status = 'pending';

CREATE TABLE plugin_events (
    id          uuid        PRIMARY KEY DEFAULT uuidv7(),
    plugin_id   uuid        NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
    kind        text        NOT NULL,
    payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_plugin_events_recent ON plugin_events(plugin_id, occurred_at DESC);

CREATE TABLE plugin_kv (
    plugin_id   uuid    NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
    key         text    NOT NULL,
    value       bytea   NOT NULL,
    expires_at  timestamptz,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (plugin_id, key)
);

CREATE TABLE plugin_registry_entries (
    id              uuid    PRIMARY KEY DEFAULT uuidv7(),
    plugin_id       text    NOT NULL,
    registry_url    text    NOT NULL,
    name            text    NOT NULL,
    description     text,
    latest_version  text    NOT NULL,
    tier            text    NOT NULL CHECK (tier IN ('core','bundled','third-party')),
    official        boolean NOT NULL DEFAULT false,
    download_url    text,
    raw             jsonb   NOT NULL DEFAULT '{}'::jsonb,
    fetched_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (plugin_id, registry_url)
);

CREATE TABLE plugin_data_quotas (
    plugin_id       uuid    PRIMARY KEY REFERENCES plugins(id) ON DELETE CASCADE,
    kv_bytes_used   bigint  NOT NULL DEFAULT 0,
    kv_bytes_limit  bigint  NOT NULL DEFAULT 104857600,  -- 100 MiB
    updated_at      timestamptz NOT NULL DEFAULT now()
);
