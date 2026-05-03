use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tundra_agent_reconciler::{Provider, ReconcileError, ReconcileOutcome};

/// Performance-tuning profile for a MariaDB instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MariaDbPerfProfile {
    /// Suitable for hosts with ≤2 GB RAM.
    Small,
    /// Suitable for hosts with 4–8 GB RAM.
    Medium,
    /// Suitable for hosts with ≥16 GB RAM.
    Large,
    /// Fully custom InnoDB tuning knobs.
    Custom {
        innodb_buffer_pool_mb: u32,
        max_connections: u16,
    },
}

/// Desired configuration for a managed MariaDB instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MariaDbSpec {
    /// Logical name used to identify this instance (e.g. `"mariadb-main"`).
    pub instance_name: String,
    /// Major version string (e.g. `"11.4"`).
    pub version: String,
    /// TCP port mariadbd listens on (default 3306).
    pub port: u16,
    /// Name of the MariaDB superuser account.
    pub superuser: String,
    /// Filesystem path to the MariaDB data directory.
    pub data_dir: String,
    /// Performance profile applied to `my.cnf`.
    pub perf_profile: MariaDbPerfProfile,
}

/// Observed runtime state of a managed MariaDB instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MariaDbState {
    /// Whether the mariadbd process is currently running.
    pub is_running: bool,
    /// Server version string, if available.
    pub version: Option<String>,
    /// Whether the data directory has been initialised.
    pub data_dir_initialized: bool,
    /// Number of current client connections.
    pub connections: u32,
}

/// Provider for managed MariaDB 11.4 LTS instances.
pub struct MariaDbProvider;

#[async_trait]
impl Provider for MariaDbProvider {
    type Spec = MariaDbSpec;
    type State = MariaDbState;

    async fn observe(&self) -> Result<MariaDbState, ReconcileError> {
        // Production: check systemd unit, query information_schema.processlist, etc.
        Ok(MariaDbState {
            is_running: false,
            version: None,
            data_dir_initialized: false,
            connections: 0,
        })
    }

    async fn reconcile(&self, desired: &MariaDbSpec) -> Result<ReconcileOutcome, ReconcileError> {
        tracing::info!(
            instance = %desired.instance_name,
            version  = %desired.version,
            port     = desired.port,
            "mariadb reconcile (stub)"
        );
        // Production: mariadb-install-db, configure my.cnf, apply perf profile,
        // ensure systemd unit is active, set root password.
        Ok(ReconcileOutcome::Applied)
    }

    async fn destroy(&self, spec: &MariaDbSpec) -> Result<(), ReconcileError> {
        tracing::info!(instance = %spec.instance_name, "mariadb destroy (stub)");
        // Production: stop unit, drop data dir, remove system user.
        Ok(())
    }
}

impl MariaDbProvider {
    /// Dump a single database to a file via `mariadb-dump`.
    ///
    /// Production: runs `mariadb-dump --single-transaction <dbname> > <out_path>`.
    pub async fn dump_database(
        &self,
        instance: &MariaDbSpec,
        dbname: &str,
        out_path: &str,
    ) -> Result<(), ReconcileError> {
        tracing::info!(
            instance = %instance.instance_name,
            db  = dbname,
            out = out_path,
            "mariadb-dump (stub)"
        );
        Ok(())
    }

    /// Create a user and a database owned by that user.
    ///
    /// Production: runs `CREATE USER … IDENTIFIED BY …; CREATE DATABASE …; GRANT ALL … TO …`.
    pub async fn create_database(
        &self,
        _instance: &MariaDbSpec,
        dbname: &str,
        owner: &str,
        password: &str,
    ) -> Result<(), ReconcileError> {
        tracing::info!(db = dbname, owner, "create_database (stub)");
        let _ = password; // intentionally unused in stub; real impl passes via env
        Ok(())
    }

    /// Grant one or more privileges on a database to a user.
    ///
    /// Production: runs `GRANT <privileges> ON <dbname>.* TO '<username>'@'localhost'`.
    pub async fn grant_privileges(
        &self,
        _instance: &MariaDbSpec,
        dbname: &str,
        username: &str,
        privileges: &[String],
    ) -> Result<(), ReconcileError> {
        tracing::info!(
            db = dbname,
            user = username,
            ?privileges,
            "grant_privileges (stub)"
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn mariadb_reconcile_ok() {
        let spec = MariaDbSpec {
            instance_name: "mariadb-test".into(),
            version: "11.4".into(),
            port: 3306,
            superuser: "root".into(),
            data_dir: "/srv/dbs/mariadb/mariadb-test".into(),
            perf_profile: MariaDbPerfProfile::Small,
        };
        let outcome = MariaDbProvider.reconcile(&spec).await.unwrap();
        assert_eq!(outcome, ReconcileOutcome::Applied);
    }

    #[tokio::test]
    async fn mariadb_observe_ok() {
        let state = MariaDbProvider.observe().await.unwrap();
        assert!(!state.is_running);
        assert_eq!(state.connections, 0);
    }
}
