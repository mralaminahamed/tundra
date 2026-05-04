use axum::{
    Json,
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use serde_json::Value;

use crate::schema::tool_catalog;
use crate::server::jsonrpc::{JsonRpcRequest, JsonRpcResponse};

// ── DNS rebinding protection ───────────────────────────────────────────────

/// Check whether the `Origin` header on an MCP HTTP request is acceptable.
///
/// Rules:
/// - `None` (no `Origin` header): allow — non-browser clients (CLI, API tools,
///   MCP host processes) do not send `Origin`.
/// - `http://localhost*` or `http://127.0.0.1*`: always allow — local dev.
/// - Any value present in `allowed_origins`: allow.
/// - Everything else: reject (DNS rebinding / cross-origin attack).
pub fn is_origin_allowed(origin: Option<&str>, allowed_origins: &[&str]) -> bool {
    match origin {
        None => true,
        Some(o) => {
            o.starts_with("http://localhost")
                || o.starts_with("http://127.0.0.1")
                || allowed_origins.contains(&o)
        }
    }
}

/// Tower middleware that enforces `Origin` validation on the MCP HTTP transport
/// to defend against DNS rebinding attacks.
///
/// Requests without an `Origin` header (non-browser MCP clients) are always
/// allowed.  Browser-originated requests must come from localhost or a
/// configured allow-list.
pub async fn dns_rebinding_guard(request: Request, next: Next) -> Response {
    let origin = request
        .headers()
        .get("Origin")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);

    // In production the allow-list is loaded from config; this default permits
    // only localhost origins for out-of-box safety.
    let allowed: &[&str] = &[];

    if !is_origin_allowed(origin.as_deref(), allowed) {
        return StatusCode::FORBIDDEN.into_response();
    }

    next.run(request).await
}

// ── Request handler ────────────────────────────────────────────────────────

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

// ── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod origin_tests {
    use super::*;

    #[test]
    fn localhost_origin_always_allowed() {
        assert!(is_origin_allowed(Some("http://localhost:3000"), &[]));
        assert!(is_origin_allowed(Some("http://localhost"), &[]));
        assert!(is_origin_allowed(Some("http://127.0.0.1:8080"), &[]));
        assert!(is_origin_allowed(Some("http://127.0.0.1"), &[]));
    }

    #[test]
    fn missing_origin_allowed_for_non_browser() {
        assert!(is_origin_allowed(None, &["https://panel.example.com"]));
        assert!(is_origin_allowed(None, &[]));
    }

    #[test]
    fn listed_origin_allowed() {
        assert!(is_origin_allowed(
            Some("https://panel.example.com"),
            &["https://panel.example.com"]
        ));
    }

    #[test]
    fn unlisted_origin_rejected() {
        assert!(!is_origin_allowed(
            Some("https://evil.example.com"),
            &["https://panel.example.com"]
        ));
    }

    #[test]
    fn unlisted_origin_rejected_with_empty_allowlist() {
        assert!(!is_origin_allowed(Some("https://attacker.net"), &[]));
    }

    #[test]
    fn https_localhost_not_allowed_without_explicit_listing() {
        // Only http://localhost and http://127.0.0.1 are auto-allowed;
        // https variants must be explicitly listed (they'd indicate a proxy setup).
        assert!(!is_origin_allowed(Some("https://localhost"), &[]));
    }
}
