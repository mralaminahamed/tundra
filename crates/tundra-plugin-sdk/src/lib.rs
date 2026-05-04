use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String, // "com.tundra.my-plugin"
    pub name: String,
    pub version: String, // semver
    pub description: String,
    pub author: String,
    pub license: String,
    pub tundra_min_version: String,
    pub capabilities: Vec<PluginCapability>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PluginCapability {
    Net {
        hosts: Vec<String>,
        max_rpm: u32,
        max_bytes_per_request: u64,
    },
    Secret {
        names: Vec<String>,
    },
    DbRead {
        tables: Vec<String>,
    },
    DbWrite {
        tables: Vec<String>,
    },
    EventsSubscribe {
        events: Vec<String>,
    },
    EventsPublish {
        events: Vec<String>,
    },
    BackgroundJobs {
        max_concurrent: u32,
    },
    HttpPublicRoute {
        paths: Vec<String>,
    },
}

#[derive(Debug, thiserror::Error)]
pub enum PluginError {
    #[error("capability denied: {capability}")]
    CapabilityDenied { capability: String },
    #[error("enable failed: {0}")]
    EnableFailed(String),
    #[error("missing secret: {0}")]
    MissingSecret(String),
    #[error("host error: {0}")]
    Host(#[from] HostError),
    #[error("{0}")]
    Other(String),
}

#[derive(Debug, thiserror::Error)]
pub enum HostError {
    #[error("capability not granted: {0}")]
    CapabilityNotGranted(String),
    #[error("secret not found: {0}")]
    SecretNotFound(String),
    #[error("storage error: {0}")]
    Storage(String),
    #[error("{0}")]
    Other(String),
}

pub struct SecretBytes(Vec<u8>);
impl SecretBytes {
    pub fn new(bytes: Vec<u8>) -> Self {
        Self(bytes)
    }
    pub fn as_bytes(&self) -> &[u8] {
        &self.0
    }
    pub fn as_str(&self) -> Result<&str, std::str::Utf8Error> {
        std::str::from_utf8(&self.0)
    }
}

pub struct JobSpec {
    pub name: String,
    pub payload: Vec<u8>,
    pub run_at: Option<std::time::SystemTime>,
    pub cron: Option<String>,
    pub timeout_secs: u32,
    pub max_retries: u8,
}

pub struct JobHandle {
    pub id: Uuid,
}
pub struct LockGuard {
    pub id: u64,
}

pub struct PluginEvent {
    pub kind: String,
    pub payload: serde_json::Value,
}

#[async_trait]
pub trait HostServices: Send + Sync {
    async fn get_secret(&self, name: &str) -> Result<SecretBytes, HostError>;
    fn log(&self, level: tracing::Level, message: &str, fields: &[(&str, &str)]);
    async fn emit(&self, event: PluginEvent) -> Result<(), HostError>;
    async fn enqueue_job(&self, spec: JobSpec) -> Result<JobHandle, HostError>;
    async fn acquire_lock(&self, resource: &str, ttl: Duration) -> Result<LockGuard, HostError>;
    fn release_lock(&self, lock_id: u64);
}

#[async_trait]
pub trait Plugin: Send + Sync + 'static {
    fn manifest(&self) -> PluginManifest;
    async fn enable(&self, host: &dyn HostServices) -> Result<(), PluginError>;
    async fn disable(&self, host: &dyn HostServices) -> Result<(), PluginError>;
    async fn shutdown(&self);
}
