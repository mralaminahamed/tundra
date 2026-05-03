use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tundra_agent_reconciler::{Provider, ReconcileError, ReconcileOutcome};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForwardZone { pub zone: String, pub forward_addrs: Vec<String> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnboundSpec {
    pub listen_addresses: Vec<String>,
    pub forward_zones: Vec<ForwardZone>,
    pub access_control: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnboundState { pub is_running: bool, pub version: Option<String> }

pub struct UnboundProvider;

#[async_trait]
impl Provider for UnboundProvider {
    type Spec = UnboundSpec;
    type State = UnboundState;
    async fn observe(&self) -> Result<UnboundState, ReconcileError> {
        Ok(UnboundState { is_running: false, version: None })
    }
    async fn reconcile(&self, desired: &UnboundSpec) -> Result<ReconcileOutcome, ReconcileError> {
        tracing::info!(listen = ?desired.listen_addresses, "unbound reconcile (stub)");
        Ok(ReconcileOutcome::Applied)
    }
    async fn destroy(&self, _spec: &UnboundSpec) -> Result<(), ReconcileError> {
        tracing::info!("unbound destroy (stub)");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn reconcile_ok() {
        let spec = UnboundSpec { listen_addresses: vec!["127.0.0.1".into()], forward_zones: vec![], access_control: vec![] };
        assert_eq!(UnboundProvider.reconcile(&spec).await.unwrap(), ReconcileOutcome::Applied);
    }
}
