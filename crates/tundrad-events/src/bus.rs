use std::sync::Arc;

use fred::prelude::*;
use tracing::instrument;

use crate::types::Event;

/// Shared handle to the Valkey / Redis pub/sub bus.
///
/// Cheaply cloneable — clone and hand out to any subsystem that needs to
/// publish events (handlers, job workers, background tasks).
#[derive(Clone)]
pub struct EventBus {
    client: Arc<Client>,
}

impl EventBus {
    /// Connect to Valkey at the given URL (e.g. `redis://127.0.0.1:6379`).
    ///
    /// Blocks until the first connection is established.
    pub async fn connect(url: &str) -> Result<Self, Error> {
        let config = Config::from_url(url)?;
        let client = Client::new(config, None, None, None);
        client.connect();
        client.wait_for_connect().await?;
        Ok(Self {
            client: Arc::new(client),
        })
    }

    /// Return a clone of the underlying client for callers that need raw
    /// access (e.g. the WebSocket handler subscribing to channels).
    pub fn client(&self) -> Arc<Client> {
        self.client.clone()
    }

    /// Publish an event to the Valkey channel that mirrors `event.channel`.
    ///
    /// The channel name on Valkey is `tundra:events:<channel>` so that
    /// control-plane channels are namespaced away from any other keys.
    #[instrument(skip(self, event), fields(channel = %event.channel, event_type = %event.event_type))]
    pub async fn publish(&self, event: &Event) -> Result<(), Error> {
        let valkey_channel = format!("tundra:events:{}", event.channel);
        let payload = serde_json::to_string(event).unwrap_or_default();
        let _: i64 = self.client.publish(valkey_channel, payload).await?;
        Ok(())
    }
}
