use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tundra_agent_reconciler::{Provider, ReconcileError, ReconcileOutcome};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PkgManager {
    Apt,
    Dnf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PkgSpec {
    pub packages: Vec<String>,
    pub manager: PkgManager,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PkgState {
    /// (name, version) pairs for currently installed packages.
    pub installed: Vec<(String, String)>,
}

pub struct PkgProvider;

#[async_trait]
impl Provider for PkgProvider {
    type Spec = PkgSpec;
    type State = PkgState;

    async fn observe(&self) -> Result<PkgState, ReconcileError> {
        Ok(PkgState { installed: vec![] })
    }

    async fn reconcile(&self, desired: &PkgSpec) -> Result<ReconcileOutcome, ReconcileError> {
        tracing::info!(packages = ?desired.packages, "pkg reconcile (stub)");
        Ok(ReconcileOutcome::Applied)
    }

    async fn destroy(&self, spec: &PkgSpec) -> Result<(), ReconcileError> {
        tracing::info!(packages = ?spec.packages, "pkg destroy (stub)");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn observe_returns_empty_installed() {
        let state = PkgProvider.observe().await.unwrap();
        assert!(state.installed.is_empty());
    }
}
