use sqlx::PgPool;
use uuid::Uuid;

/// Seed core and bundled plugins as `enabled` so they appear in the
/// sidebar / plugins list out of the box. Idempotent — uses ON CONFLICT.
pub async fn run(pool: &PgPool) -> anyhow::Result<()> {
    let op_id: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM operators WHERE email = 'admin@tundra.local' LIMIT 1")
            .fetch_optional(pool)
            .await?;

    let installed_by = op_id.map(|(id,)| id);

    type PluginSeed<'a> = (&'a str, &'a str, &'a str, &'a str);
    //                    plugin_id, name, description, tier ('core'|'registry')
    let plugins: &[PluginSeed] = &[
        (
            "com.tundra.mcp-server",
            "MCP Server (AI Agent Integration)",
            "Expose Tundra to AI agents via the Model Context Protocol.",
            "core",
        ),
        (
            "com.tundra.wordpress",
            "WordPress",
            "Manage WordPress and WooCommerce installations.",
            "core",
        ),
        (
            "com.tundra.cloudflare-dns",
            "Cloudflare DNS Provider",
            "DNS provider integration for Cloudflare.",
            "registry",
        ),
        (
            "com.tundra.mailgun",
            "Mailgun Smarthost Relay",
            "Route outbound email through Mailgun's SMTP relay.",
            "registry",
        ),
        (
            "com.tundra.slack-alerts",
            "Slack Alerts",
            "Route Tundra alerts to Slack channels.",
            "registry",
        ),
        (
            "com.tundra.discord-alerts",
            "Discord Alerts",
            "Route Tundra alerts to Discord channels via webhooks.",
            "registry",
        ),
        (
            "com.tundra.s3-backup",
            "S3-Compatible Backup",
            "Store backups in any S3-compatible bucket.",
            "registry",
        ),
    ];

    for (plugin_id, name, description, source) in plugins {
        let manifest = serde_json::json!({
            "id": plugin_id,
            "name": name,
            "description": description,
            "version": "1.0.0",
            "author": "Tundra Core Team",
        });

        sqlx::query(
            "INSERT INTO plugins
                (plugin_id, version, manifest, install_path, source,
                 state, enabled_at, installed_by, signature_verified)
             VALUES ($1, '1.0.0', $2, '/builtin', $3, 'enabled', now(), $4, true)
             ON CONFLICT (plugin_id) DO UPDATE
                 SET state = 'enabled',
                     enabled_at = COALESCE(plugins.enabled_at, now()),
                     updated_at = now()",
        )
        .bind(plugin_id)
        .bind(&manifest)
        .bind(source)
        .bind(installed_by)
        .execute(pool)
        .await?;

        println!("  plugin {plugin_id} enabled");
    }

    Ok(())
}
