use clap::{Parser, Subcommand};
use sqlx::postgres::PgPoolOptions;
use std::time::Duration;

#[derive(Parser)]
#[command(name = "tundrad", about = "Tundra control-plane daemon")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Start the HTTP + gRPC server
    Serve,
    /// Apply pending database migrations
    Migrate,
    /// Master key management
    MasterKey {
        #[command(subcommand)]
        action: MasterKeyAction,
    },
}

#[derive(Subcommand)]
enum MasterKeyAction {
    /// Generate a new master key file
    Generate {
        #[arg(long, default_value = "/var/lib/tundra/data/master.key")]
        path: std::path::PathBuf,
    },
    /// Verify an existing master key file
    Verify {
        #[arg(long, default_value = "/var/lib/tundra/data/master.key")]
        path: std::path::PathBuf,
    },
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    if let Err(e) = run(cli).await {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
}

async fn run(cli: Cli) -> anyhow::Result<()> {
    match cli.command {
        Command::Serve => serve().await,
        Command::Migrate => migrate().await,
        Command::MasterKey { action } => master_key(action),
    }
}

async fn serve() -> anyhow::Result<()> {
    let cfg = tundrad_config::load()?;

    tundrad_telemetry::init(tundrad_telemetry::TelemetryOptions {
        log_level: cfg.log.level.clone(),
        json: cfg.log.json,
        otlp_endpoint: cfg.telemetry.otlp_endpoint.clone(),
        service_name: cfg.telemetry.service_name.clone(),
    })?;

    let master = tundrad_crypto::MasterKey::load(&cfg.master_key.path)?;
    tundrad_crypto::KeyRing::init_global(master)?;

    let pool = PgPoolOptions::new()
        .max_connections(cfg.database.max_connections)
        .acquire_timeout(Duration::from_secs(cfg.database.connect_timeout_secs))
        .connect(&cfg.database.url)
        .await?;

    sqlx::migrate!("../../migrations").run(&pool).await?;

    let addr = format!("{}:{}", cfg.server.listen_addr, cfg.server.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!(addr, "tundrad listening");

    axum::serve(listener, tundrad_api::router(pool)).await?;
    Ok(())
}

async fn migrate() -> anyhow::Result<()> {
    let cfg = tundrad_config::load()?;
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&cfg.database.url)
        .await?;
    sqlx::migrate!("../../migrations").run(&pool).await?;
    println!("migrations applied");
    Ok(())
}

fn master_key(action: MasterKeyAction) -> anyhow::Result<()> {
    match action {
        MasterKeyAction::Generate { path } => {
            if path.exists() {
                anyhow::bail!("key file already exists at {}", path.display());
            }
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let (file_bytes, _) = tundrad_crypto::MasterKey::generate();
            std::fs::write(&path, &file_bytes)?;
            // mode 0400 — owner read-only
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o400))?;
            }
            println!("master key written to {}", path.display());
        }
        MasterKeyAction::Verify { path } => {
            tundrad_crypto::MasterKey::load(&path)?;
            println!("master key at {} is valid", path.display());
        }
    }
    Ok(())
}
