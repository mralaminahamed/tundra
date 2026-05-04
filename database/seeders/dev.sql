-- Tundra dev seed data
-- Password for all operators: admin123!
-- Argon2id($m=65536,t=3,p=1): $argon2id$v=19$m=65536,t=3,p=1$...$...
-- Re-generate with: cargo run -p tundrad-bin -- seed hash-password admin123!
--
-- Usage: cargo run -p tundrad-bin -- seed run
--        DATABASE_URL=... sqlx run seeds/dev.sql (not recommended; use the CLI)

-- ── Operators ──────────────────────────────────────────────────────────────

INSERT INTO operators (public_id, email, full_name, role, password_hash) VALUES
  ('op_owner_001',
   'admin@tundra.local',
   'Admin',
   'owner',
   '$argon2id$v=19$m=65536,t=3,p=1$vEQiqZpkw/+pycT1UJ5jkQ$bYfMO5BQXbk+MJo1wmM8XiFdgal+7sGJHD1CGDiW1Pc'),
  ('op_admin_002',
   'alice@tundra.local',
   'Alice',
   'admin',
   '$argon2id$v=19$m=65536,t=3,p=1$vEQiqZpkw/+pycT1UJ5jkQ$bYfMO5BQXbk+MJo1wmM8XiFdgal+7sGJHD1CGDiW1Pc'),
  ('op_readonly_003',
   'viewer@tundra.local',
   'Viewer',
   'readonly',
   '$argon2id$v=19$m=65536,t=3,p=1$vEQiqZpkw/+pycT1UJ5jkQ$bYfMO5BQXbk+MJo1wmM8XiFdgal+7sGJHD1CGDiW1Pc')
ON CONFLICT (email) DO NOTHING;

-- ── Demo servers (no real agent — display only) ────────────────────────────

INSERT INTO servers (label, public_ip, private_ip, region, status) VALUES
  ('web-01', '203.0.113.10', '10.0.0.10', 'us-east-1', 'active'),
  ('web-02', '203.0.113.11', '10.0.0.11', 'us-east-1', 'active'),
  ('db-01',  '203.0.113.20', '10.0.0.20', 'us-east-1', 'active')
ON CONFLICT DO NOTHING;

-- ── Demo sites ─────────────────────────────────────────────────────────────

WITH srv AS (SELECT id FROM servers WHERE label = 'web-01' LIMIT 1)
INSERT INTO sites (server_id, domain, php_version, doc_root, status)
SELECT srv.id, 'example.com',    '8.3', '/var/www/example.com/public',    'active' FROM srv
UNION ALL
SELECT srv.id, 'blog.local',     '8.2', '/var/www/blog.local/public',     'active' FROM srv
ON CONFLICT DO NOTHING;

-- ── Demo domains ───────────────────────────────────────────────────────────

INSERT INTO domains (name, provider, status) VALUES
  ('example.com', 'namecheap', 'active'),
  ('blog.local',  'manual',    'active')
ON CONFLICT DO NOTHING;
