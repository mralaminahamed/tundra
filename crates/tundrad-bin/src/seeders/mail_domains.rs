use sqlx::PgPool;

pub async fn run(pool: &PgPool) -> anyhow::Result<()> {
    // (domain, mx_host, webmail_enabled)
    let rows: &[(&str, &str, bool)] = &[
        // Core demo domains
        ("acme-corp.io", "mail.acme-corp.io", true),
        ("nexusplatform.com", "mail.nexusplatform.com", true),
        ("orbitanalytics.io", "mail.orbitanalytics.io", false),
        ("sparkcommerce.store", "mail.sparkcommerce.store", true),
        ("prismdesign.co", "mail.prismdesign.co", false),
        ("forgedevtools.dev", "mail.forgedevtools.dev", false),
        ("velashipping.com", "mail.velashipping.com", true),
        ("crestfinance.app", "mail.crestfinance.app", true),
        ("novamedia.studio", "mail.novamedia.studio", false),
        ("bloombotanicals.com", "mail.bloombotanicals.com", true),
        // E-commerce
        ("summitoutdoor.co", "mail.summitoutdoor.co", true),
        ("urbanthreads.shop", "mail.urbanthreads.shop", false),
        ("pearljewellery.store", "mail.pearljewellery.store", true),
        ("rustichome.co", "mail.rustichome.co", true),
        ("coastalsurf.shop", "mail.coastalsurf.shop", false),
        // Agencies
        ("pixelagency.design", "mail.pixelagency.design", true),
        ("arcstudio.xyz", "mail.arcstudio.xyz", false),
        ("memocreative.com", "mail.memocreative.com", true),
        ("lumedigital.agency", "mail.lumedigital.agency", true),
        ("canvasworks.art", "mail.canvasworks.art", false),
        // Dev tools
        ("codeflow.dev", "mail.codeflow.dev", false),
        ("stackr.io", "mail.stackr.io", false),
        ("devhub.tools", "mail.devhub.tools", false),
        ("relayci.io", "mail.relayci.io", false),
        // Healthcare
        ("meditrack.health", "mail.meditrack.health", true),
        ("wellpath.care", "mail.wellpath.care", true),
        ("fitpulse.app", "mail.fitpulse.app", false),
        ("zenmind.co", "mail.zenmind.co", false),
        ("clearrx.pharmacy", "mail.clearrx.pharmacy", true),
        // Education
        ("learnloop.edu", "mail.learnloop.edu", true),
        ("academiq.io", "mail.academiq.io", true),
        ("tutorbase.com", "mail.tutorbase.com", true),
        ("skillbridge.training", "mail.skillbridge.training", false),
        ("quizlab.online", "mail.quizlab.online", false),
        // Media
        ("thedailywire.press", "mail.thedailywire.press", true),
        ("epochmagazine.com", "mail.epochmagazine.com", true),
        ("broadcastnow.tv", "mail.broadcastnow.tv", false),
        ("podcastcentral.fm", "mail.podcastcentral.fm", false),
        ("pixelpress.pub", "mail.pixelpress.pub", true),
        // Finance
        ("vaultfinance.io", "mail.vaultfinance.io", true),
        ("paybridge.finance", "mail.paybridge.finance", true),
        ("tokenledger.co", "mail.tokenledger.co", false),
        ("wealthgraph.app", "mail.wealthgraph.app", true),
        // Travel
        ("roamtravel.com", "mail.roamtravel.com", true),
        ("stayeasy.rentals", "mail.stayeasy.rentals", true),
        ("horizonhotels.co", "mail.horizonhotels.co", true),
        ("atlastours.guide", "mail.atlastours.guide", false),
        // HR
        ("talentcore.hr", "mail.talentcore.hr", true),
        ("hireflow.io", "mail.hireflow.io", true),
        ("payrollnow.co", "mail.payrollnow.co", true),
        // AI / ML
        ("neuralbase.ai", "mail.neuralbase.ai", false),
        ("infercore.ml", "mail.infercore.ml", false),
        ("datamind.io", "mail.datamind.io", false),
        ("cognify.ai", "mail.cognify.ai", false),
    ];

    for (domain, mx_host, webmail_enabled) in rows {
        sqlx::query(
            "INSERT INTO mail_domains (domain, mx_host, webmail_enabled) \
             VALUES ($1, $2, $3) ON CONFLICT (domain) DO NOTHING",
        )
        .bind(domain)
        .bind(mx_host)
        .bind(webmail_enabled)
        .execute(pool)
        .await?;
        println!("  mail domain {domain}");
    }
    Ok(())
}
