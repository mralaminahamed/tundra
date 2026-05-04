use sqlx::{PgPool, postgres::PgPoolOptions};
use std::time::Duration;
use testcontainers::{ContainerAsync, ImageExt, runners::AsyncRunner};
use testcontainers_modules::{postgres::Postgres, redis::Redis};

/// Fully-isolated test environment: real PostgreSQL + real Valkey, migrations applied.
/// Containers are dropped when this struct drops.
pub struct TestEnv {
    pool: PgPool,
    _pg: ContainerAsync<Postgres>,
    _redis: ContainerAsync<Redis>,
}

impl TestEnv {
    /// Start containers and apply all migrations. Call once per test function.
    pub async fn new() -> Self {
        let pg = Postgres::default()
            .with_tag("18-alpine")
            .start()
            .await
            .expect("failed to start Postgres container");

        let redis = Redis::default()
            .start()
            .await
            .expect("failed to start Redis container");

        let pg_port = pg.get_host_port_ipv4(5432).await.unwrap();
        let db_url = format!("postgres://postgres:postgres@127.0.0.1:{pg_port}/postgres");

        let pool = PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(30))
            .connect(&db_url)
            .await
            .expect("failed to connect to test Postgres");

        sqlx::migrate!("../../database/migrations")
            .run(&pool)
            .await
            .expect("failed to apply migrations");

        Self {
            pool,
            _pg: pg,
            _redis: redis,
        }
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// Seed an operator with a known password (`"test-password-123!"`).
    pub async fn seed_operator(
        &self,
        email: &str,
        role: tundrad_domain::operator::OperatorRole,
    ) -> tundrad_domain::Operator {
        let hash =
            tundrad_crypto::hash_password("test-password-123!").expect("hash_password failed");

        tundrad_repo::OperatorRepo::new(&self.pool)
            .create(tundrad_domain::operator::NewOperator {
                email: email.to_owned(),
                full_name: "Test User".to_owned(),
                role,
                password_hash: Some(hash),
            })
            .await
            .expect("seed_operator failed")
    }
}
