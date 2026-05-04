use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolSchema {
    pub name: String,
    pub description: String,
    #[serde(rename = "inputSchema")]
    pub input_schema: Value,
}

/// Generate the full tool catalog for a given (token_scopes, session_mode).
pub fn tool_catalog(scopes: &[String], mode: &str) -> Vec<McpToolSchema> {
    let mut tools = read_tools();
    if mode == "write" {
        // Add safe-write tools if scope allows
        if scopes
            .iter()
            .any(|s| s == "mcp:write:safe" || s == "mcp:write" || s == "mcp:admin")
        {
            tools.extend(safe_write_tools());
        }
        // Add write tools
        if scopes.iter().any(|s| s == "mcp:write" || s == "mcp:admin") {
            tools.extend(write_tools());
        }
        // Add admin tools
        if scopes.iter().any(|s| s == "mcp:admin") {
            tools.extend(admin_tools());
        }
    }
    tools
}

fn read_tools() -> Vec<McpToolSchema> {
    vec![
        McpToolSchema {
            name: "list_servers".into(),
            description: "List all Tundra-managed servers with status and capabilities".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "status_filter": {
                        "type": "string",
                        "enum": ["any", "active", "degraded", "offline"],
                        "default": "any"
                    }
                },
                "additionalProperties": false
            }),
        },
        McpToolSchema {
            name: "list_sites".into(),
            description: "List all sites, filterable by server, application type, or status".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "server_id": { "type": "string", "format": "uuid" },
                    "status": { "type": "string", "enum": ["active", "provisioning", "suspended", "failed"] },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 200, "default": 50 }
                },
                "additionalProperties": false
            }),
        },
        McpToolSchema {
            name: "get_site".into(),
            description: "Full site detail including domain, application, recent deployments, env var keys, TLS expiry".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "site_id": { "type": "string", "format": "uuid" }
                },
                "required": ["site_id"],
                "additionalProperties": false
            }),
        },
        McpToolSchema {
            name: "get_audit_log".into(),
            description: "Recent entries from the Tundra audit log with filtering".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "since": { "type": "string", "format": "date-time" },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 500, "default": 100 }
                },
                "additionalProperties": false
            }),
        },
        McpToolSchema {
            name: "get_deployment_status".into(),
            description: "Status of a specific deployment with build log".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "deployment_id": { "type": "string", "format": "uuid" }
                },
                "required": ["deployment_id"],
                "additionalProperties": false
            }),
        },
    ]
}

fn safe_write_tools() -> Vec<McpToolSchema> {
    vec![
        McpToolSchema {
            name: "restart_service".into(),
            description: "Restart a managed service on a server".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "server_id": { "type": "string", "format": "uuid" },
                    "service": { "type": "string" }
                },
                "required": ["server_id", "service"],
                "additionalProperties": false
            }),
        },
        McpToolSchema {
            name: "renew_certificate".into(),
            description: "Trigger ACME renewal for a certificate".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "certificate_id": { "type": "string", "format": "uuid" }
                },
                "required": ["certificate_id"],
                "additionalProperties": false
            }),
        },
    ]
}

fn write_tools() -> Vec<McpToolSchema> {
    vec![
        McpToolSchema {
            name: "deploy_site".into(),
            description: "Trigger a deployment for a site".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "site_id": { "type": "string", "format": "uuid" },
                    "ref": { "type": "string" }
                },
                "required": ["site_id"],
                "additionalProperties": false
            }),
        },
        McpToolSchema {
            name: "set_environment_variable".into(),
            description: "Add or update an environment variable for a site".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "site_id": { "type": "string", "format": "uuid" },
                    "key": { "type": "string" },
                    "value": { "type": "string" },
                    "is_secret": { "type": "boolean", "default": true }
                },
                "required": ["site_id", "key", "value"],
                "additionalProperties": false
            }),
        },
    ]
}

fn admin_tools() -> Vec<McpToolSchema> {
    vec![McpToolSchema {
        name: "invite_operator".into(),
        description:
            "Send an operator invitation. Requires mcp:admin scope and step-up authentication."
                .into(),
        input_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "email": { "type": "string", "format": "email" },
                "role": { "type": "string", "enum": ["admin", "operator", "readonly"] }
            },
            "required": ["email", "role"],
            "additionalProperties": false
        }),
    }]
}
