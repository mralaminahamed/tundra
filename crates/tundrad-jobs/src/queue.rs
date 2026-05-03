use crate::types::{Job, JobKind, JobStatus};
use sqlx::PgPool;
use std::time::Duration;
use time::OffsetDateTime;
use tokio::time::interval;
use tracing::{error, info, warn};
use uuid::Uuid;

#[derive(sqlx::FromRow)]
struct JobRow {
    id: Uuid,
    kind: String,
    payload: serde_json::Value,
    status: String,
    attempts: i32,
    max_attempts: i32,
    next_run_at: OffsetDateTime,
    error: Option<String>,
    created_at: OffsetDateTime,
    updated_at: OffsetDateTime,
}

impl TryFrom<JobRow> for Job {
    type Error = String;
    fn try_from(r: JobRow) -> Result<Self, Self::Error> {
        let status = match r.status.as_str() {
            "pending" => JobStatus::Pending,
            "running" => JobStatus::Running,
            "succeeded" => JobStatus::Succeeded,
            "failed" => JobStatus::Failed,
            "cancelled" => JobStatus::Cancelled,
            other => return Err(format!("unknown status: {other}")),
        };
        Ok(Job {
            id: r.id,
            kind: r.kind,
            payload: r.payload,
            status,
            attempts: r.attempts,
            max_attempts: r.max_attempts,
            next_run_at: r.next_run_at,
            error: r.error,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
    }
}

/// Durable job queue backed by the `jobs` PostgreSQL table.
/// Uses `SELECT … FOR UPDATE SKIP LOCKED` for concurrency-safe dispatch.
pub struct JobQueue {
    pool: PgPool,
    worker_id: String,
    poll_interval: Duration,
}

impl JobQueue {
    pub fn new(pool: PgPool, poll_interval_secs: u64) -> Self {
        Self {
            pool,
            worker_id: format!("worker-{}", Uuid::now_v7().simple()),
            poll_interval: Duration::from_secs(poll_interval_secs),
        }
    }

    /// Enqueue a new durable job.
    pub async fn enqueue(
        &self,
        kind: &JobKind,
        payload: serde_json::Value,
        run_at: Option<OffsetDateTime>,
    ) -> Result<Uuid, sqlx::Error> {
        let next_run_at = run_at.unwrap_or_else(OffsetDateTime::now_utc);
        let row: (Uuid,) = sqlx::query_as(
            "INSERT INTO jobs (kind, payload, next_run_at) VALUES ($1, $2, $3) RETURNING id",
        )
        .bind(kind.as_str())
        .bind(&payload)
        .bind(next_run_at)
        .fetch_one(&self.pool)
        .await?;
        Ok(row.0)
    }

    /// Claim one pending job for this worker (SKIP LOCKED).
    async fn claim_one(&self) -> Result<Option<Job>, sqlx::Error> {
        let row: Option<JobRow> = sqlx::query_as(
            "UPDATE jobs SET status = 'running', locked_at = now(), locked_by = $1, \
                             attempts = attempts + 1 \
             WHERE id = ( \
               SELECT id FROM jobs \
               WHERE  status = 'pending' AND next_run_at <= now() \
               ORDER  BY next_run_at ASC \
               FOR UPDATE SKIP LOCKED \
               LIMIT  1 \
             ) \
             RETURNING id, kind, payload, status, attempts, max_attempts, \
                       next_run_at, error, created_at, updated_at",
        )
        .bind(&self.worker_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.and_then(|r| r.try_into().ok()))
    }

    /// Mark a job succeeded.
    pub async fn complete(&self, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE jobs SET status = 'succeeded', finished_at = now() WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Mark a job failed (will retry if attempts < max_attempts).
    pub async fn fail(&self, id: Uuid, error: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE jobs SET \
               status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END, \
               error = $2, \
               next_run_at = CASE WHEN attempts >= max_attempts THEN next_run_at \
                                  ELSE now() + interval '60 seconds' END \
             WHERE id = $1",
        )
        .bind(id)
        .bind(error)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Poll loop — claim and dispatch jobs until shutdown signal.
    /// Handlers are registered via `run_with_handler`.
    pub async fn run_with_handler<F, Fut>(
        self,
        mut shutdown: tokio::sync::watch::Receiver<bool>,
        handler: F,
    ) where
        F: Fn(Job) -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = Result<(), String>> + Send,
    {
        let mut ticker = interval(self.poll_interval);
        loop {
            tokio::select! {
                _ = ticker.tick() => {
                    match self.claim_one().await {
                        Ok(Some(job)) => {
                            info!(kind = %job.kind, id = %job.id, "dispatching job");
                            let id = job.id;
                            match handler(job).await {
                                Ok(()) => {
                                    if let Err(e) = self.complete(id).await {
                                        error!(?e, "failed to mark job complete");
                                    }
                                }
                                Err(msg) => {
                                    warn!(id = %id, error = %msg, "job failed");
                                    if let Err(e) = self.fail(id, &msg).await {
                                        error!(?e, "failed to mark job failed");
                                    }
                                }
                            }
                        }
                        Ok(None) => {} // nothing pending
                        Err(e) => error!(?e, "job claim error"),
                    }
                }
                _ = shutdown.changed() => {
                    info!("job queue shutting down");
                    break;
                }
            }
        }
    }
}
