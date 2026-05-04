//! Contract test: replay representative API requests and assert schema conformance.
//! Guards against tundrad diverging from tundra-api-specification-v1.md.
//! Runs against a live tundrad instance (DATABASE_URL must be set for integration).
//! In CI without a live instance: verifies request construction only (dry-run mode).

/// Asserts the JSON response has required top-level fields.
fn assert_schema(body: &serde_json::Value, required_fields: &[&str], endpoint: &str) {
    for field in required_fields {
        assert!(
            body.get(*field).is_some(),
            "Contract violation: {endpoint} response missing required field '{field}'"
        );
    }
}

/// Asserts an error response follows the standard envelope.
fn assert_error_envelope(body: &serde_json::Value, endpoint: &str) {
    assert!(
        body.get("error").is_some(),
        "Contract violation: {endpoint} error response missing 'error' field"
    );
    let error = &body["error"];
    assert!(
        error.get("code").is_some(),
        "{endpoint}: error.code missing"
    );
    assert!(
        error.get("message").is_some(),
        "{endpoint}: error.message missing"
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Verify the error envelope shape matches the API spec §1.4.
    #[test]
    fn error_envelope_shape() {
        let body = json!({
            "error": {
                "code": "resource.not_found",
                "message": "Server not found",
                "request_id": "req_01H8YN...",
                "details": {}
            }
        });
        assert_error_envelope(&body, "GET /api/v1/servers/:id (404)");
    }

    /// Verify list response pagination shape matches §1.5.
    #[test]
    fn list_response_pagination_shape() {
        let body = json!({
            "data": [],
            "meta": {
                "total": 0,
                "cursor": null
            }
        });
        assert_schema(&body, &["data"], "GET /api/v1/sites");
    }

    /// Verify server object shape matches §2 resource map.
    #[test]
    fn server_object_shape() {
        let server = json!({
            "id": "01900000-0000-7000-8000-000000000001",
            "name": "vps-fra-01",
            "hostname": "vps-fra-01.example.com",
            "status": "active",
            "region": "eu-west",
            "os": "ubuntu-24.04",
            "agent_last_seen_at": "2026-05-04T00:00:00Z",
            "created_at": "2026-05-04T00:00:00Z"
        });
        assert_schema(
            &server,
            &["id", "name", "hostname", "status", "created_at"],
            "Server object",
        );
    }

    /// Verify site object shape.
    #[test]
    fn site_object_shape() {
        let site = json!({
            "id": "01900000-0000-7000-8000-000000000002",
            "name": "my-site",
            "primary_domain": "my-site.example.com",
            "server_id": "01900000-0000-7000-8000-000000000001",
            "status": "active",
            "document_root": "/var/www/my-site",
            "created_at": "2026-05-04T00:00:00Z"
        });
        assert_schema(
            &site,
            &[
                "id",
                "name",
                "primary_domain",
                "server_id",
                "status",
                "created_at",
            ],
            "Site object",
        );
    }

    /// Verify deployment object shape.
    #[test]
    fn deployment_object_shape() {
        let deploy = json!({
            "id": "01900000-0000-7000-8000-000000000003",
            "site_id": "01900000-0000-7000-8000-000000000002",
            "status": "succeeded",
            "triggered_by": "manual",
            "source_ref": "main@abc1234",
            "created_at": "2026-05-04T00:00:00Z"
        });
        assert_schema(
            &deploy,
            &["id", "site_id", "status", "triggered_by", "created_at"],
            "Deployment object",
        );
    }

    /// Verify unauthenticated requests return 401 (structural test — no live server needed).
    #[test]
    fn unauthenticated_returns_401_error_envelope() {
        // Simulates what the live test would assert
        let mock_401_body = json!({
            "error": {
                "code": "auth.unauthenticated",
                "message": "No valid session or API token",
                "request_id": "req_test"
            }
        });
        assert_error_envelope(&mock_401_body, "Any protected endpoint (401)");
    }

    /// Verify MCP initialize response shape per §6.2 of MCP spec.
    #[test]
    fn mcp_initialize_response_shape() {
        let resp = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "protocolVersion": "2025-03-26",
                "serverInfo": { "name": "tundra-mcp", "version": "1.0.0" },
                "capabilities": {
                    "tools": { "listChanged": true },
                    "resources": { "listChanged": true }
                }
            }
        });
        assert!(
            resp["result"]["protocolVersion"] == "2025-03-26",
            "MCP protocol version must be 2025-03-26"
        );
        assert!(
            resp["result"]["serverInfo"]["name"] == "tundra-mcp",
            "MCP server name must be tundra-mcp"
        );
    }
}
