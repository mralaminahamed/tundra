-- Clone and staging support for WP installations.
-- Drop single-install-per-site constraint so staging/clones can share a site.
ALTER TABLE plugin_wordpress_installations
    DROP CONSTRAINT IF EXISTS plugin_wordpress_installations_site_id_key;

ALTER TABLE plugin_wordpress_installations
    ADD COLUMN IF NOT EXISTS is_staging          boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS source_install_id   uuid REFERENCES plugin_wordpress_installations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS staging_install_id  uuid REFERENCES plugin_wordpress_installations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS clone_of_id         uuid REFERENCES plugin_wordpress_installations(id) ON DELETE SET NULL;
