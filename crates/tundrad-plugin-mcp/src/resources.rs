use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpResource {
    pub uri: String,
    pub name: String,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
}

pub fn resource_catalog() -> Vec<McpResource> {
    vec![
        McpResource {
            uri: "tundra://sites/{site_id}/logs/recent".into(),
            name: "Recent logs".into(),
            mime_type: "text/plain".into(),
        },
        McpResource {
            uri: "tundra://audit-log/recent".into(),
            name: "Recent audit log".into(),
            mime_type: "application/json".into(),
        },
    ]
}
