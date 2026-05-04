use crate::{PgPool, RepoError};
use tundrad_crypto::EncryptedBackupRepoPassword;
use tundrad_domain::backup::{
    BackupJob, BackupRestore, BackupSnapshot, BackupTarget, NewBackupJob, NewBackupTarget,
};
use uuid::Uuid;

// ── BackupTarget ──────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct BackupTargetRow {
    id: Uuid,
    name: String,
    kind: String,
    config: serde_json::Value,
    is_default: bool,
    created_at: time::OffsetDateTime,
    updated_at: time::OffsetDateTime,
}

impl TryFrom<BackupTargetRow> for BackupTarget {
    type Error = RepoError;
    fn try_from(r: BackupTargetRow) -> Result<Self, Self::Error> {
        Ok(BackupTarget {
            id: r.id,
            name: r.name,
            kind: r.kind.parse().map_err(RepoError::Conflict)?,
            config: r.config,
            is_default: r.is_default,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
    }
}

const TARGET_COLS: &str = "id, name, kind, config, is_default, created_at, updated_at";

pub struct BackupTargetRepo<'a>(pub &'a PgPool);

impl<'a> BackupTargetRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self(pool)
    }

    pub async fn list(&self) -> Result<Vec<BackupTarget>, RepoError> {
        sqlx::query_as::<_, BackupTargetRow>(&format!(
            "SELECT {TARGET_COLS} FROM backup_targets ORDER BY created_at DESC"
        ))
        .fetch_all(self.0)
        .await?
        .into_iter()
        .map(TryFrom::try_from)
        .collect()
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<BackupTarget, RepoError> {
        sqlx::query_as::<_, BackupTargetRow>(&format!(
            "SELECT {TARGET_COLS} FROM backup_targets WHERE id = $1"
        ))
        .bind(id)
        .fetch_optional(self.0)
        .await?
        .ok_or_else(|| RepoError::NotFound)?
        .try_into()
    }

    pub async fn create(&self, new: NewBackupTarget) -> Result<BackupTarget, RepoError> {
        let enc_pw = EncryptedBackupRepoPassword::new(new.repo_password);
        sqlx::query_as::<_, BackupTargetRow>(&format!(
            "INSERT INTO backup_targets (name, kind, config, repo_password_encrypted, is_default) \
             VALUES ($1, $2, $3, $4, $5) RETURNING {TARGET_COLS}"
        ))
        .bind(&new.name)
        .bind(new.kind.as_str())
        .bind(&new.config)
        .bind(enc_pw)
        .bind(new.is_default)
        .fetch_one(self.0)
        .await?
        .try_into()
    }

    pub async fn delete(&self, id: Uuid) -> Result<(), RepoError> {
        let rows = sqlx::query("DELETE FROM backup_targets WHERE id = $1")
            .bind(id)
            .execute(self.0)
            .await?
            .rows_affected();
        if rows == 0 {
            return Err(RepoError::NotFound);
        }
        Ok(())
    }

    /// Decrypt and return the repo password for a target (for use by ResticClient).
    pub async fn get_repo_password(&self, id: Uuid) -> Result<String, RepoError> {
        #[derive(sqlx::FromRow)]
        struct PwRow {
            repo_password_encrypted: EncryptedBackupRepoPassword,
        }
        let row = sqlx::query_as::<_, PwRow>(
            "SELECT repo_password_encrypted FROM backup_targets WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(self.0)
        .await?
        .ok_or_else(|| RepoError::NotFound)?;
        Ok(row.repo_password_encrypted.into_inner())
    }
}

// ── BackupJob ─────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct BackupJobRow {
    id: Uuid,
    name: String,
    scope_kind: String,
    scope_id: Option<Uuid>,
    target_id: Uuid,
    schedule_cron: Option<String>,
    retention_policy: serde_json::Value,
    is_active: bool,
    last_run_at: Option<time::OffsetDateTime>,
    last_status: Option<String>,
    next_run_at: Option<time::OffsetDateTime>,
    created_at: time::OffsetDateTime,
    updated_at: time::OffsetDateTime,
}

impl From<BackupJobRow> for BackupJob {
    fn from(r: BackupJobRow) -> Self {
        BackupJob {
            id: r.id,
            name: r.name,
            scope_kind: r.scope_kind,
            scope_id: r.scope_id,
            target_id: r.target_id,
            schedule_cron: r.schedule_cron,
            retention_policy: r.retention_policy,
            is_active: r.is_active,
            last_run_at: r.last_run_at,
            last_status: r.last_status,
            next_run_at: r.next_run_at,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

const JOB_COLS: &str = "id, name, scope_kind, scope_id, target_id, schedule_cron, \
    retention_policy, is_active, last_run_at, last_status, next_run_at, created_at, updated_at";

pub struct BackupJobRepo<'a>(pub &'a PgPool);

impl<'a> BackupJobRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self(pool)
    }

