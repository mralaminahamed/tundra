use crate::{PgPool, RepoError};
use tundrad_domain::server_metrics::{ServerMetricsState, UpsertServerMetrics};
use uuid::Uuid;

#[derive(sqlx::FromRow)]
struct ServerMetricsRow {
    server_id: Uuid,
    cpu_cores: i32,
    cpu_used_pct: f64,
    ram_total_mb: i64,
    ram_used_mb: i64,
    disk_total_gb: i64,
    disk_used_gb: i64,
    site_count: i32,
    refreshed_at: time::OffsetDateTime,
}

impl From<ServerMetricsRow> for ServerMetricsState {
    fn from(r: ServerMetricsRow) -> Self {
        ServerMetricsState {
            server_id: r.server_id,
            cpu_cores: r.cpu_cores,
            cpu_used_pct: r.cpu_used_pct,
            ram_total_mb: r.ram_total_mb,
            ram_used_mb: r.ram_used_mb,
            disk_total_gb: r.disk_total_gb,
            disk_used_gb: r.disk_used_gb,
            site_count: r.site_count,
            refreshed_at: r.refreshed_at,
        }
    }
}

/// Column list that casts `numeric` to `float8` so sqlx can decode without bigdecimal.
const SELECT_COLS: &str = "server_id, cpu_cores, cpu_used_pct::float8 AS cpu_used_pct, ram_total_mb, ram_used_mb, \
     disk_total_gb, disk_used_gb, site_count, refreshed_at";

pub struct ServerMetricsRepo<'a> {
    pool: &'a PgPool,
}

impl<'a> ServerMetricsRepo<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn list_all(&self) -> Result<Vec<ServerMetricsState>, RepoError> {
        let sql = format!("SELECT {SELECT_COLS} FROM server_metrics_state ORDER BY server_id");
        sqlx::query_as::<_, ServerMetricsRow>(&sql)
            .fetch_all(self.pool)
            .await?
            .into_iter()
            .map(|r| Ok(r.into()))
            .collect()
    }

    pub async fn for_server(
        &self,
        server_id: Uuid,
    ) -> Result<Option<ServerMetricsState>, RepoError> {
        let sql = format!("SELECT {SELECT_COLS} FROM server_metrics_state WHERE server_id = $1");
        Ok(sqlx::query_as::<_, ServerMetricsRow>(&sql)
            .bind(server_id)
            .fetch_optional(self.pool)
            .await?
            .map(Into::into))
    }

    pub async fn upsert(&self, m: UpsertServerMetrics) -> Result<ServerMetricsState, RepoError> {
        let sql = format!(
            "INSERT INTO server_metrics_state \
               (server_id, cpu_cores, cpu_used_pct, ram_total_mb, ram_used_mb, \
                disk_total_gb, disk_used_gb, site_count, refreshed_at) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now()) \
             ON CONFLICT (server_id) DO UPDATE SET \
               cpu_cores     = EXCLUDED.cpu_cores, \
               cpu_used_pct  = EXCLUDED.cpu_used_pct, \
               ram_total_mb  = EXCLUDED.ram_total_mb, \
               ram_used_mb   = EXCLUDED.ram_used_mb, \
               disk_total_gb = EXCLUDED.disk_total_gb, \
               disk_used_gb  = EXCLUDED.disk_used_gb, \
               site_count    = EXCLUDED.site_count, \
               refreshed_at  = now() \
             RETURNING {SELECT_COLS}"
        );
        Ok(sqlx::query_as::<_, ServerMetricsRow>(&sql)
            .bind(m.server_id)
            .bind(m.cpu_cores)
            .bind(m.cpu_used_pct)
            .bind(m.ram_total_mb)
            .bind(m.ram_used_mb)
            .bind(m.disk_total_gb)
            .bind(m.disk_used_gb)
            .bind(m.site_count)
            .fetch_one(self.pool)
            .await?
            .into())
    }
}
