-- Tundra dev compose: PostgreSQL 18 extensions
-- Mirrors the production install procedure documented in
-- tundra-deployment-runbook-v1.md §2.3 and tundra-database-schema-v1.md §2.1
--
-- Author: Al Amin Ahamed  <github.com/mralaminahamed>

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "citext";

-- pg_partman is used by tundrad for partitioning metrics_samples (see schema §3.12)
-- but is not in the base postgres:18 image; the migration job will surface a
-- clear error if it isn't installed at the OS layer. For dev compose we skip it
-- and partition manually via the migration set.
