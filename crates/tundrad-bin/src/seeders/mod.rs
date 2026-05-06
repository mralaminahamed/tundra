pub mod alert_rules;
pub mod domains;
pub mod mail_domains;
pub mod operators;
pub mod servers;
pub mod sites;
pub mod wordpress;

pub async fn run_all(pool: &sqlx::PgPool) -> anyhow::Result<()> {
    println!("Seeding operators…");
    operators::run(pool).await?;
    println!("Seeding servers…");
    servers::run(pool).await?;
    println!("Seeding sites…");
    sites::run(pool).await?;
    println!("Seeding domains…");
    domains::run(pool).await?;
    println!("Seeding mail domains…");
    mail_domains::run(pool).await?;
    println!("Seeding alert rules…");
    alert_rules::run(pool).await?;
    println!("Seeding WordPress installations…");
    wordpress::run(pool).await?;
    println!("Done.");
    Ok(())
}
