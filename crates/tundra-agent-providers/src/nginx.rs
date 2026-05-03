use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tundra_agent_reconciler::{Provider, ReconcileError, ReconcileOutcome};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NginxSiteSpec {
    pub site_id: String,
    pub primary_domain: String,
    pub aliases: Vec<String>,
    pub document_root: String,
    /// `Some` → PHP site (socket path); `None` → static files only.
    pub php_fpm_socket: Option<String>,
    pub ssl_cert_path: Option<String>,
    pub ssl_key_path: Option<String>,
    pub force_https: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NginxSiteState {
    pub config_path: String,
    pub is_enabled: bool,
    pub nginx_ok: bool,
}

pub struct NginxProvider {
    config_dir: PathBuf,
    enabled_dir: PathBuf,
}

impl NginxProvider {
    pub fn new(config_dir: impl Into<PathBuf>, enabled_dir: impl Into<PathBuf>) -> Self {
        Self {
            config_dir: config_dir.into(),
            enabled_dir: enabled_dir.into(),
        }
    }
}

#[async_trait]
impl Provider for NginxProvider {
    type Spec = NginxSiteSpec;
    type State = NginxSiteState;

    async fn observe(&self) -> Result<NginxSiteState, ReconcileError> {
        Ok(NginxSiteState {
            config_path: self.config_dir.to_string_lossy().into_owned(),
            is_enabled: false,
            nginx_ok: true,
        })
    }

    async fn reconcile(&self, desired: &NginxSiteSpec) -> Result<ReconcileOutcome, ReconcileError> {
        // P2 stub: real impl renders config template, writes file, symlinks,
        // runs `nginx -t`, then `nginx -s reload`.
        tracing::info!(site = %desired.site_id, "nginx reconcile (stub)");
        Ok(ReconcileOutcome::Applied)
    }

    async fn destroy(&self, spec: &NginxSiteSpec) -> Result<(), ReconcileError> {
        tracing::info!(site = %spec.site_id, "nginx destroy (stub)");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn observe_and_reconcile_no_error() {
        let p = NginxProvider::new("/etc/nginx/sites-available", "/etc/nginx/sites-enabled");
        let spec = NginxSiteSpec {
            site_id: "test-site".into(),
            primary_domain: "example.com".into(),
            aliases: vec![],
            document_root: "/srv/sites/test-site/current".into(),
            php_fpm_socket: None,
            ssl_cert_path: None,
            ssl_key_path: None,
            force_https: false,
        };
        p.observe().await.unwrap();
        let outcome = p.reconcile(&spec).await.unwrap();
        assert_eq!(outcome, ReconcileOutcome::Applied);
    }
}
