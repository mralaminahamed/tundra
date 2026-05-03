use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tundra_agent_reconciler::{Provider, ReconcileError, ReconcileOutcome};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PowerDnsSpec {
    pub zone: String,
    pub nameservers: Vec<String>,
    pub dnssec_enabled: bool,
    pub api_url: String,
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PowerDnsState {
    pub zone_exists: bool,
    pub serial: u32,
    pub dnssec_active: bool,
    pub record_count: u32,
}

pub struct PowerDnsProvider;

#[async_trait]
impl Provider for PowerDnsProvider {
    type Spec = PowerDnsSpec;
    type State = PowerDnsState;

    async fn observe(&self) -> Result<PowerDnsState, ReconcileError> {
        Ok(PowerDnsState { zone_exists: false, serial: 0, dnssec_active: false, record_count: 0 })
    }

    async fn reconcile(&self, desired: &PowerDnsSpec) -> Result<ReconcileOutcome, ReconcileError> {
        tracing::info!(zone = %desired.zone, dnssec = desired.dnssec_enabled, "powerdns reconcile (stub)");
        Ok(ReconcileOutcome::Applied)
    }

    async fn destroy(&self, spec: &PowerDnsSpec) -> Result<(), ReconcileError> {
        tracing::info!(zone = %spec.zone, "powerdns destroy (stub)");
        Ok(())
    }
}

impl PowerDnsProvider {
    pub async fn upsert_record(&self, spec: &PowerDnsSpec, name: &str, rtype: &str, ttl: u32, content: &str) -> Result<(), ReconcileError> {
        tracing::info!(zone = %spec.zone, name, rtype, ttl, content, "upsert_record (stub)");
        Ok(())
    }
    pub async fn delete_record(&self, spec: &PowerDnsSpec, name: &str, rtype: &str) -> Result<(), ReconcileError> {
        tracing::info!(zone = %spec.zone, name, rtype, "delete_record (stub)");
        Ok(())
    }
    pub async fn bump_serial(&self, spec: &PowerDnsSpec) -> Result<u32, ReconcileError> {
        tracing::info!(zone = %spec.zone, "bump_serial (stub)");
        Ok(1)
    }
    pub async fn enable_dnssec(&self, spec: &PowerDnsSpec) -> Result<(), ReconcileError> {
        tracing::info!(zone = %spec.zone, "enable_dnssec NSEC3 (stub)");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn reconcile_ok() {
        let spec = PowerDnsSpec { zone: "example.com.".into(), nameservers: vec![], dnssec_enabled: false, api_url: "http://127.0.0.1:8081".into(), api_key: "secret".into() };
        assert_eq!(PowerDnsProvider.reconcile(&spec).await.unwrap(), ReconcileOutcome::Applied);
    }
    #[tokio::test]
    async fn observe_ok() { assert!(!PowerDnsProvider.observe().await.unwrap().zone_exists); }
}
