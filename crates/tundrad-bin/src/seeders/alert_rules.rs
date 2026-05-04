use sqlx::PgPool;

pub async fn run(pool: &PgPool) -> anyhow::Result<()> {
    let op_id: Option<(uuid::Uuid,)> =
        sqlx::query_as("SELECT id FROM operators WHERE email = 'admin@tundra.local' LIMIT 1")
            .fetch_optional(pool)
            .await?;

    let Some((op_id,)) = op_id else {
        println!("  skipped — no admin operator (run operators seeder first)");
        return Ok(());
    };

    let rules: &[(&str, &str, f64, &str)] = &[
        ("High CPU", "cpu_pct", 90.0, "warning"),
        ("Disk nearly full", "disk_used_pct", 85.0, "critical"),
        ("High memory", "mem_used_pct", 85.0, "warning"),
    ];

    for (name, metric, threshold, severity) in rules {
        sqlx::query(
            "INSERT INTO alert_rules \
               (name, scope_type, metric, condition, threshold, duration_secs, severity, created_by) \
             VALUES ($1, 'server', $2, 'gt', $3, 300, $4, $5) ON CONFLICT DO NOTHING",
        )
        .bind(name)
        .bind(metric)
        .bind(threshold)
        .bind(severity)
        .bind(op_id)
        .execute(pool)
        .await?;
        println!("  alert rule \"{name}\"");
    }
    Ok(())
}
