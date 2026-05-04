-- Seed system roles and their permission grants.
-- Roles with is_system=true cannot be deleted via the API.

-- ── Roles ─────────────────────────────────────────────────────────────────────

INSERT INTO roles (id, slug, name, description, is_system) VALUES
    (uuidv7(), 'owner',    'Owner',    'Full access including destructive operations and master-key rotation', true),
    (uuidv7(), 'admin',    'Admin',    'All actions except server deletion and master-key rotation',           true),
    (uuidv7(), 'operator', 'Operator', 'Manage sites, deployments, and databases',                            true),
    (uuidv7(), 'readonly', 'Read-only','View-only access across all resources',                                true);

-- ── Permissions ───────────────────────────────────────────────────────────────

INSERT INTO permissions (id, slug, resource, action, description) VALUES
    -- Operators
    (uuidv7(), 'operators.read',          'operators',   'read',          'List and view operators'),
    (uuidv7(), 'operators.create',        'operators',   'create',        'Invite new operators'),
    (uuidv7(), 'operators.update',        'operators',   'update',        'Update operator profiles and roles'),
    (uuidv7(), 'operators.delete',        'operators',   'delete',        'Delete / deactivate operators'),
    -- Servers
    (uuidv7(), 'servers.read',            'servers',     'read',          'List and view servers'),
    (uuidv7(), 'servers.create',          'servers',     'create',        'Add new servers'),
    (uuidv7(), 'servers.update',          'servers',     'update',        'Update server configuration'),
    (uuidv7(), 'servers.delete',          'servers',     'delete',        'Remove servers (destructive)'),
    -- Sites
    (uuidv7(), 'sites.read',              'sites',       'read',          'List and view sites'),
    (uuidv7(), 'sites.create',            'sites',       'create',        'Create new sites'),
    (uuidv7(), 'sites.update',            'sites',       'update',        'Update site configuration'),
    (uuidv7(), 'sites.delete',            'sites',       'delete',        'Delete sites'),
    -- Deployments
    (uuidv7(), 'deployments.read',        'deployments', 'read',          'View deployment history and logs'),
    (uuidv7(), 'deployments.create',      'deployments', 'create',        'Trigger deployments'),
    -- API tokens
    (uuidv7(), 'tokens.read',             'tokens',      'read',          'List own API tokens'),
    (uuidv7(), 'tokens.create',           'tokens',      'create',        'Create API tokens'),
    (uuidv7(), 'tokens.delete',           'tokens',      'delete',        'Revoke API tokens'),
    -- Audit log
    (uuidv7(), 'audit_log.read',          'audit_log',   'read',          'View audit log'),
    -- Settings
    (uuidv7(), 'settings.read',           'settings',    'read',          'View system settings'),
    (uuidv7(), 'settings.update',         'settings',    'update',        'Modify system settings'),
    -- Crypto / master key
    (uuidv7(), 'master_key.rotate',       'master_key',  'rotate',        'Rotate the master encryption key'),
    -- MCP
    (uuidv7(), 'mcp.read',                'mcp',         'read',          'Initiate read-only MCP sessions'),
    (uuidv7(), 'mcp.write',               'mcp',         'write',         'Initiate read-write MCP sessions');

-- ── Role ↔ Permission grants ──────────────────────────────────────────────────

-- owner: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r, permissions p
WHERE  r.slug = 'owner';

-- admin: all except servers.delete and master_key.rotate
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r, permissions p
WHERE  r.slug = 'admin'
  AND  p.slug NOT IN ('servers.delete', 'master_key.rotate');

-- operator: sites, deployments, tokens (own), audit_log.read, servers.read, mcp.read
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r, permissions p
WHERE  r.slug = 'operator'
  AND  p.slug IN (
    'servers.read',
    'sites.read', 'sites.create', 'sites.update', 'sites.delete',
    'deployments.read', 'deployments.create',
    'tokens.read', 'tokens.create', 'tokens.delete',
    'audit_log.read',
    'mcp.read'
  );

-- readonly: *.read only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r, permissions p
WHERE  r.slug = 'readonly'
  AND  p.action = 'read';
