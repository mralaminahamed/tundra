use async_trait::async_trait;
use tundra_plugin_sdk::{HostServices, Plugin, PluginCapability, PluginError, PluginManifest};

pub mod api;
pub mod webhook;

pub struct GitHubPlugin;

#[async_trait]
impl Plugin for GitHubPlugin {
    fn manifest(&self) -> PluginManifest {
        PluginManifest {
            id: "com.tundra.github".into(),
            name: "GitHub".into(),
            version: env!("CARGO_PKG_VERSION").into(),
            description: "Connect a GitHub account or organization via the Tundra GitHub App. Deploy any accessible repository without manually configuring deploy keys or webhooks.".into(),
            author: "Al Amin Ahamed".into(),
            license: "Apache-2.0".into(),
            tundra_min_version: "1.0.0".into(),
            capabilities: vec![
                PluginCapability::Net {
                    hosts: vec![
                        "api.github.com".into(),
                        "github.com".into(),
                        "codeload.github.com".into(),
                    ],
                    max_rpm: 5000,
                    max_bytes_per_request: 524_288_000,
                },
                PluginCapability::Secret {
                    names: vec![
                        "github.app-id".into(),
                        "github.app-private-key".into(),
                        "github.webhook-secret".into(),
                    ],
                },
                PluginCapability::DbRead {
                    tables: vec!["sites".into(), "applications".into(), "operators".into()],
                },
                PluginCapability::DbWrite {
                    tables: vec![
                        "sites".into(),
                        "deployments".into(),
                        "plugin_github_installations".into(),
                        "plugin_github_repositories".into(),
                        "plugin_github_webhooks".into(),
                    ],
                },
                PluginCapability::EventsSubscribe {
                    events: vec![
                        "deployment.succeeded".into(),
                        "deployment.failed".into(),
                    ],
                },
                PluginCapability::EventsPublish {
                    events: vec![
                        "github.push.received".into(),
                        "github.installation.added".into(),
                        "github.deployment.status-reported".into(),
                    ],
                },
                PluginCapability::BackgroundJobs { max_concurrent: 16 },
            ],
        }
    }

    async fn enable(&self, host: &dyn HostServices) -> Result<(), PluginError> {
        let app_id = host.get_secret("github.app-id").await?;
        host.log(
            tracing::Level::INFO,
            &format!(
                "GitHub plugin enabled for App ID {}",
                app_id.as_str().unwrap_or("unknown")
            ),
            &[],
        );
        Ok(())
    }

    async fn disable(&self, _host: &dyn HostServices) -> Result<(), PluginError> {
        Ok(())
    }

    async fn shutdown(&self) {}
}
