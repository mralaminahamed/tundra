use crate::{PgPool, RepoError};
use time::OffsetDateTime;
use tundrad_domain::metrics::NewMetricSample;
use uuid::Uuid;

pub struct MetricsRepo<'a> {
    pool: &'a PgPool,
}

impl<'a> MetricsRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn insert_sample(&self, s: &NewMetricSample) -> Result<(), RepoError> {
        sqlx::query(
            "INSERT INTO metrics_samples (occurred_at, scope_type, scope_id, metric, value, labels) \
             VALUES ($1, $2, $3, $4, $5, $6)",
        )
        .bind(s.occurred_at)
        .bind(&s.scope_type)
        .bind(s.scope_id)
        .bind(&s.metric)
        .bind(s.value)
        .bind(&s.labels)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    /// Query metric averages bucketed by `step_secs` seconds.
    pub async fn query_range(
        &self,
        scope_type: &str,
        scope_id: Uuid,
        metric: &str,
        since: OffsetDateTime,
        until: OffsetDateTime,
        step_secs: i64,
    ) -> Result<Vec<(OffsetDateTime, f64)>, RepoError> {
        // Use date_bin to align buckets
        let rows: Vec<(OffsetDateTime, f64)> = sqlx::query_as(
            "SELECT \
               date_bin($1::interval, occurred_at, TIMESTAMP WITH TIME ZONE '2001-01-01') AS bucket, \
               avg(value)::float8 AS avg_value \
             FROM metrics_samples \
             WHERE scope_type = $2 \
               AND scope_id = $3 \
               AND metric = $4 \
               AND occurred_at >= $5 \
               AND occurred_at < $6 \
             GROUP BY bucket \
             ORDER BY bucket ASC",
        )
        .bind(format!("{step_secs} seconds"))
        .bind(scope_type)
        .bind(scope_id)
        .bind(metric)
        .bind(since)
        .bind(until)
        .fetch_all(self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn latest_value(
        &self,
        scope_type: &str,
        scope_id: Uuid,
        metric: &str,
    ) -> Result<Option<f64>, RepoError> {
        let row: Option<(f64,)> = sqlx::query_as(
            "SELECT value::float8 FROM metrics_samples \
             WHERE scope_type = $1 AND scope_id = $2 AND metric = $3 \
             ORDER BY occurred_at DESC \
             LIMIT 1",
        )
        .bind(scope_type)
        .bind(scope_id)
        .bind(metric)
        .fetch_optional(self.pool)
        .await?;
        Ok(row.map(|(v,)| v))
    }
}
