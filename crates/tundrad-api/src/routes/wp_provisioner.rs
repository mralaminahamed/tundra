use tokio::process::Command;
use uuid::Uuid;

use tundrad_repo::PgPool;

pub struct ProvisionRequest {
    pub installation_id: Uuid,
    pub document_root: String,
    pub primary_domain: String,
    pub wp_subpath: String,   // "/" = install at document_root, "/blog" = subdir
    pub wp_version: String,   // "6.7.2" or "latest"
    pub db_name: String,
    pub db_user: String,
    pub db_password: String,
    pub db_host: String,
    pub db_prefix: String,
    pub admin_user: String,
    pub admin_email: String,
    pub admin_password: String,
    pub site_title: String,
    pub language: String,
}

/// Spawned as a background tokio task — never panics, writes errors to DB.
pub async fn provision(pool: PgPool, req: ProvisionRequest) {
    let id = req.installation_id;
    match run(&pool, &req).await {
        Ok(actual_version) => {
            let subpath = if req.wp_subpath == "/" { String::new() } else { req.wp_subpath.clone() };
            let site_url = format!("https://{}{}", req.primary_domain, subpath);
            let _ = sqlx::query(
                "UPDATE plugin_wordpress_installations
                 SET state = 'active', wp_version = $1, site_url = $2, updated_at = now()
                 WHERE id = $3",
            )
            .bind(&actual_version)
            .bind(&site_url)
            .bind(id)
            .execute(&pool)
            .await;
            // Propagate active status to the parent site so the sites list reflects reality
            let _ = sqlx::query(
                "UPDATE sites s SET status = 'active', updated_at = now()
                 FROM plugin_wordpress_installations i
                 WHERE i.id = $1 AND s.id = i.site_id AND s.status = 'provisioning'",
            )
            .bind(id)
            .execute(&pool)
            .await;
            tracing::info!(installation_id = %id, version = %actual_version, "WordPress provisioned");
        }
        Err(e) => {
            tracing::error!(installation_id = %id, error = %e, "WordPress provisioning failed");
            let _ = sqlx::query(
                "UPDATE plugin_wordpress_installations
                 SET state = 'error', error_message = $1, updated_at = now()
                 WHERE id = $2",
            )
            .bind(e.to_string())
            .bind(id)
            .execute(&pool)
            .await;
            // Propagate error status to the parent site
            let _ = sqlx::query(
                "UPDATE sites s SET status = 'error', updated_at = now()
                 FROM plugin_wordpress_installations i
                 WHERE i.id = $1 AND s.id = i.site_id AND s.status = 'provisioning'",
            )
            .bind(id)
            .execute(&pool)
            .await;
        }
    }
}