    pub async fn list(&self) -> Result<Vec<BackupJob>, RepoError> {
        sqlx::query_as::<_, BackupJobRow>(&format!(
            "SELECT {JOB_COLS} FROM backup_jobs ORDER BY created_at DESC"
        ))
        .fetch_all(self.0)
        .await
        .map(|rows| rows.into_iter().map(BackupJob::from).collect())
        .map_err(RepoError::from)
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<BackupJob, RepoError> {
        sqlx::query_as::<_, BackupJobRow>(&format!(
            "SELECT {JOB_COLS} FROM backup_jobs WHERE id = $1"
        ))
        .bind(id)
        .fetch_optional(self.0)
        .await?
        .ok_or_else(|| RepoError::NotFound)
        .map(BackupJob::from)
    }

    pub async fn create(&self, new: NewBackupJob) -> Result<BackupJob, RepoError> {
        let retention = serde_json::to_value(&new.retention_policy)
            .unwrap_or(serde_json::Value::Object(Default::default()));
        sqlx::query_as::<_, BackupJobRow>(&format!(
            "INSERT INTO backup_jobs (name, scope_kind, scope_id, target_id, schedule_cron, retention_policy) \
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING {JOB_COLS}"
        ))
        .bind(&new.name)
        .bind(&new.scope_kind)
        .bind(new.scope_id)
        .bind(new.target_id)
        .bind(new.schedule_cron.as_deref())
        .bind(retention)
        .fetch_one(self.0)
        .await
        .map(BackupJob::from)
        .map_err(RepoError::from)
    }

    pub async fn delete(&self, id: Uuid) -> Result<(), RepoError> {
        let rows = sqlx::query("DELETE FROM backup_jobs WHERE id = $1")
            .bind(id)
            .execute(self.0)
            .await?
            .rows_affected();
        if rows == 0 {
            return Err(RepoError::NotFound);
        }
        Ok(())
    }

    pub async fn record_run(
        &self,
        id: Uuid,
        status: &str,
        next_run_at: Option<time::OffsetDateTime>,
    ) -> Result<(), RepoError> {
        sqlx::query(
            "UPDATE backup_jobs SET last_run_at = now(), last_status = $1, next_run_at = $2 \
             WHERE id = $3",
        )
        .bind(status)
        .bind(next_run_at)
        .bind(id)
        .execute(self.0)
        .await?;
        Ok(())
    }
}

// ── BackupSnapshot ────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct BackupSnapshotRow {
    id: Uuid,
    job_id: Uuid,
    snapshot_id: String,
    size_bytes: i64,
    files_new: Option<i64>,
    files_changed: Option<i64>,
    duration_ms: i32,
    status: String,
    error: Option<String>,
    created_at: time::OffsetDateTime,
}

impl From<BackupSnapshotRow> for BackupSnapshot {
    fn from(r: BackupSnapshotRow) -> Self {
        BackupSnapshot {
            id: r.id,
            job_id: r.job_id,
            snapshot_id: r.snapshot_id,
            size_bytes: r.size_bytes,
            files_new: r.files_new,
            files_changed: r.files_changed,
            duration_ms: r.duration_ms,
            status: r.status,
            error: r.error,
            created_at: r.created_at,
        }
    }
}

const SNAP_COLS: &str = "id, job_id, snapshot_id, size_bytes, files_new, files_changed, \
    duration_ms, status, error, created_at";

pub struct BackupSnapshotRepo<'a>(pub &'a PgPool);

