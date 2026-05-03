use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tundra_agent_reconciler::{Provider, ReconcileError, ReconcileOutcome};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemdUnitSpec {
    pub unit_name: String,
    pub unit_content: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemdUnitState {
    pub is_active: bool,
    pub is_enabled: bool,
}

pub struct SystemdProvider;

#[async_trait]
impl Provider for SystemdProvider {
    type Spec = SystemdUnitSpec;
    type State = SystemdUnitState;

    async fn observe(&self) -> Result<SystemdUnitState, ReconcileError> {
        Ok(SystemdUnitState {
            is_active: false,
            is_enabled: false,
        })
    }

    async fn reconcile(
        &self,
        desired: &SystemdUnitSpec,
    ) -> Result<ReconcileOutcome, ReconcileError> {
        tracing::info!(unit = %desired.unit_name, "systemd reconcile (stub)");
        Ok(ReconcileOutcome::Applied)
    }

    async fn destroy(&self, spec: &SystemdUnitSpec) -> Result<(), ReconcileError> {
        tracing::info!(unit = %spec.unit_name, "systemd destroy (stub)");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn reconcile_no_error() {
        let spec = SystemdUnitSpec {
            unit_name: "myapp.service".into(),
            unit_content: "[Unit]\nDescription=My App\n".into(),
            enabled: true,
        };
        let outcome = SystemdProvider.reconcile(&spec).await.unwrap();
        assert_eq!(outcome, ReconcileOutcome::Applied);
    }
}
