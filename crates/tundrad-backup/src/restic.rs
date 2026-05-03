use serde::{Deserialize, Serialize};

use crate::target::BackupTarget;

/// A snapshot as reported by `restic snapshots --json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResticSnapshot {
    pub id: String,
    pub time: String,
    pub paths: Vec<String>,
    pub hostname: String,
    pub tags: Option<Vec<String>>,
}

/// Summary stats from `restic backup --json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResticStats {
    pub files_new: u64,
    pub files_changed: u64,
    pub data_added: u64, // bytes added to repo
    pub total_files_processed: u64,
    pub total_bytes_processed: u64,
    pub snapshot_id: String,
}

/// Thin wrapper around the restic CLI binary.
pub struct ResticClient {
    pub target: BackupTarget,
}

impl ResticClient {
    pub fn new(target: BackupTarget) -> Self {
        Self { target }
    }

    /// Initialize the restic repository if not already initialized.
    /// Runs: `restic init`
    pub async fn init_repo(&self) -> anyhow::Result<()> {
        let repo = self.target.restic_repo_url()?;
        tracing::info!(%repo, "restic init (stub)");
        // Production: tokio::process::Command::new("restic")
        //   .args(["init", "--repo", &repo])
        //   .env("RESTIC_PASSWORD", &self.target.repo_password)
        //   .output().await?
        Ok(())
    }

    /// Run a backup of the given paths.
    pub async fn backup(&self, paths: &[&str], tags: &[&str]) -> anyhow::Result<ResticStats> {
        let repo = self.target.restic_repo_url()?;
        tracing::info!(%repo, ?paths, ?tags, "restic backup (stub)");
        Ok(ResticStats {
            files_new: 0,
            files_changed: 0,
            data_added: 0,
            total_files_processed: 0,
            total_bytes_processed: 0,
            snapshot_id: format!("stub-{}", uuid::Uuid::new_v4()),
        })
    }

    /// Apply the retention policy and prune unused data.
    /// Runs: `restic forget --prune` with retention flags.
    pub async fn forget_and_prune(
        &self,
        policy: &crate::retention::RetentionPolicy,
    ) -> anyhow::Result<()> {
        let repo = self.target.restic_repo_url()?;
        tracing::info!(%repo, ?policy, "restic forget --prune (stub)");
        Ok(())
    }

    /// List snapshots.
    pub async fn list_snapshots(&self) -> anyhow::Result<Vec<ResticSnapshot>> {
        tracing::info!("restic snapshots (stub)");
        Ok(vec![])
    }

    /// Restore a snapshot to the given path.
    pub async fn restore(&self, snapshot_id: &str, target_path: &str) -> anyhow::Result<()> {
        tracing::info!(
            snapshot = snapshot_id,
            target = target_path,
            "restic restore (stub)"
        );
        Ok(())
    }

    /// Verify a sample of snapshot data.
    pub async fn check(&self) -> anyhow::Result<()> {
        tracing::info!("restic check (stub)");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::target::{BackupTarget, BackupTargetKind};

    fn local_target() -> BackupTarget {
        BackupTarget {
            id: uuid::Uuid::new_v4(),
            name: "test-local".into(),
            kind: BackupTargetKind::Local,
            config: serde_json::json!({ "path": "/tmp/restic-test" }),
            repo_password: "test-password".into(),
            is_default: false,
        }
    }

    #[tokio::test]
    async fn init_repo_stub_ok() {
        let client = ResticClient::new(local_target());
        client.init_repo().await.unwrap();
    }

    #[tokio::test]
    async fn backup_stub_ok() {
        let client = ResticClient::new(local_target());
        let stats = client
            .backup(&["/tmp/test"], &["scope:site"])
            .await
            .unwrap();
        assert!(stats.snapshot_id.starts_with("stub-"));
    }

    #[test]
    fn local_repo_url() {
        let t = local_target();
        assert_eq!(t.restic_repo_url().unwrap(), "/tmp/restic-test");
    }
}