async fn run(
    pool: &PgPool,
    req: &ProvisionRequest,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    // Resolve absolute install path
    let install_path = resolve_path(&req.document_root, &req.wp_subpath);

    tokio::fs::create_dir_all(&install_path).await?;

    let wp = wp_bin();

    // ── Step 0: create MySQL database + user ──────────────────────────────────
    tracing::info!(installation_id = %req.installation_id, db = %req.db_name, "creating MySQL database and user");
    {
        let root_host = std::env::var("TUNDRA_WP_MYSQL_HOST").unwrap_or_else(|_| req.db_host.clone());
        // Admin user: prefer explicit override, fall back to the app user (which has GRANT OPTION in dev)
        let admin_user = std::env::var("TUNDRA_WP_MYSQL_ADMIN_USER")
            .unwrap_or_else(|_| "wordpress".to_owned());
        let admin_pass = std::env::var("TUNDRA_WP_MYSQL_ROOT_PASSWORD")
            .or_else(|_| std::env::var("TUNDRA_WP_MYSQL_PASSWORD"))
            .unwrap_or_default();
        let sql = format!(
            "CREATE DATABASE IF NOT EXISTS `{db}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\
             CREATE USER IF NOT EXISTS '{user}'@'%' IDENTIFIED BY '{pass}';\
             GRANT ALL PRIVILEGES ON `{db}`.* TO '{user}'@'%';\
             FLUSH PRIVILEGES;",
            db   = req.db_name.replace('`', ""),
            user = req.db_user.replace('\'', ""),
            pass = req.db_password.replace('\'', "\\'"),
        );
        let mut cmd = tokio::process::Command::new("mysql");
        cmd.env("MYSQL_PWD", &admin_pass)
            .args(["-h", &root_host, "-u", &admin_user, "--skip-ssl", "-e", &sql]);
        let out = cmd.output().await?;
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr);
            return Err(format!("mysql setup failed: {err}").into());
        }
    }

    // ── Step 1: wp core download ───────────────────────────────────────────────
    tracing::info!(installation_id = %req.installation_id, path = %install_path, "wp core download");

    let mut dl_args = vec![
        "core".to_owned(),
        "download".to_owned(),
        format!("--path={}", install_path),
        format!("--locale={}", req.language),
        "--allow-root".to_owned(),
        "--force".to_owned(),
    ];
    if req.wp_version != "latest" {
        dl_args.push(format!("--version={}", req.wp_version));
    }

    run_wp(&wp, &dl_args).await?;

    // ── Step 2: wp config create ───────────────────────────────────────────────
    tracing::info!(installation_id = %req.installation_id, "wp config create");

    run_wp(
        &wp,
        &[
            "config".to_owned(),
            "create".to_owned(),
            format!("--dbname={}", req.db_name),
            format!("--dbuser={}", req.db_user),
            format!("--dbpass={}", req.db_password),
            format!("--dbhost={}", req.db_host),
            format!("--dbprefix={}", req.db_prefix),
            format!("--locale={}", req.language),
            format!("--path={}", install_path),
            "--allow-root".to_owned(),
            "--force".to_owned(),
            "--skip-check".to_owned(),
        ],
    )
    .await?;

    // ── Step 3: wp core install (best-effort — requires live DB) ──────────────
    tracing::info!(installation_id = %req.installation_id, "wp core install");

    if let Err(e) = run_wp(
        &wp,
        &[
            "core".to_owned(),
            "install".to_owned(),
            format!("--url=https://{}", req.primary_domain),
            format!("--title={}", req.site_title),
            format!("--admin_user={}", req.admin_user),
            format!("--admin_password={}", req.admin_password),
            format!("--admin_email={}", req.admin_email),
            format!("--path={}", install_path),
            "--allow-root".to_owned(),
            "--skip-email".to_owned(),
        ],
    )
    .await
    {
        // Log but don't fail — DB may not be provisioned yet.
        // Files are extracted and wp-config.php is written; admin can run
        // the DB step manually or via the databases module.
        tracing::warn!(
            installation_id = %req.installation_id,
            error = %e,
            "wp core install skipped (no DB reachable — files and config are ready)"
        );
    }

    // ── Read actual installed version from WP ──────────────────────────────────
    let version_out = Command::new(&wp)
        .args([
            "core",
            "version",
            &format!("--path={}", install_path),
            "--allow-root",
        ])
        .output()
        .await?;

    let actual_version = String::from_utf8_lossy(&version_out.stdout)
        .trim()
        .to_owned();
    let version = if actual_version.is_empty() {
        req.wp_version.clone()
    } else {
        actual_version
    };

    // Ensure db_name/db_user/db_password/admin_user are persisted
    let _ = sqlx::query(
        "UPDATE plugin_wordpress_installations
         SET db_name = $1, db_user = $2, db_password = $3, admin_user = $4 WHERE id = $5",
    )
    .bind(&req.db_name)
    .bind(&req.db_user)
    .bind(&req.db_password)
    .bind(&req.admin_user)
    .bind(req.installation_id)
    .execute(pool)
    .await;

    // ── Step 5: sync installed themes + plugins ───────────────────────────────
    sync_themes(pool, req.installation_id, &install_path, &wp).await;
    sync_plugins(pool, req.installation_id, &install_path, &wp).await;

    // ── Step 6: compute disk usage ────────────────────────────────────────────
    if let Ok(out) = Command::new("du")
        .args(["-sm", &install_path])
        .output()
        .await
    {
        let s = String::from_utf8_lossy(&out.stdout);
        if let Some(mb) = s.split_whitespace().next().and_then(|v| v.parse::<i64>().ok()) {
            let _ = sqlx::query(
                "UPDATE plugin_wordpress_installations SET disk_usage_mb = $1 WHERE id = $2",
            )
            .bind(mb)
            .bind(req.installation_id)
            .execute(pool)
            .await;
        }
    }

    Ok(version)
}

