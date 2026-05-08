use async_trait::async_trait;
use tundra_plugin_sdk::{HostServices, Plugin, PluginCapability, PluginError, PluginManifest};

pub struct WordPressPlugin;

pub const WORDPRESS_YAML: &str = include_str!("../../../templates/sites/wordpress.yaml");
pub const WOOCOMMERCE_YAML: &str = include_str!("../../../templates/sites/woocommerce.yaml");

#[async_trait]
impl Plugin for WordPressPlugin {
    fn manifest(&self) -> PluginManifest {
        PluginManifest {
            id: "com.tundra.wordpress".into(),
            name: "WordPress".into(),
            version: env!("CARGO_PKG_VERSION").into(),
            description: "Manage WordPress installations: install WP/WooCommerce sites, \
                          install/update/remove plugins and themes, perform clean removal."
                .into(),
            author: "Al Amin Ahamed".into(),
            license: "Apache-2.0".into(),
            tundra_min_version: "1.0.0".into(),
            capabilities: vec![
                PluginCapability::Net {
                    hosts: vec![
                        "api.wordpress.org".into(),
                        "downloads.wordpress.org".into(),
                        "wordpress.org".into(),
                    ],
                    max_rpm: 120,
                    max_bytes_per_request: 536_870_912,
                },
                PluginCapability::DbRead {
                    tables: vec![
                        "sites".into(),
                        "servers".into(),
                        "operators".into(),
                        "plugin_wordpress_installations".into(),
                        "plugin_wordpress_plugins".into(),
                        "plugin_wordpress_themes".into(),
                        "plugin_templates".into(),
                    ],
                },
                PluginCapability::DbWrite {
                    tables: vec![
                        "plugin_wordpress_installations".into(),
                        "plugin_wordpress_plugins".into(),
                        "plugin_wordpress_themes".into(),
                    ],
                },
                PluginCapability::EventsSubscribe {
                    events: vec!["site.created".into(), "site.deleted".into()],
                },
                PluginCapability::EventsPublish {
                    events: vec![
                        "wordpress.installed".into(),
                        "wordpress.removed".into(),
                        "wordpress.plugin.installed".into(),
                        "wordpress.plugin.removed".into(),
                        "wordpress.theme.activated".into(),
                    ],
                },
                PluginCapability::BackgroundJobs { max_concurrent: 4 },
            ],
        }
    }

    async fn enable(&self, host: &dyn HostServices) -> Result<(), PluginError> {
        host.log(
            tracing::Level::INFO,
            "WordPress plugin enabled — WP and WooCommerce templates now available",
            &[],
        );
        Ok(())
    }

    async fn disable(&self, _host: &dyn HostServices) -> Result<(), PluginError> {
        Ok(())
    }

    async fn shutdown(&self) {}
}
