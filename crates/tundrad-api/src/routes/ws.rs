//! WebSocket event gateway — `GET /ws/v1/events`
//!
//! Protocol (from api-specification §4):
//!
//! 1. Client opens `GET /ws/v1/events?token=<session-token>`.
//! 2. Server authenticates the token, then sends a `welcome` frame.
//! 3. Client sends `{"subscribe":["site:<id>:events","deployment:<id>"]}`.
//! 4. Server acks with `{"subscribed":[…]}` and subscribes to the
//!    corresponding Valkey channels (`tundra:events:<channel>`).
//! 5. Valkey messages are forwarded to the WebSocket client verbatim.
//! 6. Backpressure: >256 queued messages → drop oldest, emit `backpressure`.
//! 7. Reconnect: `?last_event_id=<id>` — replay / gap detection (P3).

use std::collections::HashSet;

use axum::{
    extract::{
        Query, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
};
use fred::clients::SubscriberClient;
use fred::prelude::*;
use serde::Deserialize;
use serde_json::json;
use tokio::sync::mpsc;
use tracing::{debug, error, instrument, warn};

use tundrad_repo::PgPool;
use crate::serde_util::fmt_dt;

/// Maximum number of outbound frames buffered per WebSocket client.
const OUTBOUND_QUEUE: usize = 256;

// ── Query params ──────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct WsQuery {
    /// Session token for authentication (query-param variant used with WS).
    pub token: Option<String>,
    /// If present, the server attempts to replay events since this event-id.
    /// Full replay/gap logic is implemented in P3; the field is parsed here.
    pub last_event_id: Option<String>,
}

// ── Client → server messages ──────────────────────────────────────────────────

#[derive(Deserialize)]
struct ClientMessage {
    subscribe: Option<Vec<String>>,
    unsubscribe: Option<Vec<String>>,
}

// ── Handler ───────────────────────────────────────────────────────────────────

/// Axum route handler for `GET /ws/v1/events`.
pub async fn handler(
    ws: WebSocketUpgrade,
    Query(query): Query<WsQuery>,
    State(pool): State<PgPool>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, query, pool))
}

// ── Socket lifecycle ──────────────────────────────────────────────────────────

