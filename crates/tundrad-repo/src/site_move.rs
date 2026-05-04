use crate::{PgPool, RepoError};
use tundrad_domain::site_move::{NewSiteMove, SiteMove, SiteMoveStatus};
use uuid::Uuid;

// ── Row ───────────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct SiteMoveRow {
    id: Uuid,
    site_id: Uuid,
    from_server_id: Uuid,
    to_server_id: Uuid,
    status: String,
    current_stage: Option<String>,
    error: Option<String>,
    initiated_by: Option<Uuid>,
    started_at: Option<time::OffsetDateTime>,
    finished_at: Option<time::OffsetDateTime>,
    created_at: time::OffsetDateTime,
}

impl From<SiteMoveRow> for SiteMove {
    fn from(row: SiteMoveRow) -> Self {
        let status = match row.status.as_str() {
            "pending" => SiteMoveStatus::Pending,
            "running" => SiteMoveStatus::Running,
            "succeeded" => SiteMoveStatus::Succeeded,
            "failed" => SiteMoveStatus::Failed,
            "abandoned" => SiteMoveStatus::Abandoned,
            _ => SiteMoveStatus::Pending,
        };
        SiteMove {
            id: row.id,
            site_id: row.site_id,
            from_server_id: row.from_server_id,
            to_server_id: row.to_server_id,
            status,
            current_stage: row.current_stage,
            error: row.error,
            initiated_by: row.initiated_by,
            started_at: row.started_at,
            finished_at: row.finished_at,
            created_at: row.created_at,
        }
    }
}

const SITE_MOVE_COLS: &str = "id, site_id, from_server_id, to_server_id, status, current_stage, \
    error, initiated_by, started_at, finished_at, created_at";

// ── Repo ──────────────────────────────────────────────────────────────────────

pub struct SiteMoveRepo<'a>(pub &'a PgPool);

impl<'a> SiteMoveRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self(pool)
    }

    pub async fn create(&self, new: NewSiteMove) -> Result<SiteMove, RepoError> {
        sqlx::query_as::<_, SiteMoveRow>(&format!(
            "INSERT INTO site_moves \
             (site_id, from_server_id, to_server_id, initiated_by) \
             VALUES ($1, $2, $3, $4) \
             RETURNING {SITE_MOVE_COLS}"
        ))
        .bind(new.site_id)
        .bind(new.from_server_id)
        .bind(new.to_server_id)
        .bind(new.initiated_by)
        .fetch_one(self.0)
        .await
        .map(SiteMove::from)
        .map_err(RepoError::from)
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<SiteMove, RepoError> {
        sqlx::query_as::<_, SiteMoveRow>(&format!(
            "SELECT {SITE_MOVE_COLS} FROM site_moves WHERE id = $1"
        ))
        .bind(id)
        .fetch_optional(self.0)
        .await?
        .ok_or(RepoError::NotFound)
        .map(SiteMove::from)
    }

    pub async fn list_for_site(&self, site_id: Uuid) -> Result<Vec<SiteMove>, RepoError> {
        sqlx::query_as::<_, SiteMoveRow>(&format!(
            "SELECT {SITE_MOVE_COLS} FROM site_moves \
             WHERE site_id = $1 ORDER BY created_at DESC"
        ))
        .bind(site_id)
        .fetch_all(self.0)
        .await
        .map(|rows| rows.into_iter().map(SiteMove::from).collect())
        .map_err(RepoError::from)
    }

    pub async fn set_stage(&self, id: Uuid, stage: &str) -> Result<(), RepoError> {
        let rows = sqlx::query(
            "UPDATE site_moves SET current_stage = $1, status = 'running' WHERE id = $2",
        )
        .bind(stage)
        .bind(id)
        .execute(self.0)
        .await?
        .rows_affected();
        if rows == 0 {
            return Err(RepoError::NotFound);
        }
        Ok(())
    }

    pub async fn set_status(
        &self,
        id: Uuid,
        status: SiteMoveStatus,
        error: Option<&str>,
    ) -> Result<(), RepoError> {
        let rows = sqlx::query(
            "UPDATE site_moves \
             SET status = $1, error = $2, finished_at = now() \
             WHERE id = $3",
        )
        .bind(status.as_str())
        .bind(error)
        .bind(id)
        .execute(self.0)
        .await?
        .rows_affected();
        if rows == 0 {
            return Err(RepoError::NotFound);
        }
        Ok(())
    }

    /// Atomically update sites.server_id and set site_moves.status = succeeded.
    pub async fn complete_move(
        &self,
        move_id: Uuid,
        site_id: Uuid,
        new_server_id: Uuid,
    ) -> Result<(), RepoError> {
        sqlx::query("UPDATE sites SET server_id = $1 WHERE id = $2")
            .bind(new_server_id)
            .bind(site_id)
            .execute(self.0)
            .await
            .map_err(RepoError::from)?;

        sqlx::query(
            "UPDATE site_moves \
             SET status = 'succeeded', finished_at = now() \
             WHERE id = $1",
        )
        .bind(move_id)
        .execute(self.0)
        .await
        .map_err(RepoError::from)?;

        Ok(())
    }
}
