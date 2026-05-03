-- domains: apex domains managed by Tundra (DNS-managed or registered)
CREATE TABLE domains (
  id                       uuid        PRIMARY KEY DEFAULT uuidv7(),
  apex                     citext      NOT NULL,
  dns_managed_by           text        NOT NULL DEFAULT 'tundra'
                             CHECK (dns_managed_by IN ('tundra','external','registrar')),
  registration_expires_at  timestamptz NULL,
  auto_renew               boolean     NOT NULL DEFAULT true,
  ns_locked                boolean     NOT NULL DEFAULT false,
  notes                    text        NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT domains_apex_unique UNIQUE (apex)
);
CREATE INDEX idx_domains_dns_mgmt ON domains (dns_managed_by);
CREATE INDEX idx_domains_expiry   ON domains (registration_expires_at) WHERE auto_renew = true;

CREATE TRIGGER trg_domains_updated_at
  BEFORE UPDATE ON domains
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dns_zones: PowerDNS zone metadata (one per tundra-managed domain)
CREATE TABLE dns_zones (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  domain_id       uuid        NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  soa_serial      int         NOT NULL DEFAULT 1,
  dnssec_enabled  boolean     NOT NULL DEFAULT false,
  nsec3_salt      text        NULL,
  algorithm       text        NOT NULL DEFAULT 'RSASHA256',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dns_zones_domain_unique UNIQUE (domain_id)
);
CREATE TRIGGER trg_dns_zones_updated_at
  BEFORE UPDATE ON dns_zones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dns_records: individual resource records
CREATE TABLE dns_records (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  domain_id   uuid        NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  type        text        NOT NULL
                CHECK (type IN ('A','AAAA','CNAME','MX','TXT','NS','SRV','CAA','PTR','SOA','SVCB','HTTPS')),
  ttl         int         NOT NULL DEFAULT 300,
  priority    int         NULL,
  content     text        NOT NULL,
  is_managed  boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dns_records_unique UNIQUE (domain_id, name, type, content)
);
CREATE INDEX idx_dns_records_domain ON dns_records (domain_id);
CREATE TRIGGER trg_dns_records_updated_at
  BEFORE UPDATE ON dns_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ns_history: append-only log of NS changes
CREATE TABLE ns_history (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  domain_id   uuid        NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  nameservers text[]      NOT NULL,
  changed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ns_history_domain ON ns_history (domain_id, changed_at DESC);
