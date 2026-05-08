-- Platform-wide settings stored as one row per section.
-- Sensitive secrets (SMTP password, S3 secret key) are in dedicated bytea
-- columns so EncryptedField<T> can protect them at rest.

CREATE TABLE platform_settings (
    section          text        PRIMARY KEY,
    data             jsonb       NOT NULL DEFAULT '{}'::jsonb,
    -- SMTP
    smtp_password    bytea,
    -- S3 backup storage
    s3_secret_key    bytea,
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Seed with empty rows for every supported section so GET always returns data.
INSERT INTO platform_settings (section) VALUES
    ('general'),
    ('smtp'),
    ('notifications'),
    ('security'),
    ('backups')
ON CONFLICT (section) DO NOTHING;
