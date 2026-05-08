-- Bootstrap: extensions and shared utility functions.
-- Must run first; every subsequent migration depends on these.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_bytes, digest()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- legacy uuid_generate_v4 (compat)
CREATE EXTENSION IF NOT EXISTS "btree_gin";  -- composite GIN for jsonb + status filters
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- trigram search for partial name matching
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive text (emails, domain names)

-- UUIDv7: monotonic time-ordered UUIDs (48 ms timestamp + version + 74 random bits).
-- PG18 may expose this natively; CREATE OR REPLACE is safe either way.
CREATE OR REPLACE FUNCTION uuidv7()
RETURNS uuid AS $$
DECLARE
  v_ms  BIGINT;
  bytes BYTEA;
BEGIN
  v_ms  := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
  bytes := SUBSTRING(int8send(v_ms), 3, 6) || gen_random_bytes(10);
  bytes := SET_BYTE(bytes, 6, (GET_BYTE(bytes, 6) & 15) | 112);  -- version = 7
  bytes := SET_BYTE(bytes, 8, (GET_BYTE(bytes, 8) & 63) | 128);  -- variant = 10
  RETURN ENCODE(bytes, 'hex')::uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Generic BEFORE UPDATE trigger function — attached per table.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
