-- Extend plugin_wordpress_installations with provisioner fields
ALTER TABLE plugin_wordpress_installations
    ADD COLUMN IF NOT EXISTS db_prefix  text NOT NULL DEFAULT 'wp_',
    ADD COLUMN IF NOT EXISTS admin_user text,
    ADD COLUMN IF NOT EXISTS language   text NOT NULL DEFAULT 'en_US';
