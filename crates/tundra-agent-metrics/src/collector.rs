use std::sync::Mutex;
use sysinfo::System;
use tundra_proto::agent::{MetricPoint, MetricsSample};

pub struct MetricsCollector {
    server_id: String,
    sys: Mutex<System>,
}

impl MetricsCollector {
    pub fn new(server_id: impl Into<String>) -> Self {
        Self {
            server_id: server_id.into(),
            sys: Mutex::new(System::new()),
        }
    }

    /// Collect a snapshot and return a `MetricsSample` ready for the gRPC stream.
    pub fn collect(&self) -> MetricsSample {
        let mut sys = self.sys.lock().expect("metrics lock poisoned");
        sys.refresh_cpu_usage();
        sys.refresh_memory();

        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        let cpu_pct = if sys.cpus().is_empty() {
            0.0
        } else {
            sys.cpus().iter().map(|c| c.cpu_usage() as f64).sum::<f64>() / sys.cpus().len() as f64
        };

        MetricsSample {
            server_id: self.server_id.clone(),
            timestamp_ms: ts,
            points: vec![
                MetricPoint {
                    name: "cpu.usage_pct".into(),
                    value: cpu_pct,
                    labels: Default::default(),
                },
                MetricPoint {
                    name: "mem.used_bytes".into(),
                    value: sys.used_memory() as f64,
                    labels: Default::default(),
                },
                MetricPoint {
                    name: "mem.total_bytes".into(),
                    value: sys.total_memory() as f64,
                    labels: Default::default(),
                },
            ],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collector_returns_sample_with_correct_server_id() {
        let c = MetricsCollector::new("server-abc");
        let s = c.collect();
        assert_eq!(s.server_id, "server-abc");
        assert!(s.points.len() >= 2);
        assert!(s.timestamp_ms > 0);
    }
}