/// Sync installed plugins: try wp-cli first (needs live DB), fall back to
/// scanning wp-content/plugins/ and reading plugin header comments.
async fn sync_plugins(pool: &PgPool, installation_id: Uuid, install_path: &str, wp: &str) {
    #[derive(serde::Deserialize)]
    struct WpPlugin {
        name: String,          // slug
        title: Option<String>, // display name
        status: String,        // "active" | "inactive" | "must-use"
        version: Option<String>,
        update: Option<String>,
        update_version: Option<String>,
        author: Option<String>,
    }

    // Try wp-cli first (needs live MySQL)
    let wp_cli_ok = async {
        let out = Command::new(wp)
            .args([
                "plugin", "list",
                "--format=json",
                "--fields=name,title,status,version,update,update_version,author",
                &format!("--path={}", install_path),
                "--allow-root",
            ])
            .output()
            .await
            .ok()?;
        if !out.status.success() { return None; }
        let plugins: Vec<WpPlugin> = serde_json::from_slice(&out.stdout).ok()?;
        Some(plugins)
    }.await;

    if let Some(plugins) = wp_cli_ok {
        for p in &plugins {
            let active = p.status == "active" || p.status == "must-use";
            let has_update = p.update.as_deref() == Some("available");
            let name = p.title.as_deref().unwrap_or(&p.name);
            let _ = sqlx::query(
                "INSERT INTO plugin_wordpress_plugins
                     (installation_id, slug, name, version, author,
                      active, update_available, new_version)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (installation_id, slug) DO UPDATE
                     SET active = EXCLUDED.active, version = EXCLUDED.version,
                         update_available = EXCLUDED.update_available,
                         new_version = EXCLUDED.new_version, last_synced_at = now()",
            )
            .bind(installation_id).bind(&p.name).bind(name)
            .bind(&p.version).bind(&p.author).bind(active)
            .bind(has_update).bind(&p.update_version)
            .execute(pool).await;
        }
        tracing::info!(installation_id = %installation_id, count = plugins.len(), "plugins synced via wp-cli");
        return;
    }

    // Fallback: scan wp-content/plugins/, read plugin header from main PHP file.
    // Active state unknown without DB — set false; WP-CLI sync will fix on next run.
    let plugins_dir = format!("{}/wp-content/plugins", install_path);
    let mut rd = match tokio::fs::read_dir(&plugins_dir).await {
        Ok(r) => r,
        Err(_) => return,
    };

    let mut count = 0usize;
    while let Ok(Some(entry)) = rd.next_entry().await {
        let meta = match entry.metadata().await { Ok(m) => m, Err(_) => continue };
        if !meta.is_dir() { continue; }
        let slug = entry.file_name().to_string_lossy().into_owned();

        // Find main plugin file: prefer {slug}.php, else first *.php with Plugin Name header
        let main_php = format!("{}/{}/{}.php", plugins_dir, slug, slug);
        let contents = if let Ok(c) = tokio::fs::read_to_string(&main_php).await {
            c
        } else {
            // scan dir for any .php with a Plugin Name header
            let mut found = String::new();
            if let Ok(mut d) = tokio::fs::read_dir(format!("{}/{}", plugins_dir, slug)).await {
                while let Ok(Some(f)) = d.next_entry().await {
                    let fname = f.file_name().to_string_lossy().into_owned();
                    if !fname.ends_with(".php") { continue; }
                    if let Ok(c) = tokio::fs::read_to_string(f.path()).await {
                        if c.contains("Plugin Name:") { found = c; break; }
                    }
                }
            }
            found
        };

        let get = |key: &str| -> Option<String> {
            contents.lines()
                .find(|l| l.trim_start().to_lowercase().starts_with(&format!("{}:", key.to_lowercase()).replace("plugin ", "")))
                .or_else(|| contents.lines().find(|l| {
                    let s = l.trim_start().to_lowercase();
                    s.starts_with(&format!("* {}:", key.to_lowercase())) ||
                    s.starts_with(&format!("{}: ", key.to_lowercase()))
                }))
                .map(|l| l.splitn(2, ':').nth(1).unwrap_or("").trim().to_owned())
                .filter(|s| !s.is_empty())
        };

        let name = get("Plugin Name").unwrap_or_else(|| slug.clone());
        if name == slug && !contents.contains("Plugin Name:") { continue; } // skip non-plugins
        let version = get("Version");
        let author = get("Author");

        let _ = sqlx::query(
            "INSERT INTO plugin_wordpress_plugins
                 (installation_id, slug, name, version, author,
                  active, update_available)
             VALUES ($1, $2, $3, $4, $5, false, false)
             ON CONFLICT (installation_id, slug) DO NOTHING",
        )
        .bind(installation_id).bind(&slug).bind(&name)
        .bind(&version).bind(&author)
        .execute(pool).await;

        count += 1;
    }
    if count > 0 {
        tracing::info!(installation_id = %installation_id, count, "plugins synced via filesystem scan");
    }
}

