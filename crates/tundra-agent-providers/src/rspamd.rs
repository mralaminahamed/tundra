use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tundra_agent_reconciler::{Provider, ReconcileError, ReconcileOutcome};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RspamdSpec {
    pub worker_password: String,
    pub dkim_keys_dir: String,
    pub redis_url: Option<String>,
    pub greylisting_enabled: bool,
    pub rbl_checks_enabled: bool,
    pub arc_sealing_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RspamdState { pub is_running: bool, pub version: Option<String> }

pub struct RspamdProvider;

#[async_trait]
impl Provider for RspamdProvider {
    type Spec = RspamdSpec;
    type State = RspamdState;
    async fn observe(&self) -> Result<RspamdState, ReconcileError> {
        Ok(RspamdState { is_running: false, version: None })
    }
    async fn reconcile(&self, desired: &RspamdSpec) -> Result<ReconcileOutcome, ReconcileError> {
        tracing::info!(dkim_dir = %desired.dkim_keys_dir, arc = desired.arc_sealing_enabled, "rspamd reconcile (stub)");
        Ok(ReconcileOutcome::Applied)
    }
    async fn destroy(&self, spec: &RspamdSpec) -> Result<(), ReconcileError> {
        tracing::info!(dkim_dir = %spec.dkim_keys_dir, "rspamd destroy (stub)");
        Ok(())
    }
}

impl RspamdProvider {
    pub async fn deploy_dkim_key(&self, spec: &RspamdSpec, domain: &str, selector: &str, _private_key_pem: &str) -> Result<(), ReconcileError> {
        tracing::info!(domain, selector, dir = %spec.dkim_keys_dir, "deploy_dkim_key (stub)");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn reconcile_ok() {
        let spec = RspamdSpec { worker_password: "s".into(), dkim_keys_dir: "/etc/rspamd/dkim".into(), redis_url: None, greylisting_enabled: true, rbl_checks_enabled: true, arc_sealing_enabled: true };
        assert_eq!(RspamdProvider.reconcile(&spec).await.unwrap(), ReconcileOutcome::Applied);
    }
}
