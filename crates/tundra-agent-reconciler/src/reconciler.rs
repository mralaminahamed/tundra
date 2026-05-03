use tokio::time::{Duration, interval};
use tracing::{error, info};

/// Drives a tick-based reconciliation cycle.
/// Provider dispatch wired in P3 when agent config deserialization lands.
pub struct ReconcilerLoop {
    tick_interval: Duration,
}

impl ReconcilerLoop {
    pub fn new(tick_secs: u64) -> Self {
        Self {
            tick_interval: Duration::from_secs(tick_secs),
        }
    }

    pub async fn run(self, mut shutdown: tokio::sync::watch::Receiver<bool>) {
        let mut ticker = interval(self.tick_interval);
        loop {
            tokio::select! {
                _ = ticker.tick() => {
                    info!("reconciler tick");
                }
                _ = shutdown.changed() => {
                    info!("reconciler shutting down");
                    break;
                }
            }
        }
    }
}
