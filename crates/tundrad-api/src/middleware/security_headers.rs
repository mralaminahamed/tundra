use axum::http::header::{
    CONTENT_SECURITY_POLICY, STRICT_TRANSPORT_SECURITY, X_CONTENT_TYPE_OPTIONS, X_FRAME_OPTIONS,
};
use axum::{extract::Request, middleware::Next, response::Response};

/// Tower middleware that injects security headers on every response.
///
/// - CSP: `default-src 'self'` with narrow allow-lists.
/// - HSTS: 1 year, includeSubDomains, preload-eligible.
/// - X-Content-Type-Options: nosniff (prevents MIME sniffing).
/// - X-Frame-Options: DENY (defense-in-depth alongside CSP `frame-ancestors 'none'`).
pub async fn security_headers(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    let headers = response.headers_mut();

    // CSP: strict same-origin; unsafe-inline for style permits Tailwind/shadcn inline styles.
    // img-src allows data: URIs for base64 avatars; connect-src allows WebSocket (wss:).
    headers.insert(
        CONTENT_SECURITY_POLICY,
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; \
         img-src 'self' data:; connect-src 'self' wss:; font-src 'self'; frame-ancestors 'none'"
            .parse()
            .expect("valid CSP header value"),
    );

    // HSTS: 1 year, include subdomains, preload-eligible (spec §3.3, hard constraint #6).
    headers.insert(
        STRICT_TRANSPORT_SECURITY,
        "max-age=31536000; includeSubDomains; preload"
            .parse()
            .expect("valid HSTS header value"),
    );

    // Prevent MIME-type sniffing attacks.
    headers.insert(
        X_CONTENT_TYPE_OPTIONS,
        "nosniff"
            .parse()
            .expect("valid X-Content-Type-Options value"),
    );

    // Prevent clickjacking (defense-in-depth alongside CSP frame-ancestors).
    headers.insert(
        X_FRAME_OPTIONS,
        "DENY".parse().expect("valid X-Frame-Options value"),
    );

    response
}
