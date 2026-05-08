use std::collections::HashSet;
use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::Mutex;
use tokio::time::{Duration, interval};
use tracing::{error, info, warn};

use crate::tundra_client::{DeploymentStatusUpdate, QueuedDeployment, TundraClient};

// ── DeployHandler ─────────────────────────────────────────────────────────────

/// Pluggable deployment executor.
///
/// `tundra-agent-bin` supplies a concrete implementation backed by
/// [`tundra_agent_providers::deploy::DeployPipeline`].  The reconciler crate
/// itself does not depend on `tundra-agent-providers` (which depends back on
/// this crate, so a direct dep would create a cycle).
#[async_trait]
pub trait DeployHandler: Send + Sync + 'static {
    /// Execute a deployment described by `dep`.
    ///
    /// Returns `Ok(())` on success, `Err(message)` on failure.
    async fn run(&self, dep: QueuedDeployment) -> Result<(), String>;
}

// ── ReconcilerLoop ────────────────────────────────────────────────────────────

/// Tick-based loop that polls tundrad for queued deployments, dispatches them
/// to [`DeployHandler`], and reports status transitions back to tundrad.
pub struct ReconcilerLoop {
    tick_interval: Duration,
    client: Arc<TundraClient>,
    handler: Arc<dyn DeployHandler>,
    in_flight: Arc<Mutex<HashSet<String>>>,
}

impl ReconcilerLoop {
    pub fn new(
        tick_secs: u64,
        client: TundraClient,
        handler: impl DeployHandler,
    ) -> Self {
        Self {
            tick_interval: Duration::from_secs(tick_secs),
            client: Arc::new(client),
            handler: Arc::new(handler),
            in_flight: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    /// Drive the reconcile loop until `shutdown` is signalled.
    pub async fn run(self, mut shutdown: tokio::sync::watch::Receiver<bool>) {
        let mut ticker = interval(self.tick_interval);
        loop {
            tokio::select! {
                _ = ticker.tick() => {
                    self.tick().await;
                }
                _ = shutdown.changed() => {
                    info!("reconciler shutting down");
                    break;
                }
            }
        }
    }

    async fn tick(&self) {
        let deployments = match self.client.poll_queued_deployments().await {
            Ok(d) => d,
            Err(e) => {
                warn!("poll failed: {e}");
                return;
            }
        };

        for dep in deployments {
            let deployment_id = dep.deployment_id.clone();

            // Skip deployments already being processed.
            {
                let mut set = self.in_flight.lock().await;
                if set.contains(&deployment_id) {
                    continue;
                }
                set.insert(deployment_id.clone());
            }

            let client = Arc::clone(&self.client);
            let handler = Arc::clone(&self.handler);
            let in_flight = Arc::clone(&self.in_flight);

            tokio::spawn(async move {
                info!(deployment_id = %deployment_id, "starting deployment");

                let started = unix_now_secs();
                if let Err(e) = client
                    .update_deployment_status(
                        &deployment_id,
                        DeploymentStatusUpdate {
                            status: "running".into(),
                            started_at: Some(started),
                            finished_at: None,
                            error: None,
                        },
                    )
                    .await
                {
                    error!(deployment_id = %deployment_id, "failed to mark running: {e}");
                }

                let result = handler.run(dep).await;

                let finished = unix_now_secs();
                let (status, err_msg) = match result {
                    Ok(()) => ("succeeded".to_string(), None),
                    Err(e) => ("failed".to_string(), Some(e)),
                };

                if let Err(e) = client
                    .update_deployment_status(
                        &deployment_id,
                        DeploymentStatusUpdate {
                            status,
                            started_at: None,
                            finished_at: Some(finished),
                            error: err_msg,
                        },
                    )
                    .await
                {
                    error!(deployment_id = %deployment_id, "failed to update final status: {e}");
                }

                in_flight.lock().await.remove(&deployment_id);
            });
        }
    }
}

// ── helpers ───────────────────────────────────────────────────────────────────

fn unix_now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