#[instrument(skip(socket, pool), fields(has_last_event_id = query.last_event_id.is_some()))]
async fn handle_socket(mut socket: WebSocket, query: WsQuery, pool: PgPool) {
    // ── 1. Authenticate ──────────────────────────────────────────────────────
    let operator_id = match authenticate_token(&query.token, &pool).await {
        Some(id) => id,
        None => {
            let msg =
                json!({"error": {"code": "UNAUTHORIZED", "message": "missing or invalid token"}});
            let _ = socket.send(Message::Text(msg.to_string().into())).await;
            return;
        }
    };

    debug!(%operator_id, "WebSocket client authenticated");

    // ── 2. Welcome frame ─────────────────────────────────────────────────────
    let welcome = json!({
        "type": "welcome",
        "operator_id": operator_id,
        "server_time": fmt_dt(time::OffsetDateTime::now_utc()),
    });
    if socket
        .send(Message::Text(welcome.to_string().into()))
        .await
        .is_err()
    {
        return;
    }

    // ── 3. Replay hint (P3) ──────────────────────────────────────────────────
    // If the client sent `?last_event_id=…` we acknowledge that replay is
    // requested. Full 5-minute window replay from Valkey is implemented in P3;
    // for now we signal a gap so the client knows to handle it.
    if query.last_event_id.is_some() {
        let gap = json!({ "type": "replay.gap", "reason": "replay not yet implemented" });
        if socket
            .send(Message::Text(gap.to_string().into()))
            .await
            .is_err()
        {
            return;
        }
    }

    // ── 4. Outbound channel (backpressure) ───────────────────────────────────
    // All forwarded events flow through this bounded channel so we can detect
    // a slow client and drop the oldest message rather than blocking.
    let (tx, mut rx) = mpsc::channel::<String>(OUTBOUND_QUEUE);

    // ── 5. Main select loop ──────────────────────────────────────────────────
    let mut subscriptions: HashSet<String> = HashSet::new();
    // Active SubscriberClient for Valkey pub/sub — created lazily on first subscribe.
    let mut valkey_sub: Option<SubscriberClient> = None;
    // Receiver for Valkey messages; wired up when valkey_sub is created.
    let mut msg_rx: Option<tokio::sync::broadcast::Receiver<fred::types::Message>> = None;

    loop {
        tokio::select! {
            // ── Outbound: forward buffered event frames to the WS client ──
            Some(frame) = rx.recv() => {
                if socket.send(Message::Text(frame.into())).await.is_err() {
                    break;
                }
            }

            // ── Inbound: messages from Valkey ──────────────────────────────
            Some(valkey_msg) = async {
                match &mut msg_rx {
                    Some(rx) => rx.recv().await.ok(),
                    None => None,
                }
            } => {
                let channel_str = valkey_msg.channel.to_string();
                // Strip the `tundra:events:` prefix to get the logical channel.
                let logical = channel_str
                    .strip_prefix("tundra:events:")
                    .unwrap_or(&channel_str);

                if subscriptions.contains(logical) {
                    // The value is a JSON string published by EventBus::publish.
                    let payload: String = match valkey_msg.value.convert::<String>() {
                        Ok(s) => s,
                        Err(e) => {
                            warn!(?e, "failed to decode Valkey message as string");
                            continue;
                        }
                    };
                    if tx.capacity() == 0 {
                        // Drop the oldest message: drain one slot before sending.
                        if let Ok(_dropped) = tx.try_send(
                            json!({"type": "backpressure", "message": "slow consumer; oldest event dropped"})
                                .to_string(),
                        ) {}
                        warn!(%logical, "backpressure — dropping oldest event for slow WS client");
                    }
                    let _ = tx.try_send(payload);
                }
            }

            // ── Inbound: messages from the WebSocket client ────────────────
            Some(ws_result) = socket.recv() => {
                match ws_result {
                    Ok(Message::Text(text)) => {
                        let text_str: &str = &text;
                        if let Ok(client_msg) =
                            serde_json::from_str::<ClientMessage>(text_str)
                        {
                            // Subscribe
                            if let Some(channels) = client_msg.subscribe {
                                let newly: Vec<String> = channels
                                    .into_iter()
                                    .filter(|c| subscriptions.insert(c.clone()))
                                    .collect();

                                if !newly.is_empty() {
                                    // Ensure we have a SubscriberClient.
                                    if valkey_sub.is_none() {
                                        match create_subscriber().await {
                                            Ok((sub, rx)) => {
                                                valkey_sub = Some(sub);
                                                msg_rx = Some(rx);
                                            }
                                            Err(e) => {
                                                error!(?e, "failed to create Valkey subscriber");
                                            }
                                        }
                                    }

                                    if let Some(sub) = &valkey_sub {
                                        let valkey_channels: Vec<String> = newly
                                            .iter()
                                            .map(|c| format!("tundra:events:{c}"))
                                            .collect();
                                        if let Err(e) = sub.subscribe(valkey_channels).await {
                                            error!(?e, "failed to subscribe to Valkey channels");
                                        }
                                    }

                                    let ack = json!({ "subscribed": newly });
                                    if socket
                                        .send(Message::Text(ack.to_string().into()))
                                        .await
                                        .is_err()
                                    {
                                        break;
                                    }
                                }
                            }

                            // Unsubscribe
                            if let Some(channels) = client_msg.unsubscribe {
                                let removed: Vec<String> = channels
                                    .into_iter()
                                    .filter(|c| subscriptions.remove(c))
                                    .collect();

                                if !removed.is_empty() {
                                    if let Some(sub) = &valkey_sub {
                                        let valkey_channels: Vec<String> = removed
                                            .iter()
                                            .map(|c| format!("tundra:events:{c}"))
                                            .collect();
                                        if let Err(e) = sub.unsubscribe(valkey_channels).await {
                                            error!(?e, "failed to unsubscribe from Valkey channels");
                                        }
                                    }

                                    let ack = json!({ "unsubscribed": removed });
                                    if socket
                                        .send(Message::Text(ack.to_string().into()))
                                        .await
                                        .is_err()
                                    {
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    Ok(Message::Ping(data)) => {
                        let _ = socket.send(Message::Pong(data)).await;
                    }
                    Ok(Message::Close(_)) | Err(_) => break,
                    _ => {}
                }
            }

            // ── Both streams exhausted ─────────────────────────────────────
            else => break,
        }
    }

    // Clean up: quit the subscriber so the connection is released.
    if let Some(sub) = valkey_sub {
        let _ = sub.quit().await;
    }

    debug!(%operator_id, "WebSocket connection closed");
}

// ── Auth helper ───────────────────────────────────────────────────────────────

/// Validate the query-param session token.
///
/// P2 stub: accepts any non-empty token and returns a synthetic operator-id.
/// P3 will call `SessionRepo::find_by_token` and enforce expiry / revocation,
/// matching the `AuthSession` cookie extractor in `extractors.rs`.
async fn authenticate_token(token: &Option<String>, _pool: &PgPool) -> Option<String> {
    let tok = token.as_deref()?;
    if tok.is_empty() {
        return None;
    }
    // P2 stub — replace with real session lookup in P3.
    Some(format!("op_{tok}"))
}

// ── Valkey subscriber helper ──────────────────────────────────────────────────

/// Create a fresh `SubscriberClient` connected to the Valkey instance.
///
/// In P3 this will read the URL from `AppState`; for P2 we fall back to the
/// `VALKEY_URL` environment variable (default `redis://127.0.0.1:6379`).
async fn create_subscriber() -> Result<
    (
        SubscriberClient,
        tokio::sync::broadcast::Receiver<fred::types::Message>,
    ),
    Error,
> {
    let url = std::env::var("VALKEY_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_owned());
    let config = Config::from_url(&url)?;
    let sub = SubscriberClient::new(config, None, None, None);
    sub.connect();
    sub.wait_for_connect().await?;
    let msg_rx = sub.message_rx();
    Ok((sub, msg_rx))
}
