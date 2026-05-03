use crate::{PgPool, RepoError};
use tundrad_domain::site::{Application, Deployment, DeploymentStatus, Site, SiteStatus};
use uuid::Uuid;

// ── Site ──────────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct SiteRow {
    id: Uuid,
    name: String,
    primary_domain: String,
    server_id: Uuid,
    application_id: Option<Uuid>,
    status: String,
    document_root: String,
    base_path: String,
    notes: Option<String>,
    created_at: time::OffsetDateTime,
    updated_at: time::OffsetDateTime,
    deleted_at: Option<time::OffsetDateTime>,
}

impl TryFrom<SiteRow> for Site {
    type Error = RepoError;
    fn try_from(r: SiteRow) -> Result<Self, Self::Error> {
        Ok(Site {
            id: r.id,
            name: r.name,
            primary_domain: r.primary_domain,
            server_id: r.server_id,
            application_id: r.application_id,
            status: r.status.parse().map_err(RepoError::Conflict)?,
            document_root: r.document_root,
            base_path: r.base_path,
            notes: r.notes,
            created_at: r.created_at,
            updated_at: r.updated_at,
            deleted_at: r.deleted_at,
        })
    }
}

const SITE_COLS: &str = "id, name, primary_domain, server_id, application_id, status, \
    document_root, base_path, notes, created_at, updated_at, deleted_at";

// ── Application ───────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct ApplicationRow {
    id: Uuid,
    site_id: Uuid,
    kind: String,
    runtime_version: String,
    build_command: Option<String>,
    start_command: Option<String>,
    process_count: i32,
    health_check_path: String,
    source_kind: String,
    source_config: serde_json::Value,
    current_release_id: Option<Uuid>,
    created_at: time::OffsetDateTime,
}

impl From<ApplicationRow> for Application {
    fn from(r: ApplicationRow) -> Self {
        Application {
            id: r.id,
            site_id: r.site_id,
            kind: r.kind,
            runtime_version: r.runtime_version,
            build_command: r.build_command,
            start_command: r.start_command,
            process_count: r.process_count,
            health_check_path: r.health_check_path,
            source_kind: r.source_kind,
            source_config: r.source_config,
            current_release_id: r.current_release_id,
            created_at: r.created_at,
        }
    }
}

// ── Deployment ────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct DeploymentRow {
    id: Uuid,
    application_id: Uuid,
    site_id: Uuid,
    triggered_by: String,
    triggered_by_id: Option<Uuid>,
    source_ref: Option<String>,
    status: String,
    started_at: Option<time::OffsetDateTime>,
    finished_at: Option<time::OffsetDateTime>,
    error: Option<String>,
    created_at: time::OffsetDateTime,
}

impl TryFrom<DeploymentRow> for Deployment {
    type Error = RepoError;
    fn try_from(r: DeploymentRow) -> Result<Self, Self::Error> {
        Ok(Deployment {
            id: r.id,
            application_id: r.application_id,
            site_id: r.site_id,
            triggered_by: r.triggered_by,
            triggered_by_id: r.triggered_by_id,
            source_ref: r.source_ref,
            status: r.status.parse().map_err(RepoError::Conflict)?,
            started_at: r.started_at,
            finished_at: r.finished_at,
            error: r.error,
            created_at: r.created_at,
        })
    }
}

// ── SiteRepo ──────────────────────────────────────────────────────────────────

pub struct SiteRepo<'a> {
    pool: &'a PgPool,
}

