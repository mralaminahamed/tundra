---
title: WebSocket Events
description: Real-time events via WebSocket subscriptions.
sidebar:
  order: 5
---

## Connecting

```
wss://panel.example.com/ws/v1/events
```

Authenticate with a session cookie (browser) or pass a token as a query param:

```
wss://panel.example.com/ws/v1/events?token=tnd_prod_<token>
```

## Subscribing to channels

Send a JSON subscribe message after connecting:

```json
{
  "type": "subscribe",
  "channels": [
    "deployment:01j4k...",
    "site:01j4k...:logs",
    "server:01j4k...:metrics"
  ]
}
```

Response:
```json
{ "type": "subscribed", "channels": ["deployment:01j4k..."] }
```

## Event types

### Deployment events

Channel: `deployment:{id}`

```json
{
  "channel": "deployment:01j4k...",
  "event": "deployment.stage_changed",
  "data": {
    "deployment_id": "01j4k...",
    "stage": "symlink-swap",
    "status": "running"
  }
}
```

```json
{
  "event": "deployment.completed",
  "data": { "deployment_id": "...", "duration_ms": 4200 }
}
```

### Site log streaming

Channel: `site:{id}:logs`

```json
{
  "channel": "site:01j4k...:logs",
  "event": "log.line",
  "data": {
    "stream": "access",
    "line": "192.168.1.1 - - [09/May/2026] \"GET / HTTP/2\" 200 1234"
  }
}
```

### Server metrics

Channel: `server:{id}:metrics`

```json
{
  "channel": "server:01j4k...:metrics",
  "event": "metrics.snapshot",
  "data": {
    "cpu_pct": 12.4,
    "ram_used_mb": 1024,
    "disk_used_gb": 45.2,
    "ts": "2026-05-09T12:00:00Z"
  }
}
```

## Unsubscribing

```json
{ "type": "unsubscribe", "channels": ["deployment:01j4k..."] }
```

## Heartbeat

The server sends a ping every 30 seconds. The client must respond with a pong (most WebSocket libraries do this automatically). Connections idle for 90 seconds are closed.
