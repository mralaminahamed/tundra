pub mod audit_redact;
pub mod error;
pub mod extractors;
pub mod middleware;
pub mod routes;
pub mod serde_util;
pub mod ssh_installer;
pub mod templates;

use axum::{
    Router, middleware as axum_middleware,
    routing::{delete, get, patch, post, put},
};
use middleware::security_headers::security_headers as security_headers_mw;
use routes::ws;
use tower_http::trace::TraceLayer;
use tundrad_plugin_mcp::server::http::handle_post as mcp_post;
use tundrad_repo::PgPool;

/// Build the complete Axum router. `state` is the `PgPool` injected into every handler.
pub fn router(pool: PgPool) -> Router {
    Router::new()
        // ── Probes ─────────────────────────────────────────────────────────
        .route("/healthz", get(routes::health::healthz))
        .route("/readyz", get(routes::health::readyz))
        // ── Templates ──────────────────────────────────────────────────────
        .route("/api/v1/templates", get(routes::templates::list))
        // ── Auth ───────────────────────────────────────────────────────────
        .route("/api/v1/auth/login", post(routes::auth::login))
        .route("/api/v1/auth/logout", post(routes::auth::logout))
        .route("/api/v1/auth/totp/setup", get(routes::auth::totp_setup))
        .route("/api/v1/auth/totp/enable", post(routes::auth::totp_enable))
        .route("/api/v1/auth/totp", delete(routes::auth::totp_disable))
        .route("/api/v1/auth/totp/verify", post(routes::auth::totp_verify))
        .route(
            "/api/v1/auth/passkey/challenge",
            post(routes::auth::passkey_challenge),
        )
        .route(
            "/api/v1/auth/passkey/verify",
            post(routes::auth::passkey_verify),
        )
        // ── Operators ──────────────────────────────────────────────────────
        .route("/api/v1/operators", get(routes::operators::list))
        .route("/api/v1/operators", post(routes::operators::invite))
        .route("/api/v1/operators/me", get(routes::operators::get_me))
        .route(
            "/api/v1/operators/me/passkeys/challenge",
            post(routes::operators::passkey_register_challenge),
        )
        .route(
            "/api/v1/operators/me/passkeys/register",
            post(routes::operators::passkey_register),
        )
        .route(
            "/api/v1/operators/me/passkeys",
            get(routes::operators::passkeys_list),
        )
        .route(
            "/api/v1/operators/me/passkeys/{id}",
            delete(routes::operators::passkey_delete),
        )
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
            "/api/v1/servers/{server_id}",
            get(routes::servers::get)
                .delete(routes::servers::delete)
                .patch(routes::servers::update_server),
        )
        .route(
            "/api/v1/servers/metrics-state",
            get(routes::servers::metrics_state),
        )
        .route(
            "/api/v1/servers/suggest",
            get(routes::servers::suggest_server),
        )
        .route(
            "/api/v1/servers/wizard/fingerprint",
            post(routes::servers::wizard_fingerprint),
        )
        .route(
            "/api/v1/servers/wizard/install",
            post(routes::servers::wizard_install),
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
        // ── Site file manager ──────────────────────────────────────────────
        .route(
            "/api/v1/sites/{site_id}/files",
            get(routes::files::list_dir).delete(routes::files::delete_entry),
        )
        .route(
            "/api/v1/sites/{site_id}/files/content",
            get(routes::files::read_file).put(routes::files::write_file),
        )
        .route(
            "/api/v1/sites/{site_id}/files/mkdir",
            post(routes::files::mkdir),
        )
        .route(
            "/api/v1/sites/{site_id}/files/touch",
            post(routes::files::touch),
        )
        .route(
            "/api/v1/sites/{site_id}/files/rename",
            post(routes::files::rename_entry),
        )
        .route(
            "/api/v1/sites/{site_id}/files/chmod",
            post(routes::files::chmod_entry),
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
        // ── Domains ────────────────────────────────────────────────────────
        .route(
            "/api/v1/domains",
            get(routes::domains::list_domains).post(routes::domains::create_domain),
        )
        .route(
            "/api/v1/domains/{id}",
            get(routes::domains::get_domain).delete(routes::domains::delete_domain),
        )
        .route(
            "/api/v1/domains/{id}/dns-records",
            get(routes::domains::list_dns_records).post(routes::domains::create_dns_record),
        )
        .route(
            "/api/v1/domains/{id}/dns-records/batch",
            post(routes::domains::batch_update_dns_records),
        )
        .route(
            "/api/v1/domains/{id}/dns-records/{record_id}",
            put(routes::domains::update_dns_record).delete(routes::domains::delete_dns_record),
        )
        // ── Mail domains ───────────────────────────────────────────────────
        .route(
            "/api/v1/mail/domains",
            get(routes::mail::list_mail_domains).post(routes::mail::create_mail_domain),
        )
        .route(
            "/api/v1/mail/domains/{id}",
            get(routes::mail::get_mail_domain).delete(routes::mail::delete_mail_domain),
        )
        .route(
            "/api/v1/mail/domains/{id}/regenerate-dkim",
            post(routes::mail::regenerate_dkim),
        )
        .route(
            "/api/v1/mail/domains/{id}/mailboxes",
            get(routes::mail::list_mailboxes),
        )
        .route(
            "/api/v1/mail/domains/{id}/aliases",
            get(routes::mail::list_aliases),
        )
        .route("/api/v1/mail/mailboxes", post(routes::mail::create_mailbox))
        .route(
            "/api/v1/mail/mailboxes/{id}",
            delete(routes::mail::delete_mailbox),
        )
        .route(
            "/api/v1/mail/mailboxes/{id}/reset-password",
            post(routes::mail::reset_mailbox_password),
        )
        .route("/api/v1/mail/aliases", post(routes::mail::create_alias))
        .route(
            "/api/v1/mail/aliases/{id}",
            delete(routes::mail::delete_alias),
        )
        .route("/api/v1/mail/queue", get(routes::mail::list_queue))
        .route("/api/v1/mail/queue/hold", post(routes::mail::queue_hold))
        .route(
            "/api/v1/mail/queue/release",
            post(routes::mail::queue_release),
        )
        .route(
            "/api/v1/mail/queue/delete",
            post(routes::mail::queue_delete),
        )
        // ── Daemons ────────────────────────────────────────────────────────
        .route(
            "/api/v1/sites/{site_id}/daemons",
            get(routes::daemons::list_daemons).post(routes::daemons::create_daemon),
        )
        .route(
            "/api/v1/daemons/{id}",
            get(routes::daemons::get_daemon).delete(routes::daemons::delete_daemon),
        )
        // ── Scheduled tasks ────────────────────────────────────────────────
        .route(
            "/api/v1/sites/{site_id}/scheduled-tasks",
            get(routes::scheduled_tasks::list_scheduled_tasks)
                .post(routes::scheduled_tasks::create_scheduled_task),
        )
        .route(
            "/api/v1/scheduled-tasks/{id}",
            get(routes::scheduled_tasks::get_scheduled_task)
                .delete(routes::scheduled_tasks::delete_scheduled_task),
        )
        // ── Site moves ─────────────────────────────────────────────────────
        .route(
            "/api/v1/sites/{site_id}/actions/move",
            post(routes::site_moves::initiate_site_move),
        )
        .route(
            "/api/v1/sites/{site_id}/moves",
            get(routes::site_moves::list_site_moves),
        )
        .route(
            "/api/v1/site-moves/{move_id}",
            get(routes::site_moves::get_site_move),
        )
        .route(
            "/api/v1/site-moves/{move_id}/abandon",
            post(routes::site_moves::abandon_site_move),
        )
        // ── Plugins ────────────────────────────────────────────────────────
        .route("/api/v1/plugins", get(routes::plugins::list_plugins))
        .route(
            "/api/v1/plugins/available",
            get(routes::plugins::list_available),
        )
        .route(
            "/api/v1/plugins/install",
            post(routes::plugins::install_plugin),
        )
        .route("/api/v1/plugins/{id}", get(routes::plugins::get_plugin))
        .route(
            "/api/v1/plugins/{id}/enable",
            post(routes::plugins::enable_plugin),
        )
        .route(
            "/api/v1/plugins/{id}/disable",
            post(routes::plugins::disable_plugin),
        )
        // ── WordPress ─────────────────────────────────────────────────────────
        .route(
            "/api/v1/wordpress/installations",
            get(routes::wordpress::list_installations).post(routes::wordpress::install_wordpress),
        )
        .route(
            "/api/v1/wordpress/installations/{id}",
            get(routes::wordpress::get_installation)
                .patch(routes::wordpress::patch_installation)
                .delete(routes::wordpress::remove_installation),
        )
        .route(
            "/api/v1/wordpress/installations/{id}/reprovision",
            post(routes::wordpress::reprovision_installation),
        )
        .route(
            "/api/v1/wordpress/installations/{id}/plugins",
            get(routes::wordpress::list_wp_plugins).post(routes::wordpress::install_wp_plugin),
        )
        .route(
            "/api/v1/wordpress/installations/{id}/plugins/{slug}",
            patch(routes::wordpress::patch_wp_plugin).delete(routes::wordpress::remove_wp_plugin),
        )
        .route(
            "/api/v1/wordpress/installations/{id}/themes",
            get(routes::wordpress::list_wp_themes).post(routes::wordpress::install_wp_theme),
        )
        .route(
            "/api/v1/wordpress/installations/{id}/themes/{slug}",
            delete(routes::wordpress::remove_wp_theme),
        )
        .route(
            "/api/v1/wordpress/installations/{id}/themes/{slug}/activate",
            post(routes::wordpress::activate_wp_theme),
        )
        // ── WordPress WP-CLI actions ───────────────────────────────────────
        .route(
            "/api/v1/wordpress/installations/{id}/plugins/{slug}/update",
            post(routes::wp_actions::update_wp_plugin),
        )
        .route(
            "/api/v1/wordpress/installations/{id}/plugins/update-all",
            post(routes::wp_actions::update_all_wp_plugins),
        )
        .route(
            "/api/v1/wordpress/installations/{id}/themes/{slug}/update",
            post(routes::wp_actions::update_wp_theme),
        )
        .route(
            "/api/v1/wordpress/installations/{id}/users",
            get(routes::wp_actions::list_wp_users)
                .post(routes::wp_actions::create_wp_user_handler),
        )
        .route(
            "/api/v1/wordpress/installations/{id}/users/{user_id}",
            delete(routes::wp_actions::delete_wp_user_handler),
        )
        .route(
            "/api/v1/wordpress/installations/{id}/users/{user_id}/set-password",
            post(routes::wp_actions::set_wp_user_password),
        )
        .route(
            "/api/v1/wordpress/installations/{id}/database/optimize",
            post(routes::wp_actions::optimize_wp_db),
        )
        .route(
            "/api/v1/wordpress/installations/{id}/database/repair",
            post(routes::wp_actions::repair_wp_db),
        )
        .route(
            "/api/v1/wordpress/installations/{id}/database/search-replace",
            post(routes::wp_actions::search_replace_wp_db),
        )
        .route(
            "/api/v1/wordpress/installations/{id}/settings",
            patch(routes::wp_actions::patch_wp_settings),
        )
        .route(
            "/api/v1/wordpress/installations/{id}/security/scan/{scan_type}",
            post(routes::wp_actions::wp_security_scan),
        )
        .route(
            "/api/v1/wordpress/installations/{id}/core/reset",
            post(routes::wp_actions::reset_wp_core),
        )
        .route(
            "/api/v1/wordpress/installations/{id}/core/verify",
            post(routes::wp_actions::verify_wp_core),
        )
        // ── MCP (Model Context Protocol) ───────────────────────────────────
        .route("/mcp", post(mcp_post))
        // ── Alert rules ────────────────────────────────────────────────────
        .route(
            "/api/v1/alert-rules",
            get(routes::alert_rules::list_alert_rules).post(routes::alert_rules::create_alert_rule),
        )
        .route(
            "/api/v1/alert-rules/{id}/enable",
            patch(routes::alert_rules::enable_alert_rule),
        )
        .route(
            "/api/v1/alert-rules/{id}/disable",
            patch(routes::alert_rules::disable_alert_rule),
        )
        .route(
            "/api/v1/alert-rules/{id}",
            delete(routes::alert_rules::delete_alert_rule),
        )
        .route(
            "/api/v1/alert-deliveries",
            get(routes::alert_rules::list_alert_deliveries),
        )
        // ── Audit log ──────────────────────────────────────────────────────
        .route("/api/v1/audit-log", get(routes::audit_log::list))
        // ── WebSocket event gateway ────────────────────────────────────────
        .route("/ws/v1/events", get(ws::handler))
        // ── Middleware ─────────────────────────────────────────────────────
        .layer(axum_middleware::from_fn(security_headers_mw))
        .layer(TraceLayer::new_for_http())
        .with_state(pool)
}
