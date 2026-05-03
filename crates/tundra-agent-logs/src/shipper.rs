use tundra_proto::agent::LogLine;

/// Ships log lines from a site/service via the gRPC StreamLogs RPC.
/// P2: stub that constructs `LogLine` values; real file/journal tailing in P3.
pub struct LogShipper {
    site_id: String,
    source: String,
}

impl LogShipper {
    pub fn new(site_id: impl Into<String>, source: impl Into<String>) -> Self {
        Self {
            site_id: site_id.into(),
            source: source.into(),
        }
    }

    pub fn site_id(&self) -> &str {
        &self.site_id
    }

    /// Build a `LogLine` for one log entry (used by the deploy pipeline).
    pub fn emit(&self, level: &str, line: &str) -> LogLine {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        LogLine {
            timestamp_ms: ts,
            level: level.to_owned(),
            line: line.to_owned(),
            source: self.source.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn emit_has_correct_source() {
        let s = LogShipper::new("site-1", "nginx");
        let line = s.emit("info", "hello");
        assert_eq!(line.source, "nginx");
        assert_eq!(line.level, "info");
        assert_eq!(line.line, "hello");
        assert!(line.timestamp_ms > 0);
    }
}