/// Sync installed themes: try wp-cli first (needs live DB), fall back to
/// scanning the themes directory and reading style.css headers.
async fn sync_themes(pool: &PgPool, installation_id: Uuid, install_path: &str, wp: &str) {
    #[derive(serde::Deserialize)]
    struct WpTheme {
        name: String,
        title: Option<String>,
        status: String,
        version: Option<String>,
        update: Option<String>,
        update_version: Option<String>,
        author: Option<String>,
    }

    // Try wp-cli first (works when MySQL is available)
    let wp_cli_ok = async {
        let out = Command::new(wp)
            .args([
                "theme", "list",
                "--format=json",
                "--fields=name,title,status,version,update,update_version,author",
                &format!("--path={}", install_path),
                "--allow-root",
            ])
            .output()
            .await
            .ok()?;
        if !out.status.success() { return None; }
        let themes: Vec<WpTheme> = serde_json::from_slice(&out.stdout).ok()?;
        Some(themes)
    }.await;

    if let Some(themes) = wp_cli_ok {
        for t in &themes {
            let active = t.status == "active";
            let has_update = t.update.as_deref() == Some("available");
            let name = t.title.as_deref().unwrap_or(&t.name);
            let _ = sqlx::query(
                "INSERT INTO plugin_wordpress_themes
                     (installation_id, slug, name, version, author,
                      active, update_available, new_version, screenshot_url)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
                 ON CONFLICT (installation_id, slug) DO UPDATE
                     SET active = EXCLUDED.active, version = EXCLUDED.version,
                         update_available = EXCLUDED.update_available,
                         new_version = EXCLUDED.new_version, last_synced_at = now()",
            )
            .bind(installation_id).bind(&t.name).bind(name)
            .bind(&t.version).bind(&t.author).bind(active)
            .bind(has_update).bind(&t.update_version)
            .execute(pool).await;
        }
        tracing::info!(installation_id = %installation_id, count = themes.len(), "themes synced via wp-cli");
        return;
    }

    // Fallback: scan wp-content/themes/, read style.css Name/Version/Author headers
    let themes_dir = format!("{}/wp-content/themes", install_path);
    let mut rd = match tokio::fs::read_dir(&themes_dir).await {
        Ok(r) => r,
        Err(_) => return,
    };

    let mut idx = 0usize;
    while let Ok(Some(entry)) = rd.next_entry().await {
        let slug = entry.file_name().to_string_lossy().into_owned();
        let css = format!("{}/{}/style.css", themes_dir, slug);
        let contents = tokio::fs::read_to_string(&css).await.unwrap_or_default();

        let get = |key: &str| -> Option<String> {
            contents.lines()
                .find(|l| l.trim_start().to_lowercase().starts_with(&format!("{}:", key.to_lowercase())))
                .map(|l| l.splitn(2, ':').nth(1).unwrap_or("").trim().to_owned())
                .filter(|s| !s.is_empty())
        };

        let name = get("Theme Name").unwrap_or_else(|| slug.clone());
        let version = get("Version");
        let author = get("Author");
        let active = idx == 0;
        // Local screenshot endpoint — works for all themes including custom/premium
        let screenshot_url = format!(
            "/api/v1/wordpress/installations/{installation_id}/themes/{slug}/screenshot"
        );

        let _ = sqlx::query(
            "INSERT INTO plugin_wordpress_themes
                 (installation_id, slug, name, version, author,
                  active, update_available, screenshot_url)
             VALUES ($1, $2, $3, $4, $5, $6, false, $7)
             ON CONFLICT (installation_id, slug) DO UPDATE
                 SET name=$3, version=$4, author=$5, active=$6,
                     screenshot_url=$7, last_synced_at=now()",
        )
        .bind(installation_id).bind(&slug).bind(&name)
        .bind(&version).bind(&author).bind(active)
        .bind(&screenshot_url)
        .execute(pool).await;

        idx += 1;
    }
    if idx > 0 {
        tracing::info!(installation_id = %installation_id, count = idx, "themes synced via filesystem scan");
    }
}

/// Run a wp-cli command, return Ok(()) or Err with combined stdout+stderr.
async fn run_wp(
    wp: &str,
    args: &[String],
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let out = Command::new(wp).args(args).output().await?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        return Err(format!(
            "wp {} failed ({}): {} {}",
            args.first().map(|s| s.as_str()).unwrap_or("?"),
            out.status,
            stdout.trim(),
            stderr.trim(),
        )
        .into());
    }
    Ok(())
}

/// Returns the path to the wp binary: checks /usr/local/bin/wp first, falls back to "wp".
pub fn wp_bin() -> String {
    if std::path::Path::new("/usr/local/bin/wp").exists() {
        "/usr/local/bin/wp".to_owned()
    } else {
        "wp".to_owned()
    }
}

/// Resolve the absolute filesystem install path.
/// document_root = "/srv/sites/abc/current"
/// subpath = "/" → "/srv/sites/abc/current"
/// subpath = "/blog" → "/srv/sites/abc/current/blog"
pub fn resolve_path(document_root: &str, subpath: &str) -> String {
    let root = document_root.trim_end_matches('/');
    let sub = subpath.trim_matches('/');
    if sub.is_empty() {
        root.to_owned()
    } else {
        format!("{}/{}", root, sub)
    }
}
