//! `tundrad-grpc` — Tonic gRPC service implementations for the Tundra control plane.
//!
//! # Rate limiting and circuit breaker (security spec §4.3)
//!
//! Every incoming agent RPC is gated by [`AgentRateLimiter`]:
//!
//! - Heartbeat calls: 100 RPS per agent
//! - All other RPCs: 10 RPS per agent
//!
//! After `BREACH_THRESHOLD` (3) consecutive 10-second windows in which the
//! per-kind limit is exceeded, the limiter returns `Err(())` (circuit open).
//! The gRPC handler must then:
//!   1. Call `AgentCredentialsRepo::suspend_agent(server_id, "rate_limit_circuit_open")`
//!   2. Return `Status::resource_exhausted("rate limit exceeded — agent suspended")`
//!
//! Recovery is an explicit operator action via
//! `POST /api/v1/servers/:id/reinstate-agent`.

pub mod rate_limiter;

pub use rate_limiter::{AgentRateLimiter, RpcKind};

use std::sync::Arc;

/// Shared state held by the gRPC server — one instance for the lifetime of the process.
///
/// `tundrad-bin` constructs this and passes it to the Tonic server builder.
/// The full `tundra.agent.v1.Agent` service implementation will embed this struct
/// once the generated Tonic stubs from `tundra-proto` are wired in.
pub struct AgentServiceState {
    /// Per-agent rate limiter; `Arc`-wrapped so it can be shared across
    /// the Tonic service clone boundary.
    pub limiter: Arc<AgentRateLimiter>,
}

impl AgentServiceState {
    pub fn new() -> Self {
        Self {
            limiter: Arc::new(AgentRateLimiter::new()),
        }
    }

    /// Gate an incoming RPC.
    ///
    /// Returns `Ok(())` when the call may proceed.
    /// Returns `Err(())` when the circuit has opened and the agent must be suspended.
    ///
    /// # Usage in a real Heartbeat handler
    ///
    /// ```rust,ignore
    /// // Inside `impl AgentService for AgentServiceState`:
    /// async fn heartbeat(&self, request: Request<HeartbeatRequest>) -> Result<Response<HeartbeatResponse>, Status> {
    ///     let agent_id = /* extract from mTLS cert or metadata */;
    ///     if self.check_rate(agent_id, RpcKind::Heartbeat).is_err() {
    ///         // TODO: call AgentCredentialsRepo::suspend_agent(server_id, "rate_limit_circuit_open")
    ///         return Err(Status::resource_exhausted("rate limit exceeded — agent suspended"));
    ///     }
    ///     // ... real handler logic ...
    /// }
    /// ```
    pub fn check_rate(&self, agent_id: uuid::Uuid, kind: RpcKind) -> Result<(), ()> {
        self.limiter.check(agent_id, kind)
    }
}

impl Default for AgentServiceState {
    fn default() -> Self {
        Self::new()
    }
}
