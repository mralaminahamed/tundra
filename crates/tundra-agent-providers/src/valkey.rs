use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tundra_agent_reconciler::{Provider, ReconcileError, ReconcileOutcome};

/// Persistence mode for a Valkey instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ValkeyPersistence {
    /// No persistence — data is lost on restart (cache-only workloads).
    None,
    /// Append-only file persistence.
    Aof,
    /// RDB snapshotting.
    Rdb,
}

/// Desired configuration for a managed Valkey instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValkeySpec {
    /// Logical name used to identify this instance (e.g. `"valkey-cache"`).
    pub instance_name: String,
    /// Version string (e.g. `"8.0"`).
    pub version: String,
    /// TCP port Valkey listens on (default 6379).
    pub port: u16,
    /// Filesystem path to the Valkey data / working directory.
    pub data_dir: String,
    /// `maxmemory` limit in mebibytes (0 = unlimited).
    pub maxmemory_mb: u32,
    /// Persistence strategy written to `valkey.conf`.
    pub persistence: ValkeyPersistence,
}

/// Observed runtime state of a managed Valkey instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValkeyState {
    /// Whether the valkey-server process is currently running.
    pub is_running: bool,
    /// Bytes of memory currently used by the server (`used_memory` from INFO).
    pub used_memory_bytes: u64,
    /// Number of currently connected clients.
    pub connected_clients: u32,
}

/// Provider for managed Valkey (Redis-compatible) instances.
pub struct ValkeyProvider;

#[async_trait]
impl Provider for ValkeyProvider {
    type Spec = ValkeySpec;
    type State = ValkeyState;

    async fn observe(&self) -> Result<ValkeyState, ReconcileError> {
        // Production: send `INFO server` + `INFO clients` + `INFO memory`
        // over a loopback TCP connection and parse the response.
        Ok(ValkeyState {
            is_running: false,
            used_memory_bytes: 0,
            connected_clients: 0,
        })
    }

    async fn reconcile(&self, desired: &ValkeySpec) -> Result<ReconcileOutcome, ReconcileError> {
        tracing::info!(
            instance     = %desired.instance_name,
            version      = %desired.version,
            port         = desired.port,
            maxmemory_mb = desired.maxmemory_mb,
            "valkey reconcile (stub)"
        );
        // Production: write valkey.conf (maxmemory, persistence, bind address),
        // ensure systemd unit is active, reload config via CONFIG SET if already
        // running to avoid a restart where possible.
        Ok(ReconcileOutcome::Applied)
    }

    async fn destroy(&self, spec: &ValkeySpec) -> Result<(), ReconcileError> {
        tracing::info!(instance = %spec.instance_name, "valkey destroy (stub)");
        // Production: stop unit, drop data dir, remove system user.
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn valkey_reconcile_ok() {
        let spec = ValkeySpec {
            instance_name: "valkey-test".into(),
            version: "8.0".into(),
            port: 6379,
            data_dir: "/srv/dbs/valkey/valkey-test".into(),
            maxmemory_mb: 256,
            persistence: ValkeyPersistence::Rdb,
        };
        let outcome = ValkeyProvider.reconcile(&spec).await.unwrap();
        assert_eq!(outcome, ReconcileOutcome::Applied);
    }

    #[tokio::test]
    async fn valkey_observe_ok() {
        let state = ValkeyProvider.observe().await.unwrap();
        assert!(!state.is_running);
        assert_eq!(state.used_memory_bytes, 0);
        assert_eq!(state.connected_clients, 0);
    }
}
