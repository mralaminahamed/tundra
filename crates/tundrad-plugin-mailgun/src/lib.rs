use async_trait::async_trait;
use tundra_plugin_sdk::{HostServices, Plugin, PluginCapability, PluginError, PluginManifest};

pub mod api;
pub mod relay_ops;

pub struct MailgunPlugin;

#[async_trait]
impl Plugin for MailgunPlugin {
    fn manifest(&self) -> PluginManifest {
        PluginManifest {
            id: "com.tundra.mailgun".into(),
            name: "Mailgun Smarthost Relay".into(),
            version: env!("CARGO_PKG_VERSION").into(),
            description: "Route outbound email through Mailgun SMTP relay. Supports per-domain sender configuration and delivery analytics.".into(),
            author: "Al Amin Ahamed".into(),
            license: "Apache-2.0".into(),
            tundra_min_version: "1.0.0".into(),
            capabilities: vec![
                PluginCapability::Net {
                    hosts: vec![
                        "api.mailgun.net".into(),
                        "smtp.mailgun.org".into(),
                    ],
                    max_rpm: 300,
                    max_bytes_per_request: 1_048_576,
                },
                PluginCapability::Secret {
                    names: vec![
                        "mailgun.api-key".into(),
                        "mailgun.domain".into(),
                        "mailgun.smtp-password".into(),
                    ],
                },
                PluginCapability::DbRead {
                    tables: vec!["mail_domains".into(), "operators".into()],
                },
                PluginCapability::DbWrite {
                    tables: vec!["plugin_mailgun_state".into()],
                },
                PluginCapability::EventsSubscribe {
                    events: vec!["mail.domain.created".into()],
                },
                PluginCapability::EventsPublish {
                    events: vec!["mailgun.relay.configured".into()],
                },
                PluginCapability::BackgroundJobs { max_concurrent: 2 },
            ],
        }
    }

    async fn enable(&self, host: &dyn HostServices) -> Result<(), PluginError> {
        // Verify API key at enable time
        let _api_key = host.get_secret("mailgun.api-key").await?;
        host.log(tracing::Level::INFO, "Mailgun plugin enabled", &[]);
        Ok(())
    }

    async fn disable(&self, _host: &dyn HostServices) -> Result<(), PluginError> {
        Ok(())
    }

    async fn shutdown(&self) {}
}
