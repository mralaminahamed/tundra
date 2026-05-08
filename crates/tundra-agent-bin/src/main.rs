use async_trait::async_trait;
use clap::Parser;
use tundra_agent_providers::deploy::{DeployPipeline, DeployProgress, DeploySpec};
use tundra_agent_reconciler::{DeployHandler, QueuedDeployment, ReconcilerLoop, TundraClient};

#[derive(Parser)]
#[command(name = "tundra-agent", about = "Tundra per-node agent daemon")]
struct Cli {
    /// tundrad HTTP endpoint for the agent API
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

// ── DeployHandler implementation ──────────────────────────────────────────────

/// Concrete [`DeployHandler`] backed by the real [`DeployPipeline`].
struct PipelineDeployHandler;

#[async_trait]
impl DeployHandler for PipelineDeployHandler {
    async fn run(&self, dep: QueuedDeployment) -> Result<(), String> {
        let releases_base = format!("/srv/sites/{}/releases", dep.site_id);
        let current_link = dep.document_root.clone();

        let pipeline = DeployPipeline::new(&releases_base, &current_link);
        let (tx, mut rx) = tokio::sync::mpsc::channel(64);

        let spec = DeploySpec {
            deployment_id: dep.deployment_id.clone(),
            site_id: dep.site_id.clone(),
            public_id: dep
                .site_id
                .chars()
                .filter(|c| c.is_ascii_alphanumeric())
                .take(12)
                .collect(),
            document_root: dep.document_root.clone(),
            kind: dep.kind.clone(),
            build_command: dep.build_command.clone(),
            health_check_path: dep.health_check_path.clone(),
            source_ref: dep
                .source_ref
                .clone()
                .unwrap_or_else(|| "blank".to_string()),
            env_vars: std::collections::HashMap::new(),
            active_slot: None,
            listen_port: None,
        };

        let run_fut = pipeline.run(spec, tx);
        let log_fut = async {
            while let Some(event) = rx.recv().await {
                match &event {
                    DeployProgress::Stage { name } => {
                        tracing::info!(
                            deployment_id = %dep.deployment_id,
                            stage = %name,
                            "deploy stage",
                        );
                    }
                    DeployProgress::Log { line, .. } => {
                        tracing::info!(deployment_id = %dep.deployment_id, "{line}");
                    }
                    DeployProgress::Finished { duration_ms, .. } => {
                        tracing::info!(
                            deployment_id = %dep.deployment_id,
                            duration_ms,
                            "deploy finished",
                        );
                    }
                    DeployProgress::Failed { error, stage, .. } => {
                        tracing::error!(
                            deployment_id = %dep.deployment_id,
                            stage = %stage,
                            "deploy failed: {error}",
                        );
                    }
                    _ => {}
                }
            }
        };

        let (pipeline_result, _) = tokio::join!(run_fut, log_fut);
        pipeline_result.map(|_slot| ())
    }
}

// ── main ──────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().init();

    let cli = Cli::parse();

    tracing::info!(
        endpoint = %cli.endpoint,
        server_id = %cli.server_id,
        "tundra-agent starting",
    );

    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);

    let client = TundraClient::new(cli.endpoint.clone(), cli.server_id.clone());
    let reconciler = ReconcilerLoop::new(cli.tick_secs, client, PipelineDeployHandler);

    let reconciler_handle = tokio::spawn(reconciler.run(shutdown_rx));

    // Graceful shutdown on Ctrl-C.
    tokio::signal::ctrl_c().await?;
    tracing::info!("shutting down");
    let _ = shutdown_tx.send(true);
    let _ = reconciler_handle.await;

    Ok(())
}
