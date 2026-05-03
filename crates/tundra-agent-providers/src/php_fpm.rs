use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tundra_agent_reconciler::{Provider, ReconcileError, ReconcileOutcome};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhpFpmSpec {
    pub site_id: String,
    pub user: String,
    pub group: String,
    pub listen_socket: String,
    pub pm_max_children: u32,
    pub php_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhpFpmState {
    pub pool_name: String,
    pub is_running: bool,
}

pub struct PhpFpmProvider;

#[async_trait]
impl Provider for PhpFpmProvider {
    type Spec = PhpFpmSpec;
    type State = PhpFpmState;

    async fn observe(&self) -> Result<PhpFpmState, ReconcileError> {
        Ok(PhpFpmState {
            pool_name: String::new(),
            is_running: false,
        })
    }

    async fn reconcile(&self, desired: &PhpFpmSpec) -> Result<ReconcileOutcome, ReconcileError> {
        tracing::info!(site = %desired.site_id, php = %desired.php_version, "php-fpm reconcile (stub)");
        Ok(ReconcileOutcome::Applied)
    }

    async fn destroy(&self, spec: &PhpFpmSpec) -> Result<(), ReconcileError> {
        tracing::info!(site = %spec.site_id, "php-fpm destroy (stub)");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn reconcile_no_error() {
        let spec = PhpFpmSpec {
            site_id: "s1".into(),
            user: "site_s1".into(),
            group: "www-data".into(),
            listen_socket: "/run/php/s1.sock".into(),
            pm_max_children: 5,
            php_version: "8.4".into(),
        };
        let outcome = PhpFpmProvider.reconcile(&spec).await.unwrap();
        assert_eq!(outcome, ReconcileOutcome::Applied);
    }
}
