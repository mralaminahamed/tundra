-- Certificates module: TLS certs managed by the ACME client (instant-acme).

CREATE TABLE acme_accounts (
    id                    uuid        PRIMARY KEY DEFAULT uuidv7(),
    directory_url         text        NOT NULL,   -- 'https://acme-v02.api.letsencrypt.org/directory'
    account_email         text        NOT NULL,
    account_key_encrypted bytea       NOT NULL,   -- EncryptedField<String, AcmeKeyFamily>
    is_default            boolean     NOT NULL DEFAULT false,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT acme_accounts_unique UNIQUE (directory_url, account_email)
);

CREATE TRIGGER trg_acme_accounts_updated_at
    BEFORE UPDATE ON acme_accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE certificates (
    id              uuid        PRIMARY KEY DEFAULT uuidv7(),
    site_id         uuid        NULL REFERENCES sites (id) ON DELETE CASCADE,
    common_name     text        NOT NULL,
    san             text[]      NOT NULL DEFAULT '{}',
    issuer          text        NOT NULL DEFAULT 'letsencrypt',
    acme_account_id uuid        NULL REFERENCES acme_accounts (id) ON DELETE SET NULL,
    cert_pem        text        NOT NULL DEFAULT '',
    chain_pem       text        NOT NULL DEFAULT '',
    key_encrypted   bytea       NOT NULL,   -- EncryptedField<String, CertKeyFamily>
    not_before      timestamptz NULL,
    not_after       timestamptz NULL,
    auto_renew      boolean     NOT NULL DEFAULT true,
    last_renewed_at timestamptz NULL,
    status          text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','active','expired','revoked','failed')),
    acme_order_url  text        NULL,       -- persisted during issuance
    challenge_token text        NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Hot-path: renewal job scans certs due within 30 days
CREATE INDEX idx_certs_renewal ON certificates (not_after)
    WHERE auto_renew = true AND status = 'active';
CREATE INDEX idx_certs_site ON certificates (site_id);

CREATE TRIGGER trg_certificates_updated_at
    BEFORE UPDATE ON certificates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
