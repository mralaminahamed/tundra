pub mod error;
pub mod extractors;
pub mod routes;

use axum::{
    Router,
    routing::{delete, get, post},
};
use tower_http::trace::TraceLayer;
use tundrad_repo::PgPool;

/// Build the complete Axum router. `state` is the `PgPool` injected into every handler.
pub fn router(pool: PgPool) -> Router {
    Router::new()
        // ── Probes ─────────────────────────────────────────────────────────
        .route("/healthz", get(routes::health::healthz))
        .route("/readyz", get(routes::health::readyz))
        // ── Auth ───────────────────────────────────────────────────────────
        .route("/api/v1/auth/login", post(routes::auth::login))
        .route("/api/v1/auth/logout", post(routes::auth::logout))
        // ── Operators ──────────────────────────────────────────────────────
        .route("/api/v1/operators", get(routes::operators::list))
        .route("/api/v1/operators", post(routes::operators::invite))
        .route("/api/v1/operators/me", get(routes::operators::get_me))
        .route("/api/v1/operators/{id}", delete(routes::operators::delete))
        // ── API tokens ─────────────────────────────────────────────────────
        .route(
            "/api/v1/operators/me/tokens",
            get(routes::tokens::list).post(routes::tokens::create),
        )
        .route(
            "/api/v1/operators/me/tokens/{token_id}",
            delete(routes::tokens::revoke),
        )
        // ── Servers ────────────────────────────────────────────────────────
        .route(
            "/api/v1/servers",
            get(routes::servers::list).post(routes::servers::create),
        )
        .route(
            "/api/v1/servers/{id}",
            get(routes::servers::get).delete(routes::servers::delete),
        )
        // ── Audit log ──────────────────────────────────────────────────────
        .route("/api/v1/audit-log", get(routes::audit_log::list))
        // ── Middleware ─────────────────────────────────────────────────────
        .layer(TraceLayer::new_for_http())
        .with_state(pool)
}
