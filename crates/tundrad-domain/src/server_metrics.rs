use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct ServerMetricsState {
    pub server_id: Uuid,
    pub cpu_cores: i32,
    pub cpu_used_pct: f64,
    pub ram_total_mb: i64,
    pub ram_used_mb: i64,
    pub disk_total_gb: i64,
    pub disk_used_gb: i64,
    pub site_count: i32,
    pub refreshed_at: time::OffsetDateTime,
}

#[derive(Debug, Clone)]
pub struct UpsertServerMetrics {
    pub server_id: Uuid,
    pub cpu_cores: i32,
    pub cpu_used_pct: f64,
    pub ram_total_mb: i64,
    pub ram_used_mb: i64,
    pub disk_total_gb: i64,
    pub disk_used_gb: i64,
    pub site_count: i32,
}
