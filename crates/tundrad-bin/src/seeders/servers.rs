use sqlx::PgPool;

pub async fn run(pool: &PgPool) -> anyhow::Result<()> {
    // (name, hostname, public_ip, private_ip, region, os, arch, notes)
    let rows: &[(&str, &str, &str, &str, &str, &str, &str, &str)] = &[
        // ── us-east-1 (8 servers) ─────────────────────────────────────────────
        (
            "web-01",
            "web-01.us-east-1.tundra.local",
            "203.0.113.1",
            "10.0.0.1",
            "us-east-1",
            "ubuntu-24.04",
            "x86_64",
            "Primary web frontend",
        ),
        (
            "web-02",
            "web-02.us-east-1.tundra.local",
            "203.0.113.2",
            "10.0.0.2",
            "us-east-1",
            "ubuntu-24.04",
            "x86_64",
            "Secondary web frontend",
        ),
        (
            "web-03",
            "web-03.us-east-1.tundra.local",
            "203.0.113.3",
            "10.0.0.3",
            "us-east-1",
            "ubuntu-24.04",
            "x86_64",
            "Overflow web frontend",
        ),
        (
            "api-01",
            "api-01.us-east-1.tundra.local",
            "203.0.113.4",
            "10.0.0.4",
            "us-east-1",
            "ubuntu-24.04",
            "x86_64",
            "API backend",
        ),
        (
            "api-02",
            "api-02.us-east-1.tundra.local",
            "203.0.113.5",
            "10.0.0.5",
            "us-east-1",
            "ubuntu-24.04",
            "x86_64",
            "API backend replica",
        ),
        (
            "db-01",
            "db-01.us-east-1.tundra.local",
            "203.0.113.6",
            "10.0.0.6",
            "us-east-1",
            "ubuntu-24.04",
            "x86_64",
            "Primary database",
        ),
        (
            "db-02",
            "db-02.us-east-1.tundra.local",
            "203.0.113.7",
            "10.0.0.7",
            "us-east-1",
            "ubuntu-24.04",
            "x86_64",
            "Database replica",
        ),
        (
            "cache-01",
            "cache-01.us-east-1.tundra.local",
            "203.0.113.8",
            "10.0.0.8",
            "us-east-1",
            "ubuntu-24.04",
            "x86_64",
            "Valkey cache",
        ),
        // ── us-west-2 (6 servers) ─────────────────────────────────────────────
        (
            "web-01",
            "web-01.us-west-2.tundra.local",
            "198.51.100.1",
            "10.1.0.1",
            "us-west-2",
            "ubuntu-24.04",
            "x86_64",
            "West coast frontend",
        ),
        (
            "web-02",
            "web-02.us-west-2.tundra.local",
            "198.51.100.2",
            "10.1.0.2",
            "us-west-2",
            "ubuntu-24.04",
            "x86_64",
            "West coast frontend 2",
        ),
        (
            "api-01",
            "api-01.us-west-2.tundra.local",
            "198.51.100.3",
            "10.1.0.3",
            "us-west-2",
            "ubuntu-24.04",
            "x86_64",
            "West API",
        ),
        (
            "db-01",
            "db-01.us-west-2.tundra.local",
            "198.51.100.4",
            "10.1.0.4",
            "us-west-2",
            "ubuntu-24.04",
            "x86_64",
            "West database",
        ),
        (
            "worker-01",
            "worker-01.us-west-2.tundra.local",
            "198.51.100.5",
            "10.1.0.5",
            "us-west-2",
            "ubuntu-24.04",
            "x86_64",
            "Background jobs",
        ),
        (
            "cache-01",
            "cache-01.us-west-2.tundra.local",
            "198.51.100.6",
            "10.1.0.6",
            "us-west-2",
            "ubuntu-24.04",
            "x86_64",
            "West Valkey",
        ),
        // ── eu-west-1 (5 servers) ─────────────────────────────────────────────
        (
            "web-01",
            "web-01.eu-west-1.tundra.local",
            "192.0.2.1",
            "10.2.0.1",
            "eu-west-1",
            "debian-12",
            "x86_64",
            "EU frontend",
        ),
        (
            "web-02",
            "web-02.eu-west-1.tundra.local",
            "192.0.2.2",
            "10.2.0.2",
            "eu-west-1",
            "debian-12",
            "x86_64",
            "EU frontend 2",
        ),
        (
            "api-01",
            "api-01.eu-west-1.tundra.local",
            "192.0.2.3",
            "10.2.0.3",
            "eu-west-1",
            "debian-12",
            "x86_64",
            "EU API",
        ),
        (
            "db-01",
            "db-01.eu-west-1.tundra.local",
            "192.0.2.4",
            "10.2.0.4",
            "eu-west-1",
            "debian-12",
            "x86_64",
            "EU database (GDPR region)",
        ),
        (
            "worker-01",
            "worker-01.eu-west-1.tundra.local",
            "192.0.2.5",
            "10.2.0.5",
            "eu-west-1",
            "debian-12",
            "x86_64",
            "EU jobs",
        ),
        // ── ap-southeast-1 (4 servers) ────────────────────────────────────────
        (
            "web-01",
            "web-01.ap-southeast-1.tundra.local",
            "203.0.114.1",
            "10.3.0.1",
            "ap-southeast-1",
            "ubuntu-24.04",
            "aarch64",
            "APAC frontend",
        ),
        (
            "api-01",
            "api-01.ap-southeast-1.tundra.local",
            "203.0.114.2",
            "10.3.0.2",
            "ap-southeast-1",
            "ubuntu-24.04",
            "aarch64",
            "APAC API",
        ),
        (
            "db-01",
            "db-01.ap-southeast-1.tundra.local",
            "203.0.114.3",
            "10.3.0.3",
            "ap-southeast-1",
            "ubuntu-24.04",
            "aarch64",
            "APAC database",
        ),
        (
            "cache-01",
            "cache-01.ap-southeast-1.tundra.local",
            "203.0.114.4",
            "10.3.0.4",
            "ap-southeast-1",
            "ubuntu-24.04",
            "aarch64",
            "APAC cache",
        ),
    ];

    for (name, hostname, public_ip, private_ip, region, os, arch, notes) in rows {
        sqlx::query(
            "INSERT INTO servers (name, hostname, public_ip, private_ip, region, os, arch, notes, status) \
             VALUES ($1, $2, $3::inet, $4::inet, $5, $6, $7, $8, 'active') \
             ON CONFLICT (hostname) DO NOTHING",
        )
        .bind(name)
        .bind(hostname)
        .bind(public_ip)
        .bind(private_ip)
        .bind(region)
        .bind(os)
        .bind(arch)
        .bind(notes)
        .execute(pool)
        .await?;
        println!("  server {hostname}");
    }
    Ok(())
}
