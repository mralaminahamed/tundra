use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tundra_agent_reconciler::{Provider, ReconcileError, ReconcileOutcome};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DovecotSpec {
    pub pgsql_dsn: String,
    pub mail_base_dir: String,
    pub protocols: Vec<String>,
    pub ssl_cert: Option<String>,
    pub ssl_key: Option<String>,
    pub quota_plugin_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DovecotState { pub is_running: bool, pub imap_sessions: u32, pub version: Option<String> }

pub struct DovecotProvider;

#[async_trait]
impl Provider for DovecotProvider {
    type Spec = DovecotSpec;
    type State = DovecotState;
    async fn observe(&self) -> Result<DovecotState, ReconcileError> {
        Ok(DovecotState { is_running: false, imap_sessions: 0, version: None })
    }
    async fn reconcile(&self, desired: &DovecotSpec) -> Result<ReconcileOutcome, ReconcileError> {
        tracing::info!(mail_base = %desired.mail_base_dir, quota = desired.quota_plugin_enabled, "dovecot reconcile (stub)");
        Ok(ReconcileOutcome::Applied)
    }
    async fn destroy(&self, spec: &DovecotSpec) -> Result<(), ReconcileError> {
        tracing::info!(mail_base = %spec.mail_base_dir, "dovecot destroy (stub)");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn reconcile_ok() {
        let spec = DovecotSpec { pgsql_dsn: "host=127.0.0.1".into(), mail_base_dir: "/srv/mail".into(), protocols: vec!["imap".into()], ssl_cert: None, ssl_key: None, quota_plugin_enabled: true };
        assert_eq!(DovecotProvider.reconcile(&spec).await.unwrap(), ReconcileOutcome::Applied);
    }
}
