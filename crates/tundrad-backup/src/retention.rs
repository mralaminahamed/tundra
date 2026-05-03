use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetentionPolicy {
    pub keep_last: Option<u32>,
    pub keep_daily: Option<u32>,
    pub keep_weekly: Option<u32>,
    pub keep_monthly: Option<u32>,
    pub keep_yearly: Option<u32>,
}

impl Default for RetentionPolicy {
    fn default() -> Self {
        Self {
            keep_last: None,
            keep_daily: Some(30),
            keep_weekly: Some(8),
            keep_monthly: Some(12),
            keep_yearly: Some(3),
        }
    }
}

impl RetentionPolicy {
    pub fn to_restic_flags(&self) -> Vec<String> {
        let mut flags = Vec::new();
        if let Some(n) = self.keep_last {
            flags.push("--keep-last".into());
            flags.push(n.to_string());
        }
        if let Some(n) = self.keep_daily {
            flags.push("--keep-daily".into());
            flags.push(n.to_string());
        }
        if let Some(n) = self.keep_weekly {
            flags.push("--keep-weekly".into());
            flags.push(n.to_string());
        }
        if let Some(n) = self.keep_monthly {
            flags.push("--keep-monthly".into());
            flags.push(n.to_string());
        }
        if let Some(n) = self.keep_yearly {
            flags.push("--keep-yearly".into());
            flags.push(n.to_string());
        }
        flags
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_policy_has_daily() {
        let p = RetentionPolicy::default();
        assert_eq!(p.keep_daily, Some(30));
    }

    #[test]
    fn to_restic_flags_includes_keep_daily() {
        let p = RetentionPolicy {
            keep_daily: Some(7),
            ..Default::default()
        };
        let flags = p.to_restic_flags();
        assert!(flags.contains(&"--keep-daily".to_string()));
        assert!(flags.contains(&"7".to_string()));
    }
}
