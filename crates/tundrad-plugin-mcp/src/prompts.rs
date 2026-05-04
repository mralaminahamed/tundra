use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpPrompt {
    pub name: String,
    pub description: String,
}

pub fn prompt_catalog() -> Vec<McpPrompt> {
    vec![
        McpPrompt {
            name: "diagnose-failed-deploy".into(),
            description: "Diagnose why a deployment failed".into(),
        },
        McpPrompt {
            name: "audit-recent-changes".into(),
            description: "Review recent changes from audit log".into(),
        },
        McpPrompt {
            name: "suggest-cost-optimization".into(),
            description: "Identify underutilized resources".into(),
        },
    ]
}
