use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tundra_agent_reconciler::{Provider, ReconcileError, ReconcileOutcome};

/// Performance-tuning profile for a PostgreSQL instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PgPerfProfile {
    /// Suitable for hosts with ≤2 GB RAM.
    Small,
    /// Suitable for hosts with 4–8 GB RAM.
    Medium,
    /// Suitable for hosts with ≥16 GB RAM.
    Large,
    /// Fully custom tuning knobs.
    Custom {
        shared_buffers_mb: u32,
        max_connections: u16,
    },
}

/// Desired configuration for a managed PostgreSQL instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostgresSpec {
    /// Logical name used to identify this instance (e.g. `"pg-main"`).
    pub instance_name: String,
    /// Major version string (e.g. `"18"`).
    pub version: String,
    /// TCP port the postmaster listens on (default 5432).
    pub port: u16,
    /// Name of the PostgreSQL superuser account.
    pub superuser: String,
    /// Filesystem path to the PGDATA directory.
    pub data_dir: String,
    /// Performance profile applied to `postgresql.conf`.
    pub perf_profile: PgPerfProfile,
    /// Whether WAL archiving should be enabled.
    pub wal_archiving: bool,
}

/// Observed runtime state of a managed PostgreSQL instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostgresState {
    /// Whether the postmaster process is currently running.
    pub is_running: bool,
    /// Server version string reported by `pg_ctl status`, if available.
    pub version: Option<String>,
    /// Whether `initdb` has been run on `data_dir`.
    pub data_dir_initialized: bool,
    /// Number of current client connections (from `pg_stat_activity`).
    pub connections: u32,
}

/// Provider for managed PostgreSQL instances.
pub struct PostgresProvider;

#[async_trait]
impl Provider for PostgresProvider {
    type Spec = PostgresSpec;
    type State = PostgresState;

    async fn observe(&self) -> Result<PostgresState, ReconcileError> {
        // Production: shell out to `pg_ctl status`, query pg_stat_activity, etc.
        Ok(PostgresState {
            is_running: false,
            version: None,
            data_dir_initialized: false,
            connections: 0,
        })
    }

    async fn reconcile(&self, desired: &PostgresSpec) -> Result<ReconcileOutcome, ReconcileError> {
        tracing::info!(
            instance = %desired.instance_name,
            version  = %desired.version,
            port     = desired.port,
            "postgres reconcile (stub)"
        );
        // Production: initdb, configure postgresql.conf, apply perf profile,
        // enable WAL archiving if requested, ensure systemd unit is active.
        Ok(ReconcileOutcome::Applied)
    }

    async fn destroy(&self, spec: &PostgresSpec) -> Result<(), ReconcileError> {
        tracing::info!(instance = %spec.instance_name, "postgres destroy (stub)");
        // Production: stop unit, drop data dir, remove system user.
        Ok(())
    }
}

impl PostgresProvider {
    /// Dump a single database to a custom-format file via `pg_dump`.
    ///
    /// Production: runs `pg_dump --format=custom --file=<out_path> <dbname>`.
    pub async fn dump_database(
        &self,
        instance: &PostgresSpec,
        dbname: &str,
        out_path: &str,
    ) -> Result<(), ReconcileError> {
        tracing::info!(
            instance = %instance.instance_name,
            db  = dbname,
            out = out_path,
            "pg_dump (stub)"
        );
        Ok(())
    }

    /// Create a role and a database owned by that role.
    ///
    /// Production: runs `CREATE ROLE … WITH LOGIN PASSWORD …; CREATE DATABASE … OWNER …`.
    pub async fn create_database(
        &self,
        _instance: &PostgresSpec,
        dbname: &str,
        owner: &str,
        password: &str,
    ) -> Result<(), ReconcileError> {
        tracing::info!(db = dbname, owner, "create_database (stub)");
        let _ = password; // intentionally unused in stub; real impl passes via env
        Ok(())
    }

    /// Grant one or more SQL privileges on a database to a user.
    ///
    /// Production: runs `GRANT <privileges> ON DATABASE <dbname> TO <username>`.
    pub async fn grant_privileges(
        &self,
        _instance: &PostgresSpec,
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
    async fn postgres_reconcile_ok() {
        let spec = PostgresSpec {
            instance_name: "pg-test".into(),
            version: "18".into(),
            port: 5432,
            superuser: "postgres".into(),
            data_dir: "/srv/dbs/postgresql/pg-test".into(),
            perf_profile: PgPerfProfile::Small,
            wal_archiving: false,
        };
        let outcome = PostgresProvider.reconcile(&spec).await.unwrap();
        assert_eq!(outcome, ReconcileOutcome::Applied);
    }

    #[tokio::test]
    async fn postgres_observe_ok() {
        let state = PostgresProvider.observe().await.unwrap();
        assert!(!state.is_running);
        assert_eq!(state.connections, 0);
    }
}
