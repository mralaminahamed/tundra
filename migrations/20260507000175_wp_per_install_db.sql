-- Each WP installation gets its own MySQL database + credentials.
-- Add db_password storage and missing credential columns.
ALTER TABLE plugin_wordpress_installations
    ADD COLUMN IF NOT EXISTS db_password  text,
    ADD COLUMN IF NOT EXISTS db_prefix    text NOT NULL DEFAULT 'wp_',
    ADD COLUMN IF NOT EXISTS admin_user   text NOT NULL DEFAULT 'admin',
    ADD COLUMN IF NOT EXISTS language     text NOT NULL DEFAULT 'en_US';
