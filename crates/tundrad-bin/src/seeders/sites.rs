use sqlx::PgPool;

pub async fn run(pool: &PgPool) -> anyhow::Result<()> {
    let server_id: Option<(uuid::Uuid,)> =
        sqlx::query_as("SELECT id FROM servers WHERE name = 'web-01' LIMIT 1")
            .fetch_optional(pool)
            .await?;

    let Some((server_id,)) = server_id else {
        println!("  skipped — no web-01 server (run servers seeder first)");
        return Ok(());
    };

    let rows: &[(&str, &str, &str)] = &[
        ("Demo Site", "example.com", "/var/www/example.com/public"),
        ("Blog", "blog.local", "/var/www/blog.local/public"),
        ("Shop", "shop.local", "/var/www/shop.local/public"),
    ];
    for (name, domain, document_root) in rows {
        sqlx::query(
            "INSERT INTO sites (name, primary_domain, server_id, document_root, status) \
             VALUES ($1, $2, $3, $4, 'active') ON CONFLICT DO NOTHING",
        )
        .bind(name)
        .bind(domain)
        .bind(server_id)
        .bind(document_root)
        .execute(pool)
        .await?;
        println!("  site {domain}");
    }
    Ok(())
}
