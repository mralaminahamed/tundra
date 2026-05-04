use async_trait::async_trait;
use tundra_plugin_sdk::{HostServices, Plugin, PluginCapability, PluginError, PluginManifest};

pub struct DiscordAlertsPlugin;

#[async_trait]
impl Plugin for DiscordAlertsPlugin {
    fn manifest(&self) -> PluginManifest {
        PluginManifest {
            id: "com.tundra.discord-alerts".into(),
            name: "Discord Alerts".into(),
            version: env!("CARGO_PKG_VERSION").into(),
            description: "Route Tundra alerts and deployment notifications to Discord channels via webhooks. Supports per-server and per-site routing rules.".into(),
            author: "Al Amin Ahamed".into(),
            license: "Apache-2.0".into(),
            tundra_min_version: "1.0.0".into(),
            capabilities: vec![
                PluginCapability::Net {
                    hosts: vec![
                        "discord.com".into(),
                        "discordapp.com".into(),
                    ],
                    max_rpm: 50,
                    max_bytes_per_request: 1_048_576,
                },
                PluginCapability::Secret {
                    names: vec!["discord.webhook-url".into()],
                },
                PluginCapability::DbRead {
                    tables: vec![
                        "servers".into(),
                        "sites".into(),
                        "alert_rules".into(),
                        "alert_deliveries".into(),
                    ],
                },
                PluginCapability::DbWrite {
                    tables: vec!["plugin_discord_state".into()],
                },
                PluginCapability::EventsSubscribe {
                    events: vec![
                        "alert.fired".into(),
                        "deployment.completed".into(),
                        "deployment.failed".into(),
                        "server.offline".into(),
                    ],
                },
                PluginCapability::EventsPublish {
                    events: vec!["discord.notification.sent".into()],
                },
                PluginCapability::BackgroundJobs { max_concurrent: 4 },
            ],
        }
    }

    async fn enable(&self, host: &dyn HostServices) -> Result<(), PluginError> {
        let _webhook_url = host.get_secret("discord.webhook-url").await?;
        host.log(tracing::Level::INFO, "Discord alerts plugin enabled", &[]);
        Ok(())
    }

    async fn disable(&self, _host: &dyn HostServices) -> Result<(), PluginError> {
        Ok(())
    }

    async fn shutdown(&self) {}
}
