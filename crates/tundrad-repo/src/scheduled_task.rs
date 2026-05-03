use crate::{PgPool, RepoError};
use tundrad_domain::scheduled_task::{NewScheduledTask, ScheduledTask};
use uuid::Uuid;

// ── ScheduledTask ─────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct ScheduledTaskRow {
    id: Uuid,
    site_id: Uuid,
    name: String,
    schedule: String,
    command: String,
    working_dir: String,
    is_active: bool,
    last_run_at: Option<time::OffsetDateTime>,
    created_at: time::OffsetDateTime,
    updated_at: time::OffsetDateTime,
}

impl From<ScheduledTaskRow> for ScheduledTask {
    fn from(r: ScheduledTaskRow) -> Self {
        ScheduledTask {
            id: r.id,
            site_id: r.site_id,
            name: r.name,
            schedule: r.schedule,
            command: r.command,
            working_dir: r.working_dir,
            is_active: r.is_active,
            last_run_at: r.last_run_at,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

const SCHEDULED_TASK_COLS: &str = "id, site_id, name, schedule, command, working_dir, is_active, last_run_at, \
     created_at, updated_at";

pub struct ScheduledTaskRepo<'a>(pub &'a PgPool);

impl<'a> ScheduledTaskRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self(pool)
    }

    pub async fn list(&self, site_id: Uuid) -> Result<Vec<ScheduledTask>, RepoError> {
        sqlx::query_as::<_, ScheduledTaskRow>(&format!(
            "SELECT {SCHEDULED_TASK_COLS} FROM scheduled_tasks \
             WHERE site_id = $1 ORDER BY created_at DESC"
        ))
        .bind(site_id)
        .fetch_all(self.0)
        .await
        .map(|rows| rows.into_iter().map(ScheduledTask::from).collect())
        .map_err(RepoError::from)
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<ScheduledTask, RepoError> {
        sqlx::query_as::<_, ScheduledTaskRow>(&format!(
            "SELECT {SCHEDULED_TASK_COLS} FROM scheduled_tasks WHERE id = $1"
        ))
        .bind(id)
        .fetch_optional(self.0)
        .await?
        .ok_or(RepoError::NotFound)
        .map(ScheduledTask::from)
    }

    pub async fn create(&self, new: NewScheduledTask) -> Result<ScheduledTask, RepoError> {
        let working_dir = new
            .working_dir
            .unwrap_or_else(|| "/srv/sites/current".to_owned());
        sqlx::query_as::<_, ScheduledTaskRow>(&format!(
            "INSERT INTO scheduled_tasks (site_id, name, schedule, command, working_dir) \
             VALUES ($1, $2, $3, $4, $5) RETURNING {SCHEDULED_TASK_COLS}"
        ))
        .bind(new.site_id)
        .bind(&new.name)
        .bind(&new.schedule)
        .bind(&new.command)
        .bind(&working_dir)
        .fetch_one(self.0)
        .await
        .map(ScheduledTask::from)
        .map_err(RepoError::from)
    }

    pub async fn delete(&self, id: Uuid) -> Result<(), RepoError> {
        let rows = sqlx::query("UPDATE scheduled_tasks SET is_active = false WHERE id = $1")
            .bind(id)
            .execute(self.0)
            .await?
            .rows_affected();
        if rows == 0 {
            return Err(RepoError::NotFound);
        }
        Ok(())
    }

    pub async fn mark_run(&self, id: Uuid) -> Result<(), RepoError> {
        let rows = sqlx::query("UPDATE scheduled_tasks SET last_run_at = now() WHERE id = $1")
            .bind(id)
            .execute(self.0)
            .await?
            .rows_affected();
        if rows == 0 {
            return Err(RepoError::NotFound);
        }
        Ok(())
    }
}
