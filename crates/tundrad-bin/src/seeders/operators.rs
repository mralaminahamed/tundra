use sqlx::PgPool;

pub async fn run(pool: &PgPool) -> anyhow::Result<()> {
    let hash = tundrad_crypto::hash_password("admin123!")?;

    let rows: &[(&str, &str, &str, &str)] = &[
        ("op_owner_001", "admin@tundra.local", "Admin", "owner"),
        ("op_admin_002", "alice@tundra.local", "Alice", "admin"),
        ("op_operator_003", "bob@tundra.local", "Bob", "operator"),
        (
            "op_readonly_004",
            "viewer@tundra.local",
            "Viewer",
            "readonly",
        ),
    ];

    for (public_id, email, full_name, role) in rows {
        sqlx::query(
            "INSERT INTO operators (public_id, email, full_name, role, password_hash) \
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING",
        )
        .bind(public_id)
        .bind(email)
        .bind(full_name)
        .bind(role)
        .bind(&hash)
        .execute(pool)
        .await?;
        println!("  operator {email}");
    }
    Ok(())
}
