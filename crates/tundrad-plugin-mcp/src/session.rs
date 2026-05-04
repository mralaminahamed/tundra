use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpSession {
    pub id: Uuid,
    pub token_id: i64,
    pub transport: String,
    pub mode: String,
    pub client_name: Option<String>,
    pub client_version: Option<String>,
    pub scopes: Vec<String>,
}

impl McpSession {
    pub fn is_write_mode(&self) -> bool {
        self.mode == "write"
    }
}
