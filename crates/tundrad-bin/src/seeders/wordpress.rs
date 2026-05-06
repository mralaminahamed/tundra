use sqlx::PgPool;
use uuid::Uuid;

pub async fn run(pool: &PgPool) -> anyhow::Result<()> {
    let op_id: Option<(Uuid,)> =
        sqlx::query_as("SELECT id FROM operators WHERE email = 'admin@tundra.local' LIMIT 1")
            .fetch_optional(pool)
            .await?;

    let Some((op_id,)) = op_id else {
        println!("  skipped — no admin operator");
        return Ok(());
    };

    // Only seed installations for sites whose application uses a WordPress/WooCommerce template
    let sites: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT s.id, s.primary_domain \
         FROM sites s \
         JOIN applications a ON a.site_id = s.id \
         WHERE a.source_kind = 'template' \
           AND a.source_config->>'template_id' IN ('wordpress', 'woocommerce') \
         ORDER BY s.created_at",
    )
    .fetch_all(pool)
    .await?;

    if sites.is_empty() {
        println!("  skipped — no sites found");
        return Ok(());
    }

    // Popular WordPress plugins — (slug, name, version, author, active, has_update, new_version)
    // Each installation gets a varied subset based on its index
    type PluginRow<'a> = (
        &'a str,
        &'a str,
        &'a str,
        &'a str,
        bool,
        bool,
        Option<&'a str>,
    );
    let all_plugins: &[PluginRow] = &[
        (
            "akismet",
            "Akismet Anti-Spam: Spam Protection",
            "5.3.2",
            "Automattic",
            true,
            false,
            None,
        ),
        (
            "wordfence",
            "Wordfence Security",
            "7.11.6",
            "Wordfence",
            true,
            true,
            Some("7.11.7"),
        ),
        (
            "yoast-seo",
            "Yoast SEO",
            "23.2",
            "Team Yoast",
            true,
            false,
            None,
        ),
        (
            "wp-super-cache",
            "WP Super Cache",
            "1.12.3",
            "Automattic",
            true,
            false,
            None,
        ),
        (
            "contact-form-7",
            "Contact Form 7",
            "5.9.5",
            "Takayuki Miyoshi",
            true,
            true,
            Some("5.9.6"),
        ),
        (
            "updraftplus",
            "UpdraftPlus — Backup/Restore",
            "1.23.12",
            "UpdraftPlus.Com",
            true,
            false,
            None,
        ),
        (
            "woocommerce",
            "WooCommerce",
            "9.5.2",
            "Automattic",
            true,
            true,
            Some("9.6.0"),
        ),
        (
            "elementor",
            "Elementor Website Builder",
            "3.24.4",
            "Elementor.com",
            false,
            true,
            Some("3.25.0"),
        ),
        (
            "classic-editor",
            "Classic Editor",
            "1.6.5",
            "WordPress Contributors",
            false,
            false,
            None,
        ),
        (
            "mailchimp-for-wp",
            "Mailchimp for WordPress",
            "4.9.14",
            "ibericode",
            true,
            false,
            None,
        ),
        (
            "really-simple-ssl",
            "Really Simple SSL",
            "8.1.5",
            "Really Simple Plugins",
            true,
            false,
            None,
        ),
        (
            "wpforms-lite",
            "WPForms Lite",
            "1.9.0",
            "WPForms LLC",
            true,
            true,
            Some("1.9.1"),
        ),
        (
            "wc-serial-numbers",
            "WooCommerce Serial Numbers",
            "1.7.4",
            "PluginEver",
            false,
            false,
            None,
        ),
        (
            "wordpress-seo",
            "Yoast SEO Premium",
            "23.2",
            "Team Yoast",
            false,
            true,
            Some("23.3"),
        ),
        (
            "all-in-one-seo-pack",
            "All in One SEO",
            "4.7.9",
            "All in One SEO Team",
            false,
            false,
            None,
        ),
        (
            "wp-optimize",
            "WP-Optimize",
            "3.4.0",
            "David Anderson",
            true,
            false,
            None,
        ),
        (
            "wp-rocket",
            "WP Rocket",
            "3.16.3",
            "WP Media",
            true,
            false,
            None,
        ),
        (
            "redirection",
            "Redirection",
            "5.4.2",
            "John Godley",
            true,
            false,
            None,
        ),
        (
            "duplicate-post",
            "Yoast Duplicate Post",
            "4.5.1",
            "Enrico Battocchi",
            false,
            false,
            None,
        ),
        (
            "advanced-custom-fields",
            "Advanced Custom Fields",
            "6.3.5",
            "Delicious Brains",
            true,
            true,
            Some("6.3.6"),
        ),
        (
            "ninja-forms",
            "Ninja Forms",
            "3.8.3",
            "The WP Ninjas",
            false,
            false,
            None,
        ),
        (
            "google-analytics-for-wordpress",
            "MonsterInsights",
            "8.31.0",
            "MonsterInsights",
            true,
            true,
            Some("8.32.0"),
        ),
        (
            "woocommerce-gateway-stripe",
            "WooCommerce Stripe Gateway",
            "8.8.0",
            "WooCommerce",
            true,
            false,
            None,
        ),
        (
            "paypal-for-woocommerce",
            "PayPal for WooCommerce",
            "5.9.0",
            "Angell EYE",
            false,
            false,
            None,
        ),
        (
            "woo-pdf-invoices",
            "PDF Invoices & Packing Slips",
            "3.8.1",
            "WP Overnight",
            true,
            false,
            None,
        ),
        (
            "litespeed-cache",
            "LiteSpeed Cache",
            "6.4.1",
            "LiteSpeed Technologies",
            true,
            false,
            None,
        ),
        (
            "broken-link-checker",
            "Broken Link Checker",
            "2.4.2",
            "WPMU DEV",
            false,
            false,
            None,
        ),
        (
            "user-role-editor",
            "User Role Editor",
            "4.64.3",
            "Vladimir Garagulya",
            true,
            false,
            None,
        ),
        (
            "table-of-contents-plus",
            "Table of Contents Plus",
            "2408",
            "Michael Tran",
            false,
            false,
            None,
        ),
        (
            "pretty-links",
            "Pretty Links",
            "3.6.4",
            "Pretty Links",
            true,
            false,
            None,
        ),
    ];

    // Themes — (slug, name, version, author, screenshot_url)
    type ThemeRow<'a> = (&'a str, &'a str, &'a str, &'a str, Option<&'a str>);
    let all_themes: &[ThemeRow] = &[
        (
            "twentytwentyfour",
            "Twenty Twenty-Four",
            "1.2",
            "WordPress.org",
            Some("https://i0.wp.com/themes.svn.wordpress.org/twentytwentyfour/1.2/screenshot.png"),
        ),
        (
            "twentytwentythree",
            "Twenty Twenty-Three",
            "1.4",
            "WordPress.org",
            Some("https://i0.wp.com/themes.svn.wordpress.org/twentytwentythree/1.4/screenshot.png"),
        ),
        (
            "twentytwentytwo",
            "Twenty Twenty-Two",
            "1.8",
            "WordPress.org",
            Some("https://i0.wp.com/themes.svn.wordpress.org/twentytwentytwo/1.8/screenshot.png"),
        ),
        (
            "astra",
            "Astra",
            "4.8.4",
            "Brainstorm Force",
            Some("https://ps.w.org/astra/assets/screenshot.png"),
        ),
        (
            "generatepress",
            "GeneratePress",
            "3.4.0",
            "Tom Usborne",
            Some("https://ps.w.org/generatepress/assets/screenshot.png"),
        ),
        (
            "oceanwp",
            "OceanWP",
            "3.5.6",
            "OceanWP",
            Some("https://ps.w.org/oceanwp/assets/screenshot.png"),
        ),
        (
            "hello-elementor",
            "Hello Elementor",
            "3.1.0",
            "Elementor",
            Some("https://ps.w.org/hello-elementor/assets/screenshot.png"),
        ),
        (
            "kadence",
            "Kadence",
            "1.2.8",
            "Kadence WP",
            Some("https://ps.w.org/kadence-blocks/assets/screenshot.png"),
        ),
        (
            "storefront",
            "Storefront",
            "4.5.0",
            "Automattic",
            Some("https://ps.w.org/storefront/assets/screenshot.png"),
        ),
        ("flatsome", "Flatsome", "3.19.2", "UX-themes", None),
    ];

    // WooCommerce-specific plugins (added for ecommerce sites, index % 4 == 0)
    let woo_extra_plugins: &[PluginRow] = &[
        (
            "woocommerce-subscriptions",
            "WooCommerce Subscriptions",
            "6.2.0",
            "WooCommerce",
            true,
            false,
            None,
        ),
        (
            "woo-product-feed-pro",
            "Product Feed PRO",
            "13.4.1",
            "AdTribes.io",
            false,
            false,
            None,
        ),
        (
            "yith-woocommerce-wishlist",
            "YITH WooCommerce Wishlist",
            "3.33.0",
            "YITH",
            true,
            true,
            Some("3.34.0"),
        ),
        (
            "woo-cart-abandonment",
            "Retainful Cart Abandonment",
            "2.3.3",
            "Retainful",
            true,
            false,
            None,
        ),
        (
            "woocommerce-tax",
            "TaxJar – Sales Tax Automation",
            "3.5.0",
            "TaxJar",
            false,
            false,
            None,
        ),
    ];

    for (idx, (site_id, primary_domain)) in sites.iter().enumerate() {
        let db_slug = primary_domain
            .replace('.', "_")
            .replace('-', "_")
            .to_lowercase();
        let db_name = format!("wp_{}", &db_slug[..db_slug.len().min(48)]);
        let db_user = format!("wp_{}", &db_slug[..db_slug.len().min(14)]);
        let admin_email = format!("admin@{primary_domain}");
        let site_title = primary_domain
            .split('.')
            .next()
            .map(|s| {
                let mut c = s.chars();
                match c.next() {
                    None => String::new(),
                    Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                }
            })
            .unwrap_or_default();
        let site_url = format!("https://{primary_domain}");
        let is_ecommerce = idx % 4 == 0;
        let wp_version = if idx % 3 == 0 {
            "6.7.1"
        } else if idx % 3 == 1 {
            "6.6.2"
        } else {
            "6.5.5"
        };

        // Insert installation — skip if site already has one
        let install_id: Option<(Uuid,)> = sqlx::query_as(
            "INSERT INTO plugin_wordpress_installations \
               (site_id, wp_version, wp_path, db_name, db_user, db_host, \
                admin_email, site_title, site_url, state, installed_by) \
             VALUES ($1, $2, '/var/www/html', $3, $4, 'localhost', $5, $6, $7, 'active', $8) \
             ON CONFLICT (site_id) DO NOTHING \
             RETURNING id",
        )
        .bind(site_id)
        .bind(wp_version)
        .bind(&db_name)
        .bind(&db_user)
        .bind(&admin_email)
        .bind(&site_title)
        .bind(&site_url)
        .bind(op_id)
        .fetch_optional(pool)
        .await?;

        let Some((install_id,)) = install_id else {
            println!("  wp installation {primary_domain} already exists — skipped");
            continue;
        };

        println!("  wp installation {primary_domain} (WP {wp_version})");

        // Seed plugins — rotate through sets based on index
        let base_count = 8 + (idx % 7); // 8-14 plugins per site
        let plugins_to_seed: Vec<&PluginRow> = all_plugins.iter().take(base_count).collect();

        for (slug, name, version, author, active, has_update, new_version) in &plugins_to_seed {
            sqlx::query(
                "INSERT INTO plugin_wordpress_plugins \
                   (installation_id, slug, name, version, author, active, \
                    update_available, new_version) \
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
                 ON CONFLICT (installation_id, slug) DO NOTHING",
            )
            .bind(install_id)
            .bind(slug)
            .bind(name)
            .bind(version)
            .bind(author)
            .bind(active)
            .bind(has_update)
            .bind(new_version)
            .execute(pool)
            .await?;
        }

        // WooCommerce sites get extra ecommerce plugins
        if is_ecommerce {
            for (slug, name, version, author, active, has_update, new_version) in woo_extra_plugins
            {
                sqlx::query(
                    "INSERT INTO plugin_wordpress_plugins \
                       (installation_id, slug, name, version, author, active, \
                        update_available, new_version) \
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
                     ON CONFLICT (installation_id, slug) DO NOTHING",
                )
                .bind(install_id)
                .bind(slug)
                .bind(name)
                .bind(version)
                .bind(author)
                .bind(active)
                .bind(has_update)
                .bind(new_version)
                .execute(pool)
                .await?;
            }
        }

        // Seed themes — 3 themes per installation; active one rotates
        let active_theme_idx = idx % 4; // cycles through twentytwentyfour, astra, oceanwp, generatepress
        let theme_set = &all_themes[..5]; // first 5 themes for all sites
        for (t_idx, (slug, name, version, author, screenshot_url)) in theme_set.iter().enumerate() {
            let active = t_idx == active_theme_idx;
            sqlx::query(
                "INSERT INTO plugin_wordpress_themes \
                   (installation_id, slug, name, version, author, active, \
                    update_available, screenshot_url) \
                 VALUES ($1, $2, $3, $4, $5, $6, false, $7) \
                 ON CONFLICT (installation_id, slug) DO NOTHING",
            )
            .bind(install_id)
            .bind(slug)
            .bind(name)
            .bind(version)
            .bind(author)
            .bind(active)
            .bind(screenshot_url)
            .execute(pool)
            .await?;
        }
    }

    Ok(())
}
