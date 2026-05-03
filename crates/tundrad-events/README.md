# tundrad-events

Valkey pub/sub event bus for the Tundra control plane. Publishes structured events; the WebSocket gateway subscribes and forwards to connected browser sessions.

## Channel naming

```
tundra:events:<topic>
```

Examples:
- `tundra:events:deployments` — deployment status changes
- `tundra:events:server-metrics` — live server metric samples
- `tundra:events:sites` — site provisioning / status updates

## Publish side

State-changing handlers call `EventBus::publish(event)` after committing the DB transaction. Events are fire-and-forget — a Valkey crash drops them; the DB state is authoritative.

## Subscribe side

The WebSocket handler subscribes to channels matching the operator's permitted scopes and forwards events to the browser as JSON frames.

## Event envelope

```json
{
  "topic": "deployments",
  "event": "status_changed",
  "resource_id": "<uuid>",
  "payload": { … },
  "occurred_at": "2026-05-03T12:00:00Z"
}
```
