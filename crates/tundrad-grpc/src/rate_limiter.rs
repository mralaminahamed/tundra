//! Per-agent token-bucket rate limiter with circuit breaker.
//!
//! Security spec §4.3 mandates:
//!   - 100 RPS for Heartbeat RPCs
//!   - 10  RPS for all other RPCs
//!
//! A "sustained breach" is defined as exceeding the per-window limit for
//! `BREACH_THRESHOLD` consecutive `BREACH_WINDOW_SECS`-second windows.
//! When the circuit opens the caller must call `AgentCredentialsRepo::suspend_agent`
//! and return `Status::resource_exhausted`.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use uuid::Uuid;

const HEARTBEAT_LIMIT_RPS: u32 = 100;
const OTHER_RPS_LIMIT: u32 = 10;
/// Length of each counting window in seconds.
const BREACH_WINDOW_SECS: u64 = 10;
/// Number of consecutive windows that must exceed the limit before the circuit opens.
const BREACH_THRESHOLD: u32 = 3;

/// Which RPC family a call belongs to — determines which rate limit applies.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RpcKind {
    Heartbeat,
    Other,
}

impl RpcKind {
    /// Maximum allowed calls within a single `BREACH_WINDOW_SECS` window.
    fn window_limit(self) -> u32 {
        match self {
            RpcKind::Heartbeat => HEARTBEAT_LIMIT_RPS * BREACH_WINDOW_SECS as u32,
            RpcKind::Other => OTHER_RPS_LIMIT * BREACH_WINDOW_SECS as u32,
        }
    }
}

/// Per-agent sliding-window counter.
#[derive(Debug)]
struct AgentWindow {
    /// When the current window started.
    window_start: Instant,
    /// Calls counted in the current window.
    count: u32,
    /// How many consecutive windows have exceeded the limit.
    consecutive_violations: u32,
    /// Whether the current window was opened because of a violation (not natural expiry).
    /// Used to prevent the "first call of new window" path from resetting the violation
    /// streak when the window was just reset mid-burst.
    opened_by_violation: bool,
}

impl AgentWindow {
    fn new(now: Instant) -> Self {
        Self {
            window_start: now,
            count: 0,
            consecutive_violations: 0,
            opened_by_violation: false,
        }
    }
}

/// Thread-safe, per-agent rate limiter.
pub struct AgentRateLimiter {
    state: Mutex<HashMap<Uuid, AgentWindow>>,
}

impl AgentRateLimiter {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(HashMap::new()),
        }
    }

    /// Record one call for `agent_id` with kind `kind`.
    ///
    /// Returns `Ok(())` if the call is within limits.
    /// Returns `Err(())` if `consecutive_violations >= BREACH_THRESHOLD` (circuit open).
    ///
    /// The caller is responsible for suspending the agent and returning an appropriate
    /// gRPC error when `Err(())` is received.
    pub fn check(&self, agent_id: Uuid, kind: RpcKind) -> Result<(), ()> {
        let now = Instant::now();
        let window_dur = Duration::from_secs(BREACH_WINDOW_SECS);

        let mut map = self.state.lock().expect("rate limiter mutex poisoned");
        let window = map.entry(agent_id).or_insert_with(|| AgentWindow::new(now));

        // Roll over to a new window if the current one has expired naturally (time-based).
        if now.duration_since(window.window_start) >= window_dur {
            // If the expiring window was opened by a violation, the streak was already
            // incremented when that violation fired; a time-based rollover from such a
            // window is still part of the breach sequence, so we leave the streak alone.
            // Only reset the streak when the previous window ran to completion cleanly.
            if !window.opened_by_violation {
                window.consecutive_violations = 0;
            }
            window.window_start = now;
            window.count = 0;
            window.opened_by_violation = false;
        }

        window.count += 1;

        if window.count > kind.window_limit() {
            // This window is a violation: increment the streak and immediately open a
            // fresh window so the next burst of calls is counted in a new window.
            window.consecutive_violations += 1;
            window.window_start = now;
            window.count = 0;
            window.opened_by_violation = true;
        }

        if window.consecutive_violations >= BREACH_THRESHOLD {
            Err(())
        } else {
            Ok(())
        }
    }
}

impl Default for AgentRateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: call `check` `n` times quickly (within one window) for a given agent.
    fn burst(limiter: &AgentRateLimiter, id: Uuid, kind: RpcKind, n: u32) -> Result<(), ()> {
        let mut last = Ok(());
        for _ in 0..n {
            last = limiter.check(id, kind);
        }
        last
    }

    #[test]
    fn heartbeat_within_limit_passes() {
        let limiter = AgentRateLimiter::new();
        let id = Uuid::now_v7();
        // Send exactly the window limit worth of calls — should all pass.
        let window_limit = HEARTBEAT_LIMIT_RPS * BREACH_WINDOW_SECS as u32;
        let result = burst(&limiter, id, RpcKind::Heartbeat, window_limit);
        assert_eq!(result, Ok(()));
    }

    #[test]
    fn heartbeat_over_limit_increments_violations() {
        let limiter = AgentRateLimiter::new();
        let id = Uuid::now_v7();
        let window_limit = HEARTBEAT_LIMIT_RPS * BREACH_WINDOW_SECS as u32;
        // Exceed the limit by one — this should increment violations but NOT open the circuit
        // (only 1 violation < BREACH_THRESHOLD).
        let _result = burst(&limiter, id, RpcKind::Heartbeat, window_limit + 1);
        let map = limiter.state.lock().unwrap();
        let w = map.get(&id).expect("window should exist");
        assert_eq!(
            w.consecutive_violations, 1,
            "should have exactly 1 violation"
        );
    }

    #[test]
    fn sustained_breach_trips_circuit() {
        let limiter = AgentRateLimiter::new();
        let id = Uuid::now_v7();
        let window_limit = HEARTBEAT_LIMIT_RPS * BREACH_WINDOW_SECS as u32;
        // Fire BREACH_THRESHOLD rounds of over-limit calls; each round resets the window.
        let mut result = Ok(());
        for _ in 0..BREACH_THRESHOLD {
            // window_limit + 1 ensures we exceed the limit, triggering violation + window reset.
            result = burst(&limiter, id, RpcKind::Heartbeat, window_limit + 1);
        }
        // After BREACH_THRESHOLD violations the circuit must be open.
        assert_eq!(
            result,
            Err(()),
            "circuit should be open after sustained breach"
        );
    }

    #[test]
    fn different_agents_isolated() {
        let limiter = AgentRateLimiter::new();
        let a = Uuid::now_v7();
        let b = Uuid::now_v7();
        let window_limit = HEARTBEAT_LIMIT_RPS * BREACH_WINDOW_SECS as u32;

        // Exhaust agent A's circuit.
        for _ in 0..BREACH_THRESHOLD {
            let _ = burst(&limiter, a, RpcKind::Heartbeat, window_limit + 1);
        }

        // Agent B should still be clean.
        let result_b = limiter.check(b, RpcKind::Heartbeat);
        assert_eq!(
            result_b,
            Ok(()),
            "agent B should be unaffected by agent A's violations"
        );
    }
}
