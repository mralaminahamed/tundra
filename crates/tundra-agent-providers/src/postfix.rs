use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tundra_agent_reconciler::{Provider, ReconcileError, ReconcileOutcome};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostfixSpec {
    pub hostname: String,
    pub domain: String,
    pub relay_host: Option<String>,
    pub smtp_tls_cert_file: Option<String>,
    pub smtp_tls_key_file: Option<String>,
    pub pgsql_dsn: String,
    pub mynetworks: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostfixState {
    pub is_running: bool,
    pub queue_depth: u32,
    pub version: Option<String>,
}

pub struct PostfixProvider;

#[async_trait]
impl Provider for PostfixProvider {
    type Spec = PostfixSpec;
    type State = PostfixState;
    async fn observe(&self) -> Result<PostfixState, ReconcileError> {
        Ok(PostfixState {
            is_running: false,
            queue_depth: 0,
            version: None,
        })
    }
    async fn reconcile(&self, desired: &PostfixSpec) -> Result<ReconcileOutcome, ReconcileError> {
        tracing::info!(hostname = %desired.hostname, domain = %desired.domain, "postfix reconcile (stub)");
        Ok(ReconcileOutcome::Applied)
    }
    async fn destroy(&self, spec: &PostfixSpec) -> Result<(), ReconcileError> {
        tracing::info!(hostname = %spec.hostname, "postfix destroy (stub)");
        Ok(())
    }
}

impl PostfixProvider {
    pub async fn hold_message(&self, queue_id: &str) -> Result<(), ReconcileError> {
        tracing::info!(queue_id, "postsuper hold (stub)");
        Ok(())
    }
    pub async fn release_message(&self, queue_id: &str) -> Result<(), ReconcileError> {
        tracing::info!(queue_id, "postsuper release (stub)");
        Ok(())
    }
    pub async fn delete_message(&self, queue_id: &str) -> Result<(), ReconcileError> {
        tracing::info!(queue_id, "postsuper delete (stub)");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn reconcile_ok() {
        let spec = PostfixSpec {
            hostname: "mail.example.com".into(),
            domain: "example.com".into(),
            relay_host: None,
            smtp_tls_cert_file: None,
            smtp_tls_key_file: None,
            pgsql_dsn: "host=127.0.0.1 dbname=tundra".into(),
            mynetworks: vec![],
        };
        assert_eq!(
            PostfixProvider.reconcile(&spec).await.unwrap(),
            ReconcileOutcome::Applied
        );
    }
}
