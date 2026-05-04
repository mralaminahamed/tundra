use async_trait::async_trait;
use tundra_plugin_sdk::{HostServices, Plugin, PluginCapability, PluginError, PluginManifest};

pub mod api;
pub mod domain_ops;

pub struct NamecheapPlugin;

#[async_trait]
impl Plugin for NamecheapPlugin {
    fn manifest(&self) -> PluginManifest {
        PluginManifest {
            id: "com.tundra.namecheap".into(),
            name: "Namecheap".into(),
            version: env!("CARGO_PKG_VERSION").into(),
            description: "Connect a Namecheap account to Tundra. Manage domain registrations, nameservers, DNS records, renewals, and WHOIS privacy without leaving the panel.".into(),
            author: "Al Amin Ahamed".into(),
            license: "Apache-2.0".into(),
            tundra_min_version: "1.0.0".into(),
            capabilities: vec![
                PluginCapability::Net {
                    hosts: vec![
                        "api.namecheap.com".into(),
                        "api.sandbox.namecheap.com".into(),
                    ],
                    max_rpm: 60,
                    max_bytes_per_request: 1_048_576,
                },
                PluginCapability::Secret {
                    names: vec![
                        "namecheap.api-user".into(),
                        "namecheap.api-key".into(),
                        "namecheap.client-ip".into(),
                    ],
                },
                PluginCapability::DbRead {
                    tables: vec!["domains".into(), "dns_zones".into(), "operators".into()],
                },
                PluginCapability::DbWrite {
                    tables: vec![
                        "domains".into(),
                        "dns_zones".into(),
                        "plugin_namecheap_state".into(),
                    ],
                },
                PluginCapability::EventsSubscribe {
                    events: vec!["domain.created".into(), "dns.zone.published".into()],
                },
                PluginCapability::EventsPublish {
                    events: vec![
                        "namecheap.sync.completed".into(),
                        "namecheap.domain.expiring-soon".into(),
                    ],
                },
                PluginCapability::BackgroundJobs { max_concurrent: 4 },
            ],
        }
    }

    async fn enable(&self, host: &dyn HostServices) -> Result<(), PluginError> {
        // Verify API credentials at enable time
        let api_key = host.get_secret("namecheap.api-key").await?;
        let api_user = host.get_secret("namecheap.api-user").await?;
        host.log(
            tracing::Level::INFO,
            &format!(
                "Namecheap plugin enabled for user {}",
                api_user.as_str().unwrap_or("unknown")
            ),
            &[],
        );
        // Stub: in production, calls namecheap.users.getBalances to verify
        drop(api_key);
        Ok(())
    }

    async fn disable(&self, _host: &dyn HostServices) -> Result<(), PluginError> {
        Ok(())
    }

    async fn shutdown(&self) {}
}
