-- mail_domains: owned mail domains
CREATE TABLE mail_domains (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  domain          citext      NOT NULL UNIQUE,
  spf_policy      text        NOT NULL DEFAULT 'v=spf1 mx ~all',
  dmarc_policy    text        NOT NULL DEFAULT 'v=DMARC1; p=none; rua=mailto:postmaster@example.com',
  mx_host         text        NOT NULL,
  active          boolean     NOT NULL DEFAULT true,
  webmail_enabled boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_mail_domains_updated_at
  BEFORE UPDATE ON mail_domains
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dkim_keys: RSA/Ed25519 keypairs — private key encrypted under master key
CREATE TABLE dkim_keys (
  id                   uuid        PRIMARY KEY DEFAULT uuidv7(),
  mail_domain_id       uuid        NOT NULL REFERENCES mail_domains(id) ON DELETE CASCADE,
  selector             text        NOT NULL,                -- e.g. "tundra2026"
  algorithm            text        NOT NULL DEFAULT 'rsa'
                         CHECK (algorithm IN ('rsa','ed25519')),
  public_key_pem       text        NOT NULL,
  private_key_encrypted bytea      NOT NULL,                -- EncryptedField<String, DkimPrivateKeyFamily>
  is_active            boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dkim_keys_domain_selector UNIQUE (mail_domain_id, selector)
);
CREATE INDEX idx_dkim_keys_domain ON dkim_keys (mail_domain_id);

-- mailboxes: individual mailboxes (local@domain)
CREATE TABLE mailboxes (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  mail_domain_id  uuid        NOT NULL REFERENCES mail_domains(id) ON DELETE CASCADE,
  local_part      citext      NOT NULL,
  password_hash   text        NULL,
  password_scheme text        NOT NULL DEFAULT 'ARGON2ID'
                    CHECK (password_scheme IN ('ARGON2ID','SHA512-CRYPT')),
  quota_bytes     bigint      NOT NULL DEFAULT 1073741824,
  used_bytes      bigint      NOT NULL DEFAULT 0,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mailboxes_unique UNIQUE (mail_domain_id, local_part)
);
CREATE INDEX idx_mailboxes_used ON mailboxes (used_bytes) WHERE is_active = true;
CREATE TRIGGER trg_mailboxes_updated_at
  BEFORE UPDATE ON mailboxes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- aliases: virtual alias entries (one source → one or more destinations)
CREATE TABLE aliases (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  mail_domain_id  uuid        NOT NULL REFERENCES mail_domains(id) ON DELETE CASCADE,
  source          citext      NOT NULL,
  destinations    text[]      NOT NULL,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aliases_source_unique UNIQUE (mail_domain_id, source)
);
CREATE INDEX idx_aliases_domain ON aliases (mail_domain_id);
CREATE TRIGGER trg_aliases_updated_at
  BEFORE UPDATE ON aliases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- mail_queue: Postfix queue mirror (refreshed on demand, not authoritative)
CREATE TABLE mail_queue (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  queue_id        text        NOT NULL UNIQUE,
  queue_name      text        NOT NULL CHECK (queue_name IN ('active','deferred','hold','corrupt','incoming')),
  sender          text        NOT NULL,
  recipients      text[]      NOT NULL,
  subject         text        NULL,
  size_bytes      bigint      NOT NULL DEFAULT 0,
  arrival_time    timestamptz NOT NULL,
  reason          text        NULL,
  refreshed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mail_queue_arrival ON mail_queue (arrival_time DESC);

-- mail_log: last 30 days of delivery records
CREATE TABLE mail_log (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  mail_domain_id  uuid        NULL REFERENCES mail_domains(id) ON DELETE SET NULL,
  queue_id        text        NULL,
  sender          text        NOT NULL,
  recipient       text        NOT NULL,
  status          text        NOT NULL CHECK (status IN ('sent','deferred','bounced','rejected')),
  relay           text        NULL,
  delay_s         numeric     NULL,
  details         text        NULL,
  logged_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mail_log_domain    ON mail_log (mail_domain_id, logged_at DESC);
CREATE INDEX idx_mail_log_recipient ON mail_log (recipient, logged_at DESC);
