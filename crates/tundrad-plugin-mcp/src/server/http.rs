use axum::{Json, response::IntoResponse};
use serde_json::Value;

use crate::schema::tool_catalog;
use crate::server::jsonrpc::{JsonRpcRequest, JsonRpcResponse};

/// POST /mcp — handles JSON-RPC requests
pub async fn handle_post(Json(req): Json<JsonRpcRequest>) -> impl IntoResponse {
    let response = dispatch_method(&req);
    Json(response)
}

fn dispatch_method(req: &JsonRpcRequest) -> JsonRpcResponse {
    match req.method.as_str() {
        "initialize" => handle_initialize(req),
        "notifications/initialized" => JsonRpcResponse::ok(req.id.clone(), Value::Null),
        "tools/list" => handle_tools_list(req),
        "tools/call" => handle_tools_call(req),
        "shutdown" => JsonRpcResponse::ok(req.id.clone(), Value::Null),
        _ => JsonRpcResponse::error(req.id.clone(), -32601, "Method not found"),
    }
}

fn handle_initialize(req: &JsonRpcRequest) -> JsonRpcResponse {
    JsonRpcResponse::ok(
        req.id.clone(),
        serde_json::json!({
            "protocolVersion": "2025-03-26",
            "serverInfo": {
                "name": "tundra-mcp",
                "version": "1.0.0",
                "vendor": "Tundra (Al Amin Ahamed)"
            },
            "capabilities": {
                "tools": { "listChanged": true },
                "resources": { "listChanged": true, "subscribe": true },
                "prompts": { "listChanged": false },
                "logging": {}
            },
            "instructions": "This is the Tundra MCP server. Tools are scoped by the API token's MCP scopes and the session mode."
        }),
    )
}

fn handle_tools_list(req: &JsonRpcRequest) -> JsonRpcResponse {
    // Default to read-only catalog for safety; real impl reads session from token
    let tools = tool_catalog(&["mcp:read".to_string()], "read");
    JsonRpcResponse::ok(req.id.clone(), serde_json::json!({ "tools": tools }))
}

fn handle_tools_call(req: &JsonRpcRequest) -> JsonRpcResponse {
    let params = req.params.as_ref().and_then(|p| p.as_object());
    let tool_name = params
        .and_then(|p| p.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    match tool_name {
        "list_servers" => JsonRpcResponse::ok(
            req.id.clone(),
            serde_json::json!({
                "content": [{ "type": "text", "text": "Tool stub: list_servers. Connect to a live tundrad instance for real results." }],
                "isError": false
            }),
        ),
        _ => JsonRpcResponse::error(req.id.clone(), -32601, format!("Unknown tool: {tool_name}")),
    }
}
