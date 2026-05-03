use thiserror::Error;
use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Debug, Error)]
pub enum TelemetryError {
    #[error("tracing subscriber init failed: {0}")]
    Init(String),
}

/// Options forwarded from `tundrad-config`.
pub struct TelemetryOptions {
    /// `RUST_LOG`-style filter directive, e.g. `"info,tundrad=debug"`.
    pub log_level: String,
    /// Emit JSON lines instead of human-readable text.
    pub json: bool,
    /// If set, export spans/metrics to this OTLP gRPC endpoint.
    pub otlp_endpoint: Option<String>,
    pub service_name: String,
}

impl Default for TelemetryOptions {
    fn default() -> Self {
        Self {
            log_level: "info".to_owned(),
            json: false,
            otlp_endpoint: None,
            service_name: "tundrad".to_owned(),
        }
    }
}

/// Initialise tracing-subscriber. Call once at daemon startup before any spans are created.
///
/// When `json = true` emits newline-delimited JSON (suitable for log aggregators).
/// When `otlp_endpoint` is set, a note is printed — full OTLP export requires the
/// `opentelemetry` feature and is wired in P2.
pub fn init(opts: TelemetryOptions) -> Result<(), TelemetryError> {
    // Respect RUST_LOG env var; fall back to opts.log_level.
    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(&opts.log_level));

    if opts.json {
        tracing_subscriber::registry()
            .with(filter)
            .with(fmt::layer().json())
            .try_init()
            .map_err(|e| TelemetryError::Init(e.to_string()))?;
    } else {
        tracing_subscriber::registry()
            .with(filter)
            .with(fmt::layer())
            .try_init()
            .map_err(|e| TelemetryError::Init(e.to_string()))?;
    }

    if let Some(endpoint) = &opts.otlp_endpoint {
        // Full OTLP wiring (opentelemetry + tonic) is deferred to P2.
        tracing::info!(
            endpoint = %endpoint,
            service = %opts.service_name,
            "OTLP endpoint configured — export will be enabled in P2"
        );
    }

    Ok(())
}
