use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tundra_agent_reconciler::{Provider, ReconcileError, ReconcileOutcome};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoundcubeSpec {
    pub mail_domain: String,
    pub webmail_domain: String,
    pub imap_host: String,
    pub smtp_host: String,
    pub db_dsn: String,
    pub des_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoundcubeState { pub is_installed: bool, pub version: Option<String> }

pub struct RoundcubeProvider;

#[async_trait]
impl Provider for RoundcubeProvider {
    type Spec = RoundcubeSpec;
    type State = RoundcubeState;
    async fn observe(&self) -> Result<RoundcubeState, ReconcileError> {
        Ok(RoundcubeState { is_installed: false, version: None })
    }
    async fn reconcile(&self, desired: &RoundcubeSpec) -> Result<ReconcileOutcome, ReconcileError> {
        tracing::info!(domain = %desired.webmail_domain, imap = %desired.imap_host, "roundcube reconcile (stub)");
        Ok(ReconcileOutcome::Applied)
    }
    async fn destroy(&self, spec: &RoundcubeSpec) -> Result<(), ReconcileError> {
        tracing::info!(domain = %spec.webmail_domain, "roundcube destroy (stub)");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn reconcile_ok() {
        let spec = RoundcubeSpec { mail_domain: "example.com".into(), webmail_domain: "webmail.example.com".into(), imap_host: "ssl://localhost:993".into(), smtp_host: "tls://localhost:587".into(), db_dsn: "host=127.0.0.1 dbname=roundcube".into(), des_key: "rcmTypeK3yFOrTestOnly!!1".into() };
        assert_eq!(RoundcubeProvider.reconcile(&spec).await.unwrap(), ReconcileOutcome::Applied);
    }
}
