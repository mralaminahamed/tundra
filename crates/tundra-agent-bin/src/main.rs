use clap::Parser;

#[derive(Parser)]
#[command(name = "tundra-agent", about = "Tundra per-node agent daemon")]
struct Cli {
    /// tundrad gRPC endpoint (mTLS in multi-host mode; UDS in single-host mode)
    #[arg(
        long,
        env = "TUNDRA_ENDPOINT",
        default_value = "https://localhost:7447"
    )]
    endpoint: String,

    /// This server's UUID (set at enrolment, stored in agent.toml)
    #[arg(long, env = "TUNDRA_SERVER_ID")]
    server_id: String,

    /// Reconciler tick interval in seconds
    #[arg(long, default_value = "30")]
    tick_secs: u64,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().init();

    let cli = Cli::parse();

    tracing::info!(
        endpoint = %cli.endpoint,
        server_id = %cli.server_id,
        "tundra-agent starting"
    );

    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);

    let reconciler = tundra_agent_reconciler::ReconcilerLoop::new(cli.tick_secs);

    let reconciler_handle = tokio::spawn(reconciler.run(shutdown_rx));

    // Graceful shutdown on Ctrl-C.
    tokio::signal::ctrl_c().await?;
    tracing::info!("shutting down");
    let _ = shutdown_tx.send(true);
    let _ = reconciler_handle.await;

    Ok(())
}
