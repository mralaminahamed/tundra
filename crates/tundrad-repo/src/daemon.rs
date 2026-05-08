use crate::{PgPool, RepoError};
use tundrad_domain::daemon::{Daemon, NewDaemon};
use uuid::Uuid;

// ── UpdateDaemon ──────────────────────────────────────────────────────────────

#[derive(Default)]
pub struct UpdateDaemon {
    pub name: Option<String>,
    pub command: Option<String>,
    pub working_dir: Option<String>,
    pub is_active: Option<bool>,
}

// ── DaemonRow ─────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct DaemonRow {
    id: Uuid,
    site_id: Uuid,
    name: String,
    command: String,
    working_dir: String,
    env_file: String,
    is_active: bool,
    created_at: time::OffsetDateTime,
    updated_at: time::OffsetDateTime,
}

impl From<DaemonRow> for Daemon {
    fn from(r: DaemonRow) -> Self {
        Daemon {
            id: r.id,
            site_id: r.site_id,
            name: r.name,
            command: r.command,
            working_dir: r.working_dir,
            env_file: r.env_file,
            is_active: r.is_active,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

const DAEMON_COLS: &str =
    "id, site_id, name, command, working_dir, env_file, is_active, created_at, updated_at";

// ── DaemonRepo ────────────────────────────────────────────────────────────────

pub struct DaemonRepo<'a>(pub &'a PgPool);

impl<'a> DaemonRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self(pool)
    }

    pub async fn list(&self, site_id: Uuid) -> Result<Vec<Daemon>, RepoError> {
        sqlx::query_as::<_, DaemonRow>(&format!(
            "SELECT {DAEMON_COLS} FROM daemons \
             WHERE site_id = $1 AND is_active = true \
             ORDER BY created_at DESC"
        ))
        .bind(site_id)
        .fetch_all(self.0)
        .await
        .map(|rows| rows.into_iter().map(Daemon::from).collect())
        .map_err(RepoError::from)
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<Daemon, RepoError> {
        sqlx::query_as::<_, DaemonRow>(&format!("SELECT {DAEMON_COLS} FROM daemons WHERE id = $1"))
            .bind(id)
            .fetch_optional(self.0)
            .await?
            .ok_or(RepoError::NotFound)
            .map(Daemon::from)
    }

    pub async fn create(&self, new: NewDaemon) -> Result<Daemon, RepoError> {
        let working_dir = new
            .working_dir
            .unwrap_or_else(|| "/srv/sites/%(public_id)s/current".to_owned());
        let env_file = new
            .env_file
            .unwrap_or_else(|| "/srv/sites/%(public_id)s/shared/.env".to_owned());
        sqlx::query_as::<_, DaemonRow>(&format!(
            "INSERT INTO daemons (site_id, name, command, working_dir, env_file) \
             VALUES ($1, $2, $3, $4, $5) RETURNING {DAEMON_COLS}"
        ))
        .bind(new.site_id)
        .bind(&new.name)
        .bind(&new.command)
        .bind(&working_dir)
        .bind(&env_file)
        .fetch_one(self.0)
        .await
        .map(Daemon::from)
        .map_err(RepoError::from)
    }

    /// Soft-delete: set is_active = false
    pub async fn delete(&self, id: Uuid) -> Result<(), RepoError> {
        let rows = sqlx::query("UPDATE daemons SET is_active = false WHERE id = $1")
            .bind(id)
            .execute(self.0)
            .await?
            .rows_affected();
        if rows == 0 {
            return Err(RepoError::NotFound);
        }
        Ok(())
    }

    /// Partial update — only fields present in `upd` are written.
    pub async fn update(&self, id: Uuid, upd: UpdateDaemon) -> Result<Daemon, RepoError> {
        // Verify record exists first so we can return NotFound cleanly.
        let current = self.find_by_id(id).await?;
        let name = upd.name.unwrap_or(current.name);
        let command = upd.command.unwrap_or(current.command);
        let working_dir = upd.working_dir.unwrap_or(current.working_dir);
        let is_active = upd.is_active.unwrap_or(current.is_active);
        sqlx::query_as::<_, DaemonRow>(&format!(
            "UPDATE daemons \
             SET name = $2, command = $3, working_dir = $4, is_active = $5, updated_at = now() \
             WHERE id = $1 RETURNING {DAEMON_COLS}"
        ))
        .bind(id)
        .bind(&name)
        .bind(&command)
        .bind(&working_dir)
        .bind(is_active)
        .fetch_one(self.0)
        .await
        .map(Daemon::from)
        .map_err(RepoError::from)
    }
}
