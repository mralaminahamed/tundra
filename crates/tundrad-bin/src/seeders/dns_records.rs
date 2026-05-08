use sqlx::PgPool;

struct R {
    name: &'static str,
    typ:  &'static str,
    content: &'static str,
    ttl: i32,
    priority: Option<i32>,
}

fn a(name: &'static str, ip: &'static str)   -> R { R { name, typ: "A",     content: ip,   ttl: 3600, priority: None } }
fn aaaa(name: &'static str, ip: &'static str) -> R { R { name, typ: "AAAA",  content: ip,   ttl: 3600, priority: None } }
fn cname(name: &'static str, target: &'static str) -> R { R { name, typ: "CNAME", content: target, ttl: 3600, priority: None } }
fn mx(pri: i32, host: &'static str)          -> R { R { name: "@", typ: "MX",    content: host, ttl: 3600, priority: Some(pri) } }
fn txt(name: &'static str, val: &'static str) -> R { R { name, typ: "TXT",   content: val, ttl: 3600, priority: None } }
fn caa(content: &'static str)                -> R { R { name: "@", typ: "CAA",   content, ttl: 3600, priority: None } }

async fn seed(pool: &PgPool, apex: &str, records: &[R]) -> anyhow::Result<()> {
    let row = sqlx::query_scalar::<_, sqlx::types::Uuid>("SELECT id FROM domains WHERE apex = $1")
        .bind(apex)
        .fetch_optional(pool)
        .await?;

    let Some(domain_id) = row else {
        return Ok(());
    };

    for r in records {
        sqlx::query(
            "INSERT INTO dns_records (domain_id, name, type, ttl, priority, content, is_managed) \
             VALUES ($1, $2, $3, $4, $5, $6, true) \
             ON CONFLICT (domain_id, name, type, content) DO NOTHING",
        )
        .bind(domain_id)
        .bind(r.name)
        .bind(r.typ)
        .bind(r.ttl)
        .bind(r.priority)
        .bind(r.content)
        .execute(pool)
        .await?;
    }

    println!("  dns {apex} ({} records)", records.len());
    Ok(())
}

pub async fn run(pool: &PgPool) -> anyhow::Result<()> {
    // IPs from RFC 5737 TEST-NET-3 (203.0.113.0/24) — documentation use only

    // ── Full hosting stack: A + www + mail + MX + SPF + DMARC ────────────────
    let full_hosting: &[(&str, &str)] = &[
        ("acme-corp.io",         "203.0.113.1"),
        ("nexusplatform.com",    "203.0.113.2"),
        ("orbitanalytics.io",    "203.0.113.3"),
        ("sparkcommerce.store",  "203.0.113.4"),
        ("prismdesign.co",       "203.0.113.5"),
        ("forgedevtools.dev",    "203.0.113.6"),
        ("velashipping.com",     "203.0.113.7"),
        ("crestfinance.app",     "203.0.113.8"),
        ("novamedia.studio",     "203.0.113.9"),
        ("bloombotanicals.com",  "203.0.113.10"),
    ];

    for (apex, ip) in full_hosting {
        let mail = format!("mail.{apex}");
        let spf  = format!("v=spf1 a mx ip4:{ip} ~all");
        let dmarc = format!("v=DMARC1; p=none; rua=mailto:dmarc@{apex}");
        seed(pool, apex, &[
            a("@",       ip),
            a("www",     ip),
            a("mail",    ip),
            cname("ftp", apex),
            mx(10, Box::leak(mail.into_boxed_str())),
            txt("@",      Box::leak(spf.into_boxed_str())),
            txt("_dmarc", Box::leak(dmarc.into_boxed_str())),
        ]).await?;
    }

    // ── Basic web + SPF ───────────────────────────────────────────────────────
    let basic_web: &[(&str, &str)] = &[
        ("summitoutdoor.co",     "203.0.113.11"),
        ("urbanthreads.shop",    "203.0.113.12"),
        ("pearljewellery.store", "203.0.113.13"),
        ("rustichome.co",        "203.0.113.14"),
        ("coastalsurf.shop",     "203.0.113.15"),
        ("pixelagency.design",   "203.0.113.16"),
        ("arcstudio.xyz",        "203.0.113.17"),
        ("memocreative.com",     "203.0.113.18"),
        ("lumedigital.agency",   "203.0.113.19"),
        ("canvasworks.art",      "203.0.113.20"),
    ];

    for (apex, ip) in basic_web {
        let spf = format!("v=spf1 a ~all");
        seed(pool, apex, &[
            a("@",    ip),
            cname("www", apex),
            txt("@", Box::leak(spf.into_boxed_str())),
        ]).await?;
    }

    // ── Dev tools: dual-stack (A + AAAA) + CAA ────────────────────────────────
    let dev_domains: &[(&str, &str)] = &[
        ("codeflow.dev",    "203.0.113.21"),
        ("stackr.io",       "203.0.113.22"),
        ("devhub.tools",    "203.0.113.23"),
        ("patchwork.dev",   "203.0.113.24"),
        ("relayci.io",      "203.0.113.25"),
    ];

    for (apex, ip) in dev_domains {
        let spf   = format!("v=spf1 a ~all");
        let dmarc = format!("v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@{apex}");
        seed(pool, apex, &[
            a("@",     ip),
            aaaa("@",  "2001:db8::1"),
            cname("www", apex),
            txt("@",      Box::leak(spf.into_boxed_str())),
            txt("_dmarc", Box::leak(dmarc.into_boxed_str())),
            caa(r#"0 issue "letsencrypt.org""#),
            caa(r#"0 issuewild "letsencrypt.org""#),
        ]).await?;
    }

    // ── Health / education: Google Workspace email ────────────────────────────
    let google_ws: &[(&str, &str)] = &[
        ("meditrack.health",    "203.0.113.26"),
        ("wellpath.care",       "203.0.113.27"),
        ("learnloop.edu",       "203.0.113.28"),
        ("academiq.io",         "203.0.113.29"),
        ("tutorbase.com",       "203.0.113.30"),
    ];

    for (apex, ip) in google_ws {
        let dmarc = format!("v=DMARC1; p=quarantine; rua=mailto:dmarc@{apex}");
        seed(pool, apex, &[
            a("@",    ip),
            cname("www", apex),
            mx(1,  "aspmx.l.google.com"),
            mx(5,  "alt1.aspmx.l.google.com"),
            mx(5,  "alt2.aspmx.l.google.com"),
            mx(10, "alt3.aspmx.l.google.com"),
            mx(10, "alt4.aspmx.l.google.com"),
            txt("@",      "v=spf1 include:_spf.google.com ~all"),
            txt("_dmarc", Box::leak(dmarc.into_boxed_str())),
        ]).await?;
    }

    // ── Finance / security: DMARC enforce + CAA ───────────────────────────────
    let finance: &[(&str, &str)] = &[
        ("vaultfinance.io",    "203.0.113.31"),
        ("paybridge.finance",  "203.0.113.32"),
        ("crestfinance.app",   "203.0.113.33"),
        ("wealthgraph.app",    "203.0.113.34"),
        ("vaultguard.security","203.0.113.35"),
        ("shieldai.tech",      "203.0.113.36"),
        ("trustlink.net",      "203.0.113.37"),
        ("ciphervault.co",     "203.0.113.38"),
    ];

    for (apex, ip) in finance {
        let mail  = format!("mail.{apex}");
        let spf   = format!("v=spf1 a mx ip4:{ip} -all");
        let dmarc = format!("v=DMARC1; p=reject; rua=mailto:dmarc@{apex}; adkim=s; aspf=s; pct=100");
        seed(pool, apex, &[
            a("@",    ip),
            a("mail", ip),
            cname("www", apex),
            mx(10, Box::leak(mail.into_boxed_str())),
            txt("@",      Box::leak(spf.into_boxed_str())),
            txt("_dmarc", Box::leak(dmarc.into_boxed_str())),
            caa(r#"0 issue "letsencrypt.org""#),
            caa(r#"0 issuewild "letsencrypt.org""#),
            caa(Box::leak(format!("0 iodef \"mailto:security@{apex}\"").into_boxed_str())),
        ]).await?;
    }

    // ── AI / ML / SaaS: Microsoft 365 email ──────────────────────────────────
    let ms365: &[(&str, &str)] = &[
        ("neuralbase.ai",     "203.0.113.39"),
        ("infercore.ml",      "203.0.113.40"),
        ("datamind.io",       "203.0.113.41"),
        ("cognify.ai",        "203.0.113.42"),
        ("modelhub.tech",     "203.0.113.43"),
        ("leadpulse.marketing","203.0.113.44"),
        ("campaignkit.io",    "203.0.113.45"),
    ];

    for (apex, ip) in ms365 {
        let mx_target = format!("{apex}.mail.protection.outlook.com");
        let dmarc     = format!("v=DMARC1; p=none; rua=mailto:dmarc@{apex}");
        seed(pool, apex, &[
            a("@",             ip),
            cname("www",       apex),
            cname("autodiscover", "autodiscover.outlook.com"),
            mx(0, Box::leak(mx_target.into_boxed_str())),
            txt("@",      "v=spf1 include:spf.protection.outlook.com ~all"),
            txt("_dmarc", Box::leak(dmarc.into_boxed_str())),
        ]).await?;
    }

    // ── E-commerce / retail: self-hosted mail + MTA-STS ──────────────────────
    let ecommerce: &[(&str, &str)] = &[
        ("roamtravel.com",    "203.0.113.46"),
        ("stayeasy.rentals",  "203.0.113.47"),
        ("foodrun.delivery",  "203.0.113.48"),
        ("bentobox.food",     "203.0.113.49"),
        ("nestfinder.properties","203.0.113.50"),
    ];

    for (apex, ip) in ecommerce {
        let mail  = format!("mail.{apex}");
        let spf   = format!("v=spf1 a mx ip4:{ip} ~all");
        let dmarc = format!("v=DMARC1; p=quarantine; pct=50; rua=mailto:dmarc@{apex}");
        let tls   = format!("v=TLSRPTv1; rua=mailto:tls@{apex}");
        seed(pool, apex, &[
            a("@",    ip),
            a("mail", ip),
            a("www",  ip),
            mx(10, Box::leak(mail.into_boxed_str())),
            txt("@",          Box::leak(spf.into_boxed_str())),
            txt("_dmarc",     Box::leak(dmarc.into_boxed_str())),
            txt("_mta-sts",   "v=STSv1; id=20240101T000000Z"),
            txt("_smtp._tls", Box::leak(tls.into_boxed_str())),
        ]).await?;
    }

    Ok(())
}
