use async_trait::async_trait;
use serde::{Serialize, de::DeserializeOwned};

use crate::ReconcileError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReconcileOutcome {
    /// Already in desired state — no changes made.
    NoOp,
    /// Changes applied successfully.
    Applied,
    /// Waiting for an external condition (e.g. package download).
    Pending,
}

/// Every managed resource type on a server implements `Provider`.
///
/// Spec and State are serializable so they can be embedded in JSON desired-state
/// documents sent from `tundrad` to the agent.
#[async_trait]
pub trait Provider: Send + Sync {
    type Spec: Serialize + DeserializeOwned + Send + Sync;
    type State: Serialize + DeserializeOwned + Send + Sync;

    /// Read current actual state from the host (non-mutating).
    async fn observe(&self) -> Result<Self::State, ReconcileError>;

    /// Drive actual state toward `desired`. Idempotent.
    async fn reconcile(&self, desired: &Self::Spec) -> Result<ReconcileOutcome, ReconcileError>;

    /// Remove this resource from the host entirely.
    async fn destroy(&self, spec: &Self::Spec) -> Result<(), ReconcileError>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[derive(Serialize, Deserialize)]
    struct MockSpec {
        value: u32,
    }

    #[derive(Serialize, Deserialize)]
    struct MockState {
        actual: u32,
    }

    struct MockProvider {
        call_count: Arc<AtomicUsize>,
    }

    #[async_trait]
    impl Provider for MockProvider {
        type Spec = MockSpec;
        type State = MockState;

        async fn observe(&self) -> Result<MockState, ReconcileError> {
            Ok(MockState { actual: 0 })
        }

        async fn reconcile(&self, spec: &MockSpec) -> Result<ReconcileOutcome, ReconcileError> {
            let n = self.call_count.fetch_add(1, Ordering::SeqCst);
            if n == 0 {
                Ok(ReconcileOutcome::Applied)
            } else if spec.value == 0 {
                Ok(ReconcileOutcome::NoOp)
            } else {
                Ok(ReconcileOutcome::NoOp)
            }
        }

        async fn destroy(&self, _spec: &MockSpec) -> Result<(), ReconcileError> {
            Ok(())
        }
    }

    #[tokio::test]
    async fn reconcile_outcome_variants() {
        let p = MockProvider {
            call_count: Arc::new(AtomicUsize::new(0)),
        };
        let spec = MockSpec { value: 42 };

        let r1 = p.reconcile(&spec).await.unwrap();
        assert_eq!(r1, ReconcileOutcome::Applied);

        let r2 = p.reconcile(&spec).await.unwrap();
        assert_eq!(r2, ReconcileOutcome::NoOp);

        assert_ne!(ReconcileOutcome::Applied, ReconcileOutcome::Pending);
    }
}
