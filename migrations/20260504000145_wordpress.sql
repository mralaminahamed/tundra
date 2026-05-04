-- Plugin-contributed templates (active when owning plugin is enabled)
CREATE TABLE plugin_templates (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plugin_id  text NOT NULL,
    template_id text NOT NULL,
    manifest   jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (plugin_id, template_id)
);

-- Seed WordPress + WooCommerce templates owned by the WordPress plugin
INSERT INTO plugin_templates (plugin_id, template_id, manifest) VALUES
(
    'com.tundra.wordpress',
    'wordpress',
    '{
        "id": "wordpress",
        "name": "WordPress",
        "description": "WordPress 6 PHP CMS. The worlds most popular content management system with a rich plugin and theme ecosystem.",
        "version": "1.0.0",
        "runtime": {"kind": "php", "version": "8.3"},
        "source": {"kind": "skeleton"},
        "build_command": null,
        "start_command": null,
        "listen_port": null,
        "env": {"WP_DEBUG": "false", "WP_DEBUG_LOG": "false"},
        "post_create": ["curl -O https://wordpress.org/latest.tar.gz && tar xzf latest.tar.gz --strip-components=1 && rm latest.tar.gz"],
        "tags": ["php", "wordpress", "cms", "blog"],
        "icon": "wordpress"
    }'::jsonb
),
(
    'com.tundra.wordpress',
    'woocommerce',
    '{
        "id": "woocommerce",
        "name": "WooCommerce",
        "description": "WordPress 6 with WooCommerce pre-configured for e-commerce. Includes product catalog, cart, checkout, and payment gateway integrations.",
        "version": "1.0.0",
        "runtime": {"kind": "php", "version": "8.3"},
        "source": {"kind": "skeleton"},
        "build_command": null,
        "start_command": null,
        "listen_port": null,
        "env": {"WP_DEBUG": "false", "WP_DEBUG_LOG": "false"},
        "post_create": ["curl -O https://wordpress.org/latest.tar.gz && tar xzf latest.tar.gz --strip-components=1 && rm latest.tar.gz"],
        "tags": ["php", "wordpress", "woocommerce", "ecommerce", "shop"],
        "icon": "woocommerce"
    }'::jsonb
);

-- WordPress installation tracker (one WP install per site)
CREATE TABLE plugin_wordpress_installations (
    id              uuid NOT NULL DEFAULT uuidv7() PRIMARY KEY,
    site_id         uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    wp_version      text,
    wp_path         text NOT NULL DEFAULT '/var/www/html',
    db_name         text,
    db_user         text,
    db_host         text NOT NULL DEFAULT 'localhost',
    admin_email     text,
    site_title      text,
    site_url        text,
    multisite       boolean NOT NULL DEFAULT false,
    state           text NOT NULL DEFAULT 'provisioning'
                    CHECK (state IN ('provisioning','active','error','removing')),
    error_message   text,
    installed_by    uuid REFERENCES operators(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (site_id)
);
CREATE TRIGGER trg_wp_installations_updated_at
    BEFORE UPDATE ON plugin_wordpress_installations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- WordPress plugins per installation
CREATE TABLE plugin_wordpress_plugins (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    installation_id uuid NOT NULL REFERENCES plugin_wordpress_installations(id) ON DELETE CASCADE,
    slug            text NOT NULL,
    name            text NOT NULL,
    version         text,
    author          text,
    description     text,
    active          boolean NOT NULL DEFAULT false,
    update_available boolean NOT NULL DEFAULT false,
    new_version     text,
    last_synced_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (installation_id, slug)
);
CREATE INDEX idx_wp_plugins_installation ON plugin_wordpress_plugins(installation_id);

-- WordPress themes per installation
CREATE TABLE plugin_wordpress_themes (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    installation_id uuid NOT NULL REFERENCES plugin_wordpress_installations(id) ON DELETE CASCADE,
    slug            text NOT NULL,
    name            text NOT NULL,
    version         text,
    author          text,
    description     text,
    active          boolean NOT NULL DEFAULT false,
    update_available boolean NOT NULL DEFAULT false,
    new_version     text,
    screenshot_url  text,
    last_synced_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (installation_id, slug)
);
CREATE INDEX idx_wp_themes_installation ON plugin_wordpress_themes(installation_id);
