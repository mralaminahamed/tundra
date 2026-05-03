-- Bootstrap: extensions and shared utility functions.
-- Must run first; every subsequent migration depends on these.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_bytes, digest()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- legacy uuid_generate_v4 (compat)
CREATE EXTENSION IF NOT EXISTS "btree_gin";  -- composite GIN for jsonb + status filters
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- trigram search for partial name matching
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive text (emails, domain names)

-- Generic BEFORE UPDATE trigger function — attached per table.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
