use sqlx::PgPool;
use uuid::Uuid;

pub async fn run(pool: &PgPool) -> anyhow::Result<()> {
    // Fetch all web/api server IDs in stable order
    let server_ids: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT id, hostname FROM servers \
         WHERE name LIKE 'web-%' OR name LIKE 'api-%' \
         ORDER BY hostname",
    )
    .fetch_all(pool)
    .await?;

    if server_ids.is_empty() {
        println!("  skipped — no servers found (run servers seeder first)");
        return Ok(());
    }

    // 210 realistic site entries: (name, primary_domain, document_root)
    // Distributed round-robin across available servers
    let sites: &[(&str, &str, &str)] = &[
        // SaaS / tech products
        ("Acme Corp", "acme-corp.io", "/var/www/acme-corp.io/public"),
        (
            "Acme API",
            "api.acme-corp.io",
            "/var/www/api.acme-corp.io/public",
        ),
        (
            "Acme Dashboard",
            "app.acme-corp.io",
            "/var/www/app.acme-corp.io/public",
        ),
        (
            "Nexus Platform",
            "nexusplatform.com",
            "/var/www/nexusplatform.com/public",
        ),
        (
            "Nexus Docs",
            "docs.nexusplatform.com",
            "/var/www/docs.nexusplatform.com/public",
        ),
        (
            "Nexus Status",
            "status.nexusplatform.com",
            "/var/www/status.nexusplatform.com/public",
        ),
        (
            "Orbit Analytics",
            "orbitanalytics.io",
            "/var/www/orbitanalytics.io/public",
        ),
        (
            "Orbit API",
            "api.orbitanalytics.io",
            "/var/www/api.orbitanalytics.io/public",
        ),
        (
            "Spark Commerce",
            "sparkcommerce.store",
            "/var/www/sparkcommerce.store/public",
        ),
        (
            "Spark Admin",
            "admin.sparkcommerce.store",
            "/var/www/admin.sparkcommerce.store/public",
        ),
        (
            "Prism Design",
            "prismdesign.co",
            "/var/www/prismdesign.co/public",
        ),
        (
            "Prism Portfolio",
            "portfolio.prismdesign.co",
            "/var/www/portfolio.prismdesign.co/public",
        ),
        (
            "Forge Dev Tools",
            "forgedevtools.dev",
            "/var/www/forgedevtools.dev/public",
        ),
        (
            "Forge Docs",
            "docs.forgedevtools.dev",
            "/var/www/docs.forgedevtools.dev/public",
        ),
        (
            "Vela Shipping",
            "velashipping.com",
            "/var/www/velashipping.com/public",
        ),
        (
            "Vela Tracker",
            "track.velashipping.com",
            "/var/www/track.velashipping.com/public",
        ),
        (
            "Crest Finance",
            "crestfinance.app",
            "/var/www/crestfinance.app/public",
        ),
        (
            "Crest API",
            "api.crestfinance.app",
            "/var/www/api.crestfinance.app/public",
        ),
        (
            "Nova Media",
            "novamedia.studio",
            "/var/www/novamedia.studio/public",
        ),
        (
            "Nova Blog",
            "blog.novamedia.studio",
            "/var/www/blog.novamedia.studio/public",
        ),
        // E-commerce
        (
            "Bloom Botanicals",
            "bloombotanicals.com",
            "/var/www/bloombotanicals.com/public",
        ),
        (
            "Bloom Shop",
            "shop.bloombotanicals.com",
            "/var/www/shop.bloombotanicals.com/public",
        ),
        (
            "Summit Outdoor",
            "summitoutdoor.co",
            "/var/www/summitoutdoor.co/public",
        ),
        (
            "Summit Store",
            "store.summitoutdoor.co",
            "/var/www/store.summitoutdoor.co/public",
        ),
        (
            "Urban Threads",
            "urbanthreads.shop",
            "/var/www/urbanthreads.shop/public",
        ),
        (
            "Urban API",
            "api.urbanthreads.shop",
            "/var/www/api.urbanthreads.shop/public",
        ),
        (
            "Pearl Jewellery",
            "pearljewellery.store",
            "/var/www/pearljewellery.store/public",
        ),
        (
            "Rustic Home",
            "rustichome.co",
            "/var/www/rustichome.co/public",
        ),
        (
            "Rustic Admin",
            "admin.rustichome.co",
            "/var/www/admin.rustichome.co/public",
        ),
        (
            "Coastal Surf",
            "coastalsurf.shop",
            "/var/www/coastalsurf.shop/public",
        ),
        // Agencies / studios
        (
            "Pixel Agency",
            "pixelagency.design",
            "/var/www/pixelagency.design/public",
        ),
        (
            "Pixel Projects",
            "projects.pixelagency.design",
            "/var/www/projects.pixelagency.design/public",
        ),
        (
            "Arc Studio",
            "arcstudio.xyz",
            "/var/www/arcstudio.xyz/public",
        ),
        (
            "Arc Client Portal",
            "portal.arcstudio.xyz",
            "/var/www/portal.arcstudio.xyz/public",
        ),
        (
            "Memo Creative",
            "memocreative.com",
            "/var/www/memocreative.com/public",
        ),
        (
            "Memo Work",
            "work.memocreative.com",
            "/var/www/work.memocreative.com/public",
        ),
        (
            "Lume Digital",
            "lumedigital.agency",
            "/var/www/lumedigital.agency/public",
        ),
        (
            "Lume Client",
            "clients.lumedigital.agency",
            "/var/www/clients.lumedigital.agency/public",
        ),
        (
            "Canvas Works",
            "canvasworks.art",
            "/var/www/canvasworks.art/public",
        ),
        (
            "Canvas Gallery",
            "gallery.canvasworks.art",
            "/var/www/gallery.canvasworks.art/public",
        ),
        // Developer tools / open source
        ("CodeFlow", "codeflow.dev", "/var/www/codeflow.dev/public"),
        (
            "CodeFlow Docs",
            "docs.codeflow.dev",
            "/var/www/docs.codeflow.dev/public",
        ),
        (
            "CodeFlow API",
            "api.codeflow.dev",
            "/var/www/api.codeflow.dev/public",
        ),
        ("Stackr", "stackr.io", "/var/www/stackr.io/public"),
        (
            "Stackr Dashboard",
            "app.stackr.io",
            "/var/www/app.stackr.io/public",
        ),
        ("DevHub", "devhub.tools", "/var/www/devhub.tools/public"),
        (
            "DevHub Registry",
            "registry.devhub.tools",
            "/var/www/registry.devhub.tools/public",
        ),
        (
            "Patchwork OSS",
            "patchwork.dev",
            "/var/www/patchwork.dev/public",
        ),
        ("Relay CI", "relayci.io", "/var/www/relayci.io/public"),
        (
            "Relay Builds",
            "builds.relayci.io",
            "/var/www/builds.relayci.io/public",
        ),
        // Healthcare / wellness
        (
            "MediTrack",
            "meditrack.health",
            "/var/www/meditrack.health/public",
        ),
        (
            "MediTrack App",
            "app.meditrack.health",
            "/var/www/app.meditrack.health/public",
        ),
        ("Wellpath", "wellpath.care", "/var/www/wellpath.care/public"),
        (
            "Wellpath Portal",
            "my.wellpath.care",
            "/var/www/my.wellpath.care/public",
        ),
        ("FitPulse", "fitpulse.app", "/var/www/fitpulse.app/public"),
        (
            "FitPulse API",
            "api.fitpulse.app",
            "/var/www/api.fitpulse.app/public",
        ),
        ("ZenMind", "zenmind.co", "/var/www/zenmind.co/public"),
        (
            "ZenMind Sessions",
            "sessions.zenmind.co",
            "/var/www/sessions.zenmind.co/public",
        ),
        (
            "ClearRx",
            "clearrx.pharmacy",
            "/var/www/clearrx.pharmacy/public",
        ),
        (
            "ClearRx Orders",
            "orders.clearrx.pharmacy",
            "/var/www/orders.clearrx.pharmacy/public",
        ),
        // Education
        (
            "LearnLoop",
            "learnloop.edu",
            "/var/www/learnloop.edu/public",
        ),
        (
            "LearnLoop Courses",
            "courses.learnloop.edu",
            "/var/www/courses.learnloop.edu/public",
        ),
        ("AcademiQ", "academiq.io", "/var/www/academiq.io/public"),
        (
            "AcademiQ Dashboard",
            "app.academiq.io",
            "/var/www/app.academiq.io/public",
        ),
        (
            "TutorBase",
            "tutorbase.com",
            "/var/www/tutorbase.com/public",
        ),
        (
            "TutorBase API",
            "api.tutorbase.com",
            "/var/www/api.tutorbase.com/public",
        ),
        (
            "SkillBridge",
            "skillbridge.training",
            "/var/www/skillbridge.training/public",
        ),
        (
            "SkillBridge Portal",
            "portal.skillbridge.training",
            "/var/www/portal.skillbridge.training/public",
        ),
        (
            "QuizLab",
            "quizlab.online",
            "/var/www/quizlab.online/public",
        ),
        (
            "QuizLab Results",
            "results.quizlab.online",
            "/var/www/results.quizlab.online/public",
        ),
        // Media / publishing
        (
            "The Daily Wire",
            "thedailywire.press",
            "/var/www/thedailywire.press/public",
        ),
        (
            "Wire Editorial",
            "editorial.thedailywire.press",
            "/var/www/editorial.thedailywire.press/public",
        ),
        (
            "Epoch Magazine",
            "epochmagazine.com",
            "/var/www/epochmagazine.com/public",
        ),
        (
            "Epoch Subscribers",
            "members.epochmagazine.com",
            "/var/www/members.epochmagazine.com/public",
        ),
        (
            "Broadcast Now",
            "broadcastnow.tv",
            "/var/www/broadcastnow.tv/public",
        ),
        (
            "Broadcast Stream",
            "stream.broadcastnow.tv",
            "/var/www/stream.broadcastnow.tv/public",
        ),
        (
            "Podcast Central",
            "podcastcentral.fm",
            "/var/www/podcastcentral.fm/public",
        ),
        (
            "Podcast RSS",
            "feeds.podcastcentral.fm",
            "/var/www/feeds.podcastcentral.fm/public",
        ),
        (
            "PixelPress",
            "pixelpress.pub",
            "/var/www/pixelpress.pub/public",
        ),
        (
            "PixelPress Authors",
            "authors.pixelpress.pub",
            "/var/www/authors.pixelpress.pub/public",
        ),
        // Finance / fintech
        (
            "Vault Finance",
            "vaultfinance.io",
            "/var/www/vaultfinance.io/public",
        ),
        (
            "Vault App",
            "app.vaultfinance.io",
            "/var/www/app.vaultfinance.io/public",
        ),
        (
            "Vault API",
            "api.vaultfinance.io",
            "/var/www/api.vaultfinance.io/public",
        ),
        (
            "PayBridge",
            "paybridge.finance",
            "/var/www/paybridge.finance/public",
        ),
        (
            "PayBridge Dashboard",
            "dashboard.paybridge.finance",
            "/var/www/dashboard.paybridge.finance/public",
        ),
        (
            "TokenLedger",
            "tokenledger.co",
            "/var/www/tokenledger.co/public",
        ),
        (
            "TokenLedger API",
            "api.tokenledger.co",
            "/var/www/api.tokenledger.co/public",
        ),
        (
            "ClearBooks",
            "clearbooks.accountancy",
            "/var/www/clearbooks.accountancy/public",
        ),
        (
            "ClearBooks Client",
            "clients.clearbooks.accountancy",
            "/var/www/clients.clearbooks.accountancy/public",
        ),
        (
            "WealthGraph",
            "wealthgraph.app",
            "/var/www/wealthgraph.app/public",
        ),
        // Travel / hospitality
        (
            "Roam Travel",
            "roamtravel.com",
            "/var/www/roamtravel.com/public",
        ),
        (
            "Roam Bookings",
            "book.roamtravel.com",
            "/var/www/book.roamtravel.com/public",
        ),
        (
            "StayEasy",
            "stayeasy.rentals",
            "/var/www/stayeasy.rentals/public",
        ),
        (
            "StayEasy Host",
            "host.stayeasy.rentals",
            "/var/www/host.stayeasy.rentals/public",
        ),
        (
            "Horizon Hotels",
            "horizonhotels.co",
            "/var/www/horizonhotels.co/public",
        ),
        (
            "Horizon Reservations",
            "reservations.horizonhotels.co",
            "/var/www/reservations.horizonhotels.co/public",
        ),
        (
            "Voyage Planner",
            "voyageplanner.travel",
            "/var/www/voyageplanner.travel/public",
        ),
        (
            "Voyage API",
            "api.voyageplanner.travel",
            "/var/www/api.voyageplanner.travel/public",
        ),
        (
            "Atlas Tours",
            "atlastours.guide",
            "/var/www/atlastours.guide/public",
        ),
        (
            "Atlas Bookings",
            "book.atlastours.guide",
            "/var/www/book.atlastours.guide/public",
        ),
        // Food / delivery
        (
            "FoodRun",
            "foodrun.delivery",
            "/var/www/foodrun.delivery/public",
        ),
        (
            "FoodRun Merchant",
            "merchant.foodrun.delivery",
            "/var/www/merchant.foodrun.delivery/public",
        ),
        (
            "Saffron Kitchen",
            "saffronkitchen.com",
            "/var/www/saffronkitchen.com/public",
        ),
        (
            "Saffron Orders",
            "orders.saffronkitchen.com",
            "/var/www/orders.saffronkitchen.com/public",
        ),
        (
            "Bento Box",
            "bentobox.food",
            "/var/www/bentobox.food/public",
        ),
        (
            "Bento Catering",
            "catering.bentobox.food",
            "/var/www/catering.bentobox.food/public",
        ),
        (
            "Harvest Table",
            "harvesttable.co",
            "/var/www/harvesttable.co/public",
        ),
        (
            "Harvest Checkout",
            "checkout.harvesttable.co",
            "/var/www/checkout.harvesttable.co/public",
        ),
        (
            "QuickBite",
            "quickbite.app",
            "/var/www/quickbite.app/public",
        ),
        (
            "QuickBite Driver",
            "driver.quickbite.app",
            "/var/www/driver.quickbite.app/public",
        ),
        // Real estate / property
        (
            "NestFinder",
            "nestfinder.properties",
            "/var/www/nestfinder.properties/public",
        ),
        (
            "NestFinder Agent",
            "agent.nestfinder.properties",
            "/var/www/agent.nestfinder.properties/public",
        ),
        ("PropTrack", "proptrack.io", "/var/www/proptrack.io/public"),
        (
            "PropTrack Listings",
            "listings.proptrack.io",
            "/var/www/listings.proptrack.io/public",
        ),
        (
            "Keystone Realty",
            "keystonerealty.com",
            "/var/www/keystonerealty.com/public",
        ),
        (
            "Keystone Portal",
            "portal.keystonerealty.com",
            "/var/www/portal.keystonerealty.com/public",
        ),
        (
            "Urban Loft",
            "urbanloft.rent",
            "/var/www/urbanloft.rent/public",
        ),
        (
            "Urban Loft Tenant",
            "tenants.urbanloft.rent",
            "/var/www/tenants.urbanloft.rent/public",
        ),
        (
            "SpaceShare",
            "spaceshare.co",
            "/var/www/spaceshare.co/public",
        ),
        (
            "SpaceShare Host",
            "host.spaceshare.co",
            "/var/www/host.spaceshare.co/public",
        ),
        // Logistics / supply chain
        (
            "SwiftLog",
            "swiftlog.logistics",
            "/var/www/swiftlog.logistics/public",
        ),
        (
            "SwiftLog Tracking",
            "track.swiftlog.logistics",
            "/var/www/track.swiftlog.logistics/public",
        ),
        ("CargoNow", "cargonow.io", "/var/www/cargonow.io/public"),
        (
            "CargoNow Dashboard",
            "dashboard.cargonow.io",
            "/var/www/dashboard.cargonow.io/public",
        ),
        (
            "Route Master",
            "routemaster.delivery",
            "/var/www/routemaster.delivery/public",
        ),
        (
            "Route Master API",
            "api.routemaster.delivery",
            "/var/www/api.routemaster.delivery/public",
        ),
        (
            "PackFlow",
            "packflow.supply",
            "/var/www/packflow.supply/public",
        ),
        (
            "PackFlow WMS",
            "wms.packflow.supply",
            "/var/www/wms.packflow.supply/public",
        ),
        (
            "Freightwise",
            "freightwise.global",
            "/var/www/freightwise.global/public",
        ),
        (
            "Freightwise Quotes",
            "quotes.freightwise.global",
            "/var/www/quotes.freightwise.global/public",
        ),
        // HR / workforce
        (
            "TalentCore",
            "talentcore.hr",
            "/var/www/talentcore.hr/public",
        ),
        (
            "TalentCore Portal",
            "portal.talentcore.hr",
            "/var/www/portal.talentcore.hr/public",
        ),
        ("PeopleOS", "peopleos.app", "/var/www/peopleos.app/public"),
        (
            "PeopleOS API",
            "api.peopleos.app",
            "/var/www/api.peopleos.app/public",
        ),
        ("HireFlow", "hireflow.io", "/var/www/hireflow.io/public"),
        (
            "HireFlow Careers",
            "careers.hireflow.io",
            "/var/www/careers.hireflow.io/public",
        ),
        (
            "ShiftSync",
            "shiftsync.works",
            "/var/www/shiftsync.works/public",
        ),
        (
            "ShiftSync Manager",
            "manager.shiftsync.works",
            "/var/www/manager.shiftsync.works/public",
        ),
        (
            "PayrollNow",
            "payrollnow.co",
            "/var/www/payrollnow.co/public",
        ),
        (
            "PayrollNow Reports",
            "reports.payrollnow.co",
            "/var/www/reports.payrollnow.co/public",
        ),
        // IoT / smart home
        ("SmartNest", "smartnest.io", "/var/www/smartnest.io/public"),
        (
            "SmartNest Hub",
            "hub.smartnest.io",
            "/var/www/hub.smartnest.io/public",
        ),
        ("Iotify", "iotify.cloud", "/var/www/iotify.cloud/public"),
        (
            "Iotify Dashboard",
            "dashboard.iotify.cloud",
            "/var/www/dashboard.iotify.cloud/public",
        ),
        (
            "SensorNet",
            "sensornet.dev",
            "/var/www/sensornet.dev/public",
        ),
        (
            "SensorNet API",
            "api.sensornet.dev",
            "/var/www/api.sensornet.dev/public",
        ),
        (
            "GridWatch",
            "gridwatch.energy",
            "/var/www/gridwatch.energy/public",
        ),
        (
            "GridWatch Monitor",
            "monitor.gridwatch.energy",
            "/var/www/monitor.gridwatch.energy/public",
        ),
        (
            "AutoHome",
            "autohome.systems",
            "/var/www/autohome.systems/public",
        ),
        (
            "AutoHome Control",
            "control.autohome.systems",
            "/var/www/control.autohome.systems/public",
        ),
        // Security / infosec
        (
            "VaultGuard",
            "vaultguard.security",
            "/var/www/vaultguard.security/public",
        ),
        (
            "VaultGuard Portal",
            "portal.vaultguard.security",
            "/var/www/portal.vaultguard.security/public",
        ),
        ("PenScope", "penscope.io", "/var/www/penscope.io/public"),
        (
            "PenScope Reports",
            "reports.penscope.io",
            "/var/www/reports.penscope.io/public",
        ),
        ("ShieldAI", "shieldai.tech", "/var/www/shieldai.tech/public"),
        (
            "ShieldAI Alerts",
            "alerts.shieldai.tech",
            "/var/www/alerts.shieldai.tech/public",
        ),
        (
            "TrustLink",
            "trustlink.net",
            "/var/www/trustlink.net/public",
        ),
        (
            "TrustLink Admin",
            "admin.trustlink.net",
            "/var/www/admin.trustlink.net/public",
        ),
        (
            "CipherVault",
            "ciphervault.co",
            "/var/www/ciphervault.co/public",
        ),
        (
            "CipherVault API",
            "api.ciphervault.co",
            "/var/www/api.ciphervault.co/public",
        ),
        // Marketing / CRM
        (
            "LeadPulse",
            "leadpulse.marketing",
            "/var/www/leadpulse.marketing/public",
        ),
        (
            "LeadPulse CRM",
            "crm.leadpulse.marketing",
            "/var/www/crm.leadpulse.marketing/public",
        ),
        (
            "CampaignKit",
            "campaignkit.io",
            "/var/www/campaignkit.io/public",
        ),
        (
            "CampaignKit Reports",
            "reports.campaignkit.io",
            "/var/www/reports.campaignkit.io/public",
        ),
        (
            "ReachMore",
            "reachmore.email",
            "/var/www/reachmore.email/public",
        ),
        (
            "ReachMore Lists",
            "lists.reachmore.email",
            "/var/www/lists.reachmore.email/public",
        ),
        ("BrandBeat", "brandbeat.co", "/var/www/brandbeat.co/public"),
        (
            "BrandBeat Analytics",
            "analytics.brandbeat.co",
            "/var/www/analytics.brandbeat.co/public",
        ),
        (
            "Funnel Labs",
            "funnellabs.growth",
            "/var/www/funnellabs.growth/public",
        ),
        (
            "Funnel Labs API",
            "api.funnellabs.growth",
            "/var/www/api.funnellabs.growth/public",
        ),
        // Gaming
        (
            "PixelVault Games",
            "pixelvaultgames.com",
            "/var/www/pixelvaultgames.com/public",
        ),
        (
            "PixelVault Store",
            "store.pixelvaultgames.com",
            "/var/www/store.pixelvaultgames.com/public",
        ),
        ("GameCraft", "gamecraft.gg", "/var/www/gamecraft.gg/public"),
        (
            "GameCraft API",
            "api.gamecraft.gg",
            "/var/www/api.gamecraft.gg/public",
        ),
        (
            "LevelUp Studios",
            "levelupstudios.games",
            "/var/www/levelupstudios.games/public",
        ),
        (
            "LevelUp CDN",
            "cdn.levelupstudios.games",
            "/var/www/cdn.levelupstudios.games/public",
        ),
        (
            "ArenaNet",
            "arenanet.online",
            "/var/www/arenanet.online/public",
        ),
        (
            "ArenaNet Leagues",
            "leagues.arenanet.online",
            "/var/www/leagues.arenanet.online/public",
        ),
        (
            "QuestBridge",
            "questbridge.co",
            "/var/www/questbridge.co/public",
        ),
        (
            "QuestBridge API",
            "api.questbridge.co",
            "/var/www/api.questbridge.co/public",
        ),
        // AI / ML
        (
            "NeuralBase",
            "neuralbase.ai",
            "/var/www/neuralbase.ai/public",
        ),
        (
            "NeuralBase API",
            "api.neuralbase.ai",
            "/var/www/api.neuralbase.ai/public",
        ),
        (
            "NeuralBase Docs",
            "docs.neuralbase.ai",
            "/var/www/docs.neuralbase.ai/public",
        ),
        ("InferCore", "infercore.ml", "/var/www/infercore.ml/public"),
        (
            "InferCore Dashboard",
            "dashboard.infercore.ml",
            "/var/www/dashboard.infercore.ml/public",
        ),
        ("DataMind", "datamind.io", "/var/www/datamind.io/public"),
        (
            "DataMind Studio",
            "studio.datamind.io",
            "/var/www/studio.datamind.io/public",
        ),
        ("Cognify", "cognify.ai", "/var/www/cognify.ai/public"),
        (
            "Cognify API",
            "api.cognify.ai",
            "/var/www/api.cognify.ai/public",
        ),
        ("ModelHub", "modelhub.tech", "/var/www/modelhub.tech/public"),
    ];

    let n_servers = server_ids.len();
    for (i, (name, domain, document_root)) in sites.iter().enumerate() {
        let (server_id, server_hostname) = &server_ids[i % n_servers];
        sqlx::query(
            "INSERT INTO sites (name, primary_domain, server_id, document_root, status) \
             VALUES ($1, $2, $3, $4, 'active') ON CONFLICT (primary_domain) DO NOTHING",
        )
        .bind(name)
        .bind(domain)
        .bind(server_id)
        .bind(document_root)
        .execute(pool)
        .await?;
        println!("  site {domain} → {server_hostname}");
    }
    Ok(())
}
