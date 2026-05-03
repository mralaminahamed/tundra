# tundrad-telemetry

Observability initialisation for the Tundra control plane: structured logging via `tracing-subscriber`, with optional OTLP export (P2).

## Usage

```rust
use tundrad_telemetry::{TelemetryOptions, init};

init(TelemetryOptions {
    log_level: "info,tundrad=debug".into(),
    json: true,                                      // newline-delimited JSON in prod
    otlp_endpoint: Some("http://otel:4317".into()),  // optional; full wiring in P2
    service_name: "tundrad".into(),
})?;
```

## Log format

**Development** (`json = false`): human-readable, coloured output via `tracing-subscriber` fmt layer.

**Production** (`json = true`): newline-delimited JSON compatible with Loki, Elasticsearch, and most log aggregators.

## Filter precedence

1. `RUST_LOG` environment variable (highest — allows per-deployment overrides)
2. `TelemetryOptions::log_level` field (fallback)

## OTLP (P2)

Full span export to an OpenTelemetry collector via gRPC (`opentelemetry-otlp` + Tonic) is deferred to Phase 2. Setting `otlp_endpoint` in P1 logs an informational message and has no other effect.
