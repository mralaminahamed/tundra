CREATE TABLE plugin_namecheap_state (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    domain_id           uuid NOT NULL REFERENCES domains(id) ON DELETE CASCADE UNIQUE,
    namecheap_id        text,
    is_premium          boolean NOT NULL DEFAULT false,
    is_locked           boolean NOT NULL DEFAULT false,
    is_privacy_enabled  boolean NOT NULL DEFAULT false,
    is_auto_renew       boolean NOT NULL DEFAULT false,
    expires_at          timestamptz,
    last_synced_at      timestamptz NOT NULL DEFAULT now(),
    sync_status         text NOT NULL DEFAULT 'ok',
    sync_error          text,
    raw                 jsonb
);

CREATE INDEX idx_namecheap_state_expiring ON plugin_namecheap_state(expires_at)
    WHERE is_auto_renew = false;

CREATE TABLE plugin_namecheap_audit (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operator_id     uuid REFERENCES operators(id) ON DELETE SET NULL,
    domain_id       uuid REFERENCES domains(id) ON DELETE SET NULL,
    api_method      text NOT NULL,
    request_args    jsonb NOT NULL,
    response_code   int,
    response_summary text,
    succeeded       boolean NOT NULL,
    duration_ms     int,
    created_at      timestamptz NOT NULL DEFAULT now()
);
