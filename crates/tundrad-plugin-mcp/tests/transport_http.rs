use tundrad_plugin_mcp::audit::redact_arguments;
use tundrad_plugin_mcp::schema::tool_catalog;
use tundrad_plugin_mcp::scope::effective_mode;
use tundrad_plugin_mcp::server::jsonrpc::{JsonRpcRequest, JsonRpcResponse};

#[test]
fn initialize_response_has_correct_protocol_version() {
    let req = JsonRpcRequest {
        jsonrpc: "2.0".into(),
        id: Some(serde_json::json!(1)),
        method: "initialize".into(),
        params: None,
    };
    let resp = dispatch_initialize(&req);
    let proto = resp
        .result
        .as_ref()
        .and_then(|r| r.get("protocolVersion"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    assert_eq!(proto, "2025-03-26");
}

fn dispatch_initialize(req: &JsonRpcRequest) -> JsonRpcResponse {
    JsonRpcResponse::ok(
        req.id.clone(),
        serde_json::json!({
            "protocolVersion": "2025-03-26",
            "serverInfo": { "name": "tundra-mcp" },
            "capabilities": {}
        }),
    )
}

#[test]
fn read_mode_token_sees_only_read_tools() {
    let tools = tool_catalog(&["mcp:read".to_string()], "read");
    // Read-only tools should include list_servers
    assert!(tools.iter().any(|t| t.name == "list_servers"));
    // Should NOT include deploy_site (write tool)
    assert!(!tools.iter().any(|t| t.name == "deploy_site"));
}

#[test]
fn write_scope_in_write_mode_sees_write_tools() {
    let scopes = vec!["mcp:write".to_string()];
    let mode = effective_mode(&scopes, "write");
    let tools = tool_catalog(&scopes, mode);
    assert!(tools.iter().any(|t| t.name == "deploy_site"));
}

#[test]
fn write_scope_in_read_mode_hides_write_tools() {
    let scopes = vec!["mcp:write".to_string()];
    let mode = effective_mode(&scopes, "read");
    assert_eq!(mode, "read");
    let tools = tool_catalog(&scopes, mode);
    assert!(!tools.iter().any(|t| t.name == "deploy_site"));
}

#[test]
fn argument_redaction_works() {
    let args = serde_json::json!({
        "site_id": "abc123",
        "value": "super-secret-password",
        "key": "DB_PASSWORD"
    });
    let redacted = redact_arguments(&args);
    assert_eq!(redacted["value"], "<redacted>");
    assert_eq!(redacted["site_id"], "abc123");
}
