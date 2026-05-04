use axum::{
    extract::Request,
    http::{Method, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};

const CSRF_HEADER: &str = "X-CSRF-Token";
const CSRF_COOKIE: &str = "tundra_csrf";

/// Middleware that validates CSRF double-submit token on state-changing methods.
///
/// For GET/HEAD/OPTIONS: pass through unconditionally.
/// For POST/PUT/PATCH/DELETE: require the `X-CSRF-Token` header to match the
/// `tundra_csrf` cookie value (double-submit pattern).
///
/// Paths that use non-cookie auth are exempted:
/// - `/api/v1/auth/*`  — login bootstrap; no pre-existing cookie yet.
/// - `/mcp`            — Bearer-token auth, not session cookies.
/// - `/healthz`, `/readyz` — probe endpoints.
/// - `/api/v1/webhooks/*` — HMAC-validated externally.
///
/// Primary CSRF defence is `SameSite=Strict` on the session cookie (set in
/// `routes::auth`).  This middleware adds a defence-in-depth double-submit
/// layer for browsers that do not yet enforce SameSite.
pub async fn csrf_protection(request: Request, next: Next) -> Response {
    let method = request.method().clone();
    let path = request.uri().path().to_owned();

    // Safe (read-only) methods are exempt from CSRF checks.
    if matches!(method, Method::GET | Method::HEAD | Method::OPTIONS) {
        return next.run(request).await;
    }

    // Paths that rely on non-cookie authentication are exempt.
    let exempt_prefixes = [
        "/api/v1/auth/",
        "/mcp",
        "/healthz",
        "/readyz",
        "/api/v1/webhooks/",
    ];
    if exempt_prefixes.iter().any(|p| path.starts_with(p)) {
        return next.run(request).await;
    }

    // Extract the X-CSRF-Token header and the tundra_csrf cookie, then compare.
    let header_token = request
        .headers()
        .get(CSRF_HEADER)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);

    let cookie_token = request
        .headers()
        .get("Cookie")
        .and_then(|v| v.to_str().ok())
        .and_then(|cookies| {
            cookies.split(';').find_map(|pair| {
                let pair = pair.trim();
                pair.strip_prefix(CSRF_COOKIE)
                    .and_then(|rest| rest.strip_prefix('='))
                    .map(str::to_owned)
            })
        });

    match (header_token, cookie_token) {
        // Both present and equal: allow.
        (Some(h), Some(c)) if h == c => next.run(request).await,
        // Header absent but cookie also absent: SameSite=Strict is the primary guard;
        // allow API clients (CLI, curl) that don't carry cookies at all.
        (None, None) => next.run(request).await,
        // Mismatch or missing token when cookie is present: reject.
        _ => StatusCode::FORBIDDEN.into_response(),
    }
}