impl<'a> BackupSnapshotRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self(pool)
    }

    pub async fn list(&self, job_id: Option<Uuid>) -> Result<Vec<BackupSnapshot>, RepoError> {
        let rows: Vec<BackupSnapshotRow> = if let Some(jid) = job_id {
            sqlx::query_as::<_, BackupSnapshotRow>(&format!(
                "SELECT {SNAP_COLS} FROM backup_snapshots WHERE job_id = $1 ORDER BY created_at DESC LIMIT 100"
            ))
            .bind(jid)
            .fetch_all(self.0)
            .await?
        } else {
            sqlx::query_as::<_, BackupSnapshotRow>(&format!(
                "SELECT {SNAP_COLS} FROM backup_snapshots ORDER BY created_at DESC LIMIT 100"
            ))
            .fetch_all(self.0)
            .await?
        };
        Ok(rows.into_iter().map(BackupSnapshot::from).collect())
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<BackupSnapshot, RepoError> {
        sqlx::query_as::<_, BackupSnapshotRow>(&format!(
            "SELECT {SNAP_COLS} FROM backup_snapshots WHERE id = $1"
        ))
        .bind(id)
        .fetch_optional(self.0)
        .await?
        .ok_or_else(|| RepoError::NotFound)
        .map(BackupSnapshot::from)
    }

    pub async fn create(
        &self,
        job_id: Uuid,
        snapshot_id: &str,
        size_bytes: i64,
        files_new: Option<i64>,
        files_changed: Option<i64>,
        duration_ms: i32,
        status: &str,
        error: Option<&str>,
    ) -> Result<BackupSnapshot, RepoError> {
        sqlx::query_as::<_, BackupSnapshotRow>(&format!(
            "INSERT INTO backup_snapshots \
             (job_id, snapshot_id, size_bytes, files_new, files_changed, duration_ms, status, error) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING {SNAP_COLS}"
        ))
        .bind(job_id)
        .bind(snapshot_id)
        .bind(size_bytes)
        .bind(files_new)
        .bind(files_changed)
        .bind(duration_ms)
        .bind(status)
        .bind(error)
        .fetch_one(self.0)
        .await
        .map(BackupSnapshot::from)
        .map_err(RepoError::from)
    }
}

// ── BackupRestore ─────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct BackupRestoreRow {
    id: Uuid,
    snapshot_id: Uuid,
    operator_id: Uuid,
    target_path: Option<String>,
    status: String,
    preview: Option<serde_json::Value>,
    started_at: Option<time::OffsetDateTime>,
    completed_at: Option<time::OffsetDateTime>,
    error: Option<String>,
    created_at: time::OffsetDateTime,
}

impl From<BackupRestoreRow> for BackupRestore {
    fn from(r: BackupRestoreRow) -> Self {
        BackupRestore {
            id: r.id,
            snapshot_id: r.snapshot_id,
            operator_id: r.operator_id,
            target_path: r.target_path,
            status: r.status,
            preview: r.preview,
            started_at: r.started_at,
            completed_at: r.completed_at,
            error: r.error,
            created_at: r.created_at,
        }
    }
}

const RESTORE_COLS: &str = "id, snapshot_id, operator_id, target_path, status, preview, \
    started_at, completed_at, error, created_at";

pub struct BackupRestoreRepo<'a>(pub &'a PgPool);

impl<'a> BackupRestoreRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self(pool)
    }

    pub async fn create(
        &self,
        snapshot_id: Uuid,
        operator_id: Uuid,
        target_path: Option<&str>,
        preview: serde_json::Value,
    ) -> Result<BackupRestore, RepoError> {
        sqlx::query_as::<_, BackupRestoreRow>(&format!(
            "INSERT INTO backup_restores (snapshot_id, operator_id, target_path, status, preview) \
             VALUES ($1, $2, $3, 'pending', $4) RETURNING {RESTORE_COLS}"
        ))
        .bind(snapshot_id)
        .bind(operator_id)
        .bind(target_path)
        .bind(preview)
        .fetch_one(self.0)
        .await
        .map(BackupRestore::from)
        .map_err(RepoError::from)
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<BackupRestore, RepoError> {
        sqlx::query_as::<_, BackupRestoreRow>(&format!(
            "SELECT {RESTORE_COLS} FROM backup_restores WHERE id = $1"
        ))
        .bind(id)
        .fetch_optional(self.0)
        .await?
        .ok_or_else(|| RepoError::NotFound)
        .map(BackupRestore::from)
    }

    pub async fn update_status(&self, id: Uuid, status: &str) -> Result<(), RepoError> {
        sqlx::query("UPDATE backup_restores SET status = $1 WHERE id = $2")
            .bind(status)
            .bind(id)
            .execute(self.0)
            .await?;
        Ok(())
    }

    pub async fn cancel(&self, id: Uuid, operator_id: Uuid) -> Result<(), RepoError> {
        let rows = sqlx::query(
            "UPDATE backup_restores SET status = 'cancelled' \
             WHERE id = $1 AND operator_id = $2 AND status = 'pending'",
        )
        .bind(id)
        .bind(operator_id)
        .execute(self.0)
        .await?
        .rows_affected();
        if rows == 0 {
            return Err(RepoError::NotFound);
        }
        Ok(())
    }
}
