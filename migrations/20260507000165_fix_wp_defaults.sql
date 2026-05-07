-- Fix wp_path column default: was '/var/www/html' (document root), should be '/'
ALTER TABLE plugin_wordpress_installations
    ALTER COLUMN wp_path SET DEFAULT '/';
