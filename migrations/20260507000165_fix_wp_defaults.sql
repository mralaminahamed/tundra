-- Fix wp_path column default: was '/var/www/html' (document root), should be '/'
ALTER TABLE plugin_wordpress_installations
    ALTER COLUMN wp_path SET DEFAULT '/';

-- Add updated_at trigger for backup schedules table (was missing)
SELECT add_updated_at_trigger('plugin_wordpress_backup_schedules');
