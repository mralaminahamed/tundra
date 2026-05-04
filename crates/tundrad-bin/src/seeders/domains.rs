use sqlx::PgPool;

pub async fn run(pool: &PgPool) -> anyhow::Result<()> {
    let rows: &[(&str, &str)] = &[
        ("example.com", "registrar"),
        ("blog.local", "tundra"),
        ("shop.local", "tundra"),
    ];
    for (apex, dns_managed_by) in rows {
        sqlx::query(
            "INSERT INTO domains (apex, dns_managed_by) \
             VALUES ($1, $2) ON CONFLICT DO NOTHING",
        )
        .bind(apex)
        .bind(dns_managed_by)
        .execute(pool)
        .await?;
        println!("  domain {apex}");
    }
    Ok(())
}