impl<'a> SiteRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<Site, RepoError> {
        sqlx::query_as::<_, SiteRow>(&format!(
            "SELECT {SITE_COLS} FROM sites WHERE id = $1 AND deleted_at IS NULL"
        ))
        .bind(id)
        .fetch_optional(self.pool)
        .await?
        .ok_or(RepoError::NotFound)?
        .try_into()
    }

    pub async fn list(&self, server_id: Option<Uuid>, limit: i64) -> Result<Vec<Site>, RepoError> {
        if let Some(sid) = server_id {
            sqlx::query_as::<_, SiteRow>(&format!(
                "SELECT {SITE_COLS} FROM sites \
                 WHERE server_id = $1 AND deleted_at IS NULL \
                 ORDER BY created_at DESC LIMIT $2"
            ))
            .bind(sid)
            .bind(limit)
            .fetch_all(self.pool)
            .await?
            .into_iter()
            .map(TryInto::try_into)
            .collect()
        } else {
            sqlx::query_as::<_, SiteRow>(&format!(
                "SELECT {SITE_COLS} FROM sites \
                 WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1"
            ))
            .bind(limit)
            .fetch_all(self.pool)
            .await?
            .into_iter()
            .map(TryInto::try_into)
            .collect()
        }
    }

    /// Create site + application in a single transaction.
    /// Returns (site, application, queued_deployment).
    pub async fn create_with_application(
        &self,
        new: tundrad_domain::NewSite,
        triggered_by_id: Uuid,
    ) -> Result<(Site, Application, Deployment), RepoError> {
        let mut tx = self.pool.begin().await?;

        let doc_root = format!("/srv/sites/{}/current", Uuid::now_v7().simple());

        let site: Site = sqlx::query_as::<_, SiteRow>(&format!(
            "INSERT INTO sites (name, primary_domain, server_id, document_root) \
             VALUES ($1, $2, $3, $4) RETURNING {SITE_COLS}"
        ))
        .bind(&new.name)
        .bind(&new.primary_domain)
        .bind(new.server_id)
        .bind(&doc_root)
        .fetch_one(&mut *tx)
        .await?
        .try_into()?;

        let app: Application = sqlx::query_as::<_, ApplicationRow>(
            "INSERT INTO applications \
               (site_id, kind, runtime_version, build_command, start_command, \
                health_check_path, source_kind, source_config) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
             RETURNING id, site_id, kind, runtime_version, build_command, start_command, \
               process_count, health_check_path, source_kind, source_config, \
               current_release_id, created_at",
        )
        .bind(site.id)
        .bind(&new.kind)
        .bind(&new.runtime_version)
        .bind(&new.build_command)
        .bind(&new.start_command)
        .bind(&new.health_check_path)
        .bind(&new.source_kind)
        .bind(&new.source_config)
        .fetch_one(&mut *tx)
        .await?
        .into();

        // Wire application_id back onto the site.
        sqlx::query("UPDATE sites SET application_id = $2 WHERE id = $1")
            .bind(site.id)
            .bind(app.id)
            .execute(&mut *tx)
            .await?;

        // Queue the initial deployment.
        let deploy: Deployment = sqlx::query_as::<_, DeploymentRow>(
            "INSERT INTO deployments \
               (application_id, site_id, triggered_by, triggered_by_id, source_ref) \
             VALUES ($1, $2, 'manual', $3, $4) \
             RETURNING id, application_id, site_id, triggered_by, triggered_by_id, \
               source_ref, status, started_at, finished_at, error, created_at",
        )
        .bind(app.id)
        .bind(site.id)
        .bind(triggered_by_id)
        .bind(
            new.source_config
                .get("branch")
                .and_then(|v| v.as_str())
                .unwrap_or("main"),
        )
        .fetch_one(&mut *tx)
        .await?
        .try_into()?;

        tx.commit().await?;

        Ok((site, app, deploy))
    }

    pub async fn soft_delete(&self, id: Uuid) -> Result<(), RepoError> {
        let n =
            sqlx::query("UPDATE sites SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL")
                .bind(id)
                .execute(self.pool)
                .await?
                .rows_affected();
        if n == 0 {
            Err(RepoError::NotFound)
        } else {
            Ok(())
        }
    }

    pub async fn list_deployments(
        &self,
        site_id: Uuid,
        limit: i64,
    ) -> Result<Vec<Deployment>, RepoError> {
        sqlx::query_as::<_, DeploymentRow>(
            "SELECT id, application_id, site_id, triggered_by, triggered_by_id, \
                    source_ref, status, started_at, finished_at, error, created_at \
             FROM deployments WHERE site_id = $1 ORDER BY created_at DESC LIMIT $2",
        )
        .bind(site_id)
        .bind(limit)
        .fetch_all(self.pool)
        .await?
        .into_iter()
        .map(TryInto::try_into)
        .collect()
    }

    pub async fn create_deployment(
        &self,
        site_id: Uuid,
        application_id: Uuid,
        triggered_by: &str,
        triggered_by_id: Uuid,
        source_ref: Option<&str>,
    ) -> Result<Deployment, RepoError> {
        sqlx::query_as::<_, DeploymentRow>(
            "INSERT INTO deployments \
               (application_id, site_id, triggered_by, triggered_by_id, source_ref) \
             VALUES ($1, $2, $3, $4, $5) \
             RETURNING id, application_id, site_id, triggered_by, triggered_by_id, \
               source_ref, status, started_at, finished_at, error, created_at",
        )
        .bind(application_id)
        .bind(site_id)
        .bind(triggered_by)
        .bind(triggered_by_id)
        .bind(source_ref)
        .fetch_one(self.pool)
        .await?
        .try_into()
    }
}
