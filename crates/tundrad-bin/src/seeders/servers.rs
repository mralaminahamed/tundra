use sqlx::PgPool;

pub async fn run(pool: &PgPool) -> anyhow::Result<()> {
    let rows: &[(&str, &str, &str, &str, &str)] = &[
        (
            "web-01",
            "web-01.tundra.local",
            "203.0.113.10",
            "10.0.0.10",
            "us-east-1",
        ),
        (
            "web-02",
            "web-02.tundra.local",
            "203.0.113.11",
            "10.0.0.11",
            "us-east-1",
        ),
        (
            "db-01",
            "db-01.tundra.local",
            "203.0.113.20",
            "10.0.0.20",
            "us-east-1",
        ),
    ];
    for (name, hostname, public_ip, private_ip, region) in rows {
        sqlx::query(
            "INSERT INTO servers (name, hostname, public_ip, private_ip, region, status) \
             VALUES ($1, $2, $3::inet, $4::inet, $5, 'active') ON CONFLICT DO NOTHING",
        )
        .bind(name)
        .bind(hostname)
        .bind(public_ip)
        .bind(private_ip)
        .bind(region)
        .execute(pool)
        .await?;
        println!("  server {name}");
    }
    Ok(())
}
