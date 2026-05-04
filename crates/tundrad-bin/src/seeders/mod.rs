pub mod alert_rules;
pub mod domains;
pub mod operators;
pub mod servers;
pub mod sites;

pub async fn run_all(pool: &sqlx::PgPool) -> anyhow::Result<()> {
    println!("Seeding operators…");
    operators::run(pool).await?;
    println!("Seeding servers…");
    servers::run(pool).await?;
    println!("Seeding sites…");
    sites::run(pool).await?;
    println!("Seeding domains…");
    domains::run(pool).await?;
    println!("Seeding alert rules…");
    alert_rules::run(pool).await?;
    println!("Done.");
    Ok(())
}
