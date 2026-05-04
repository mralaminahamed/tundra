use async_trait::async_trait;
use tundra_plugin_sdk::{HostServices, Plugin, PluginCapability, PluginError, PluginManifest};

pub mod api;
pub mod zone_ops;

pub struct CloudflareDnsPlugin;

#[async_trait]
impl Plugin for CloudflareDnsPlugin {
    fn manifest(&self) -> PluginManifest {
        PluginManifest {
            id: "com.tundra.cloudflare-dns".into(),
            name: "Cloudflare DNS Provider".into(),
            version: env!("CARGO_PKG_VERSION").into(),
            description: "DNS provider for Cloudflare. Manage zones, records, and ACME DNS-01 challenges through the Cloudflare API.".into(),
            author: "Al Amin Ahamed".into(),
            license: "Apache-2.0".into(),
            tundra_min_version: "1.0.0".into(),
            capabilities: vec![
                PluginCapability::Net {
                    hosts: vec!["api.cloudflare.com".into()],
                    max_rpm: 1200,
                    max_bytes_per_request: 1_048_576,
                },
                PluginCapability::Secret {
                    names: vec![
                        "cloudflare.api-token".into(),
                        "cloudflare.zone-id".into(),
                    ],
                },
                PluginCapability::DbRead {
                    tables: vec!["domains".into(), "dns_zones".into()],
                },
                PluginCapability::DbWrite {
                    tables: vec!["dns_zones".into(), "plugin_cloudflare_state".into()],
                },
                PluginCapability::EventsSubscribe {
                    events: vec![
                        "dns.zone.published".into(),
                        "domain.created".into(),
                    ],
                },
                PluginCapability::EventsPublish {
                    events: vec!["cloudflare.sync.completed".into()],
                },
                PluginCapability::BackgroundJobs { max_concurrent: 8 },
            ],
        }
    }

    async fn enable(&self, host: &dyn HostServices) -> Result<(), PluginError> {
        // Verify API token at enable time
        let _api_token = host.get_secret("cloudflare.api-token").await?;
        host.log(tracing::Level::INFO, "Cloudflare DNS plugin enabled", &[]);
        Ok(())
    }

    async fn disable(&self, _host: &dyn HostServices) -> Result<(), PluginError> {
        Ok(())
    }

    async fn shutdown(&self) {}
}
