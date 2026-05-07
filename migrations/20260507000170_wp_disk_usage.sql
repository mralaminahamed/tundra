ALTER TABLE plugin_wordpress_installations
    ADD COLUMN IF NOT EXISTS disk_usage_mb bigint NULL;
