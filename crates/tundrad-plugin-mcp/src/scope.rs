/// Token scopes in ascending order of privilege.
pub const SCOPE_READ: &str = "mcp:read";
pub const SCOPE_WRITE_SAFE: &str = "mcp:write:safe";
pub const SCOPE_WRITE: &str = "mcp:write";
pub const SCOPE_ADMIN: &str = "mcp:admin";

/// Return the effective tool set based on token scopes and session mode.
/// Read-mode sessions only see read tools regardless of token scope.
pub fn effective_mode(token_scopes: &[String], session_mode: &str) -> &'static str {
    if session_mode == "write"
        && token_scopes
            .iter()
            .any(|s| s == SCOPE_WRITE_SAFE || s == SCOPE_WRITE || s == SCOPE_ADMIN)
    {
        "write"
    } else {
        "read"
    }
}

pub fn scope_ceiling(scopes: &[String]) -> &'static str {
    if scopes.iter().any(|s| s == SCOPE_ADMIN) {
        "admin"
    } else if scopes.iter().any(|s| s == SCOPE_WRITE) {
        "write"
    } else if scopes.iter().any(|s| s == SCOPE_WRITE_SAFE) {
        "write:safe"
    } else {
        "read"
    }
}
