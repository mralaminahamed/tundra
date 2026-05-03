pub mod error;
pub mod extractors;
pub mod routes;

use axum::{
    Router,
    routing::{delete, get, post},
};
use routes::ws;
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
        // ── Sites ──────────────────────────────────────────────────────────
        .route(
            "/api/v1/sites",
            get(routes::sites::list).post(routes::sites::create),
        )
        .route(
            "/api/v1/sites/{id}",
            get(routes::sites::get).delete(routes::sites::delete),
        )
        .route(
            "/api/v1/sites/{id}/deployments",
            get(routes::sites::list_deployments).post(routes::sites::trigger_deploy),
        )
        // ── Database servers ───────────────────────────────────────────────
        .route(
            "/api/v1/database-servers",
            get(routes::databases::list_database_servers)
                .post(routes::databases::create_database_server),
        )
        .route(
            "/api/v1/database-servers/{id}",
            get(routes::databases::get_database_server)
                .delete(routes::databases::delete_database_server),
        )
        // ── Databases ──────────────────────────────────────────────────────
        .route(
            "/api/v1/databases",
            get(routes::databases::list_databases).post(routes::databases::create_database),
        )
        .route(
            "/api/v1/databases/{id}",
            get(routes::databases::get_database).delete(routes::databases::delete_database),
        )
        // ── DB users ───────────────────────────────────────────────────────
        .route(
            "/api/v1/db-users",
            get(routes::databases::list_db_users).post(routes::databases::create_db_user),
        )
        .route(
            "/api/v1/db-users/{id}",
            delete(routes::databases::delete_db_user),
        )
        .route(
            "/api/v1/db-users/{id}/grant",
            post(routes::databases::grant_privileges),
        )
        .route(
            "/api/v1/db-users/{id}/revoke",
            post(routes::databases::revoke_privileges),
        )
        .route(
            "/api/v1/db-users/{id}/connection-string",
            get(routes::databases::get_connection_string),
        )
        // ── Backup targets ─────────────────────────────────────────────────
        .route(
            "/api/v1/backups/targets",
            get(routes::backups::list_backup_targets).post(routes::backups::create_backup_target),
        )
        .route(
            "/api/v1/backups/targets/{id}",
            get(routes::backups::get_backup_target).delete(routes::backups::delete_backup_target),
        )
        .route(
            "/api/v1/backups/targets/{id}/test",
            post(routes::backups::test_backup_target),
        )
        // ── Backup jobs ────────────────────────────────────────────────────
        .route(
            "/api/v1/backups/jobs",
            get(routes::backups::list_backup_jobs).post(routes::backups::create_backup_job),
        )
        .route(
            "/api/v1/backups/jobs/{id}",
            get(routes::backups::get_backup_job).delete(routes::backups::delete_backup_job),
        )
        .route(
            "/api/v1/backups/jobs/{id}/run",
            post(routes::backups::run_backup_job_now),
        )
        // ── Backup snapshots ───────────────────────────────────────────────
        .route(
            "/api/v1/backups/snapshots",
            get(routes::backups::list_backup_snapshots),
        )
        .route(
            "/api/v1/backups/snapshots/{id}",
            get(routes::backups::get_backup_snapshot),
        )
        .route(
            "/api/v1/backups/snapshots/{id}/restore",
            post(routes::backups::initiate_restore),
        )
        .route(
            "/api/v1/backups/restores/{id}/confirm",
            post(routes::backups::confirm_restore),
        )
        .route(
            "/api/v1/backups/restores/{id}",
            delete(routes::backups::cancel_restore),
        )
        // ── Audit log ──────────────────────────────────────────────────────
        .route("/api/v1/audit-log", get(routes::audit_log::list))
        // ── WebSocket event gateway ────────────────────────────────────────
        .route("/ws/v1/events", get(ws::handler))
        // ── Middleware ─────────────────────────────────────────────────────
        .layer(TraceLayer::new_for_http())
        .with_state(pool)
}
