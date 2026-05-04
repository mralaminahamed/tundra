use async_trait::async_trait;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tundra_plugin_sdk::{
    HostError, HostServices, JobHandle, JobSpec, LockGuard, PluginEvent, SecretBytes,
};

use crate::capability::GrantedCapabilities;

pub struct SandboxedHostServices {
    pub capabilities: Arc<RwLock<GrantedCapabilities>>,
}

impl SandboxedHostServices {
    pub fn new(capabilities: Arc<RwLock<GrantedCapabilities>>) -> Self {
        Self { capabilities }
    }
}

#[async_trait]
impl HostServices for SandboxedHostServices {
    async fn get_secret(&self, name: &str) -> Result<SecretBytes, HostError> {
        let caps = self.capabilities.read().await;
        caps.check_secret(name)?;
        // Stub: in production this reads from the secret store
        Err(HostError::SecretNotFound(name.into()))
    }

    fn log(&self, level: tracing::Level, message: &str, _fields: &[(&str, &str)]) {
        match level {
            tracing::Level::ERROR => tracing::error!("[plugin] {}", message),
            tracing::Level::WARN => tracing::warn!("[plugin] {}", message),
            tracing::Level::INFO => tracing::info!("[plugin] {}", message),
            tracing::Level::DEBUG => tracing::debug!("[plugin] {}", message),
            tracing::Level::TRACE => tracing::trace!("[plugin] {}", message),
        }
    }

    async fn emit(&self, _event: PluginEvent) -> Result<(), HostError> {
        // Stub: in production this publishes to Valkey event bus
        Ok(())
    }

    async fn enqueue_job(&self, _spec: JobSpec) -> Result<JobHandle, HostError> {
        Ok(JobHandle {
            id: uuid::Uuid::new_v4(),
        })
    }

    async fn acquire_lock(&self, _resource: &str, _ttl: Duration) -> Result<LockGuard, HostError> {
        Ok(LockGuard { id: 0 })
    }

    fn release_lock(&self, _lock_id: u64) {}
}
