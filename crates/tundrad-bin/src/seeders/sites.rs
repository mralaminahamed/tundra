use sqlx::PgPool;
use uuid::Uuid;

/// Application type shorthand used in the site table below.
///
/// | code    | kind     | runtime | source_kind | template_id  |
/// |---------|----------|---------|-------------|--------------|
/// | "wp"    | php      | 8.3     | template    | wordpress    |
/// | "woo"   | php      | 8.3     | template    | woocommerce  |
/// | "php"   | php      | 8.3     | blank       | —            |
/// | "node"  | nodejs   | 22      | blank       | —            |
/// | "static"| static   | 22      | blank       | —            |
/// | "py"    | python   | 3.12    | blank       | —            |
/// | "go"    | go       | 1.23    | blank       | —            |
struct AppSpec {
    kind: &'static str,
    runtime_version: &'static str,
    source_kind: &'static str,
    template_id: Option<&'static str>,
}

fn app_spec(code: &str) -> AppSpec {
    match code {
        "wp" => AppSpec {
            kind: "php",
            runtime_version: "8.3",
            source_kind: "template",
            template_id: Some("wordpress"),
        },
        "woo" => AppSpec {
            kind: "php",
            runtime_version: "8.3",
            source_kind: "template",
            template_id: Some("woocommerce"),
        },
        "php" => AppSpec {
            kind: "php",
            runtime_version: "8.3",
            source_kind: "blank",
            template_id: None,
        },
        "node" => AppSpec {
            kind: "nodejs",
            runtime_version: "22",
            source_kind: "blank",
            template_id: None,
        },
        "static" => AppSpec {
            kind: "static",
            runtime_version: "22",
            source_kind: "blank",
            template_id: None,
        },
        "py" => AppSpec {
            kind: "python",
            runtime_version: "3.12",
            source_kind: "blank",
            template_id: None,
        },
        "go" => AppSpec {
            kind: "go",
            runtime_version: "1.23",
            source_kind: "blank",
            template_id: None,
        },
        _ => AppSpec {
            kind: "nodejs",
            runtime_version: "22",
            source_kind: "blank",
            template_id: None,
        },
    }
}

pub async fn run(pool: &PgPool) -> anyhow::Result<()> {
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

    // (name, primary_domain, document_root, app_type)
    let sites: &[(&str, &str, &str, &str)] = &[
        // ── SaaS / tech products ──────────────────────────────────────────────
        (
            "Acme Corp",
            "acme-corp.io",
            "/var/www/acme-corp.io/public",
            "node",
        ),
        (
            "Acme API",
            "api.acme-corp.io",
            "/var/www/api.acme-corp.io/public",
            "node",
        ),
        (
            "Acme Dashboard",
            "app.acme-corp.io",
            "/var/www/app.acme-corp.io/public",
            "static",
        ),
        (
            "Nexus Platform",
            "nexusplatform.com",
            "/var/www/nexusplatform.com/public",
            "node",
        ),
        (
            "Nexus Docs",
            "docs.nexusplatform.com",
            "/var/www/docs.nexusplatform.com/public",
            "static",
        ),
        (
            "Nexus Status",
            "status.nexusplatform.com",
            "/var/www/status.nexusplatform.com/public",
            "static",
        ),
        (
            "Orbit Analytics",
            "orbitanalytics.io",
            "/var/www/orbitanalytics.io/public",
            "node",
        ),
        (
            "Orbit API",
            "api.orbitanalytics.io",
            "/var/www/api.orbitanalytics.io/public",
            "node",
        ),
        (
            "Spark Commerce",
            "sparkcommerce.store",
            "/var/www/sparkcommerce.store/public",
            "woo",
        ),
        (
            "Spark Admin",
            "admin.sparkcommerce.store",
            "/var/www/admin.sparkcommerce.store/public",
            "node",
        ),
        (
            "Prism Design",
            "prismdesign.co",
            "/var/www/prismdesign.co/public",
            "wp",
        ),
        (
            "Prism Portfolio",
            "portfolio.prismdesign.co",
            "/var/www/portfolio.prismdesign.co/public",
            "static",
        ),
        (
            "Forge Dev Tools",
            "forgedevtools.dev",
            "/var/www/forgedevtools.dev/public",
            "node",
        ),
        (
            "Forge Docs",
            "docs.forgedevtools.dev",
            "/var/www/docs.forgedevtools.dev/public",
            "static",
        ),
        (
            "Vela Shipping",
            "velashipping.com",
            "/var/www/velashipping.com/public",
            "node",
        ),
        (
            "Vela Tracker",
            "track.velashipping.com",
            "/var/www/track.velashipping.com/public",
            "node",
        ),
        (
            "Crest Finance",
            "crestfinance.app",
            "/var/www/crestfinance.app/public",
            "node",
        ),
        (
            "Crest API",
            "api.crestfinance.app",
            "/var/www/api.crestfinance.app/public",
            "node",
        ),
        (
            "Nova Media",
            "novamedia.studio",
            "/var/www/novamedia.studio/public",
            "wp",
        ),
        (
            "Nova Blog",
            "blog.novamedia.studio",
            "/var/www/blog.novamedia.studio/public",
            "wp",
        ),
        // ── E-commerce ───────────────────────────────────────────────────────
        (
            "Bloom Botanicals",
            "bloombotanicals.com",
            "/var/www/bloombotanicals.com/public",
            "woo",
        ),
        (
            "Bloom Shop",
            "shop.bloombotanicals.com",
            "/var/www/shop.bloombotanicals.com/public",
            "woo",
        ),
        (
            "Summit Outdoor",
            "summitoutdoor.co",
            "/var/www/summitoutdoor.co/public",
            "woo",
        ),
        (
            "Summit Store",
            "store.summitoutdoor.co",
            "/var/www/store.summitoutdoor.co/public",
            "woo",
        ),
        (
            "Urban Threads",
            "urbanthreads.shop",
            "/var/www/urbanthreads.shop/public",
            "woo",
        ),
        (
            "Urban API",
            "api.urbanthreads.shop",
            "/var/www/api.urbanthreads.shop/public",
            "node",
        ),
        (
            "Pearl Jewellery",
            "pearljewellery.store",
            "/var/www/pearljewellery.store/public",
            "woo",
        ),
        (
            "Rustic Home",
            "rustichome.co",
            "/var/www/rustichome.co/public",
            "woo",
        ),
        (
            "Rustic Admin",
            "admin.rustichome.co",
            "/var/www/admin.rustichome.co/public",
            "node",
        ),
        (
            "Coastal Surf",
            "coastalsurf.shop",
            "/var/www/coastalsurf.shop/public",
            "woo",
        ),
        // ── Agencies / studios ───────────────────────────────────────────────
        (
            "Pixel Agency",
            "pixelagency.design",
            "/var/www/pixelagency.design/public",
            "wp",
        ),
        (
            "Pixel Projects",
            "projects.pixelagency.design",
            "/var/www/projects.pixelagency.design/public",
            "static",
        ),
        (
            "Arc Studio",
            "arcstudio.xyz",
            "/var/www/arcstudio.xyz/public",
            "wp",
        ),
        (
            "Arc Client Portal",
            "portal.arcstudio.xyz",
            "/var/www/portal.arcstudio.xyz/public",
            "static",
        ),
        (
            "Memo Creative",
            "memocreative.com",
            "/var/www/memocreative.com/public",
            "wp",
        ),
        (
            "Memo Work",
            "work.memocreative.com",
            "/var/www/work.memocreative.com/public",
            "static",
        ),
        (
            "Lume Digital",
            "lumedigital.agency",
            "/var/www/lumedigital.agency/public",
            "wp",
        ),
        (
            "Lume Client",
            "clients.lumedigital.agency",
            "/var/www/clients.lumedigital.agency/public",
            "static",
        ),
        (
            "Canvas Works",
            "canvasworks.art",
            "/var/www/canvasworks.art/public",
            "wp",
        ),
        (
            "Canvas Gallery",
            "gallery.canvasworks.art",
            "/var/www/gallery.canvasworks.art/public",
            "static",
        ),
        // ── Developer tools ──────────────────────────────────────────────────
        (
            "CodeFlow",
            "codeflow.dev",
            "/var/www/codeflow.dev/public",
            "node",
        ),
        (
            "CodeFlow Docs",
            "docs.codeflow.dev",
            "/var/www/docs.codeflow.dev/public",
            "static",
        ),
        (
            "CodeFlow API",
            "api.codeflow.dev",
            "/var/www/api.codeflow.dev/public",
            "node",
        ),
        ("Stackr", "stackr.io", "/var/www/stackr.io/public", "node"),
        (
            "Stackr Dashboard",
            "app.stackr.io",
            "/var/www/app.stackr.io/public",
            "static",
        ),
        (
            "DevHub",
            "devhub.tools",
            "/var/www/devhub.tools/public",
            "node",
        ),
        (
            "DevHub Registry",
            "registry.devhub.tools",
            "/var/www/registry.devhub.tools/public",
            "node",
        ),
        (
            "Patchwork OSS",
            "patchwork.dev",
            "/var/www/patchwork.dev/public",
            "node",
        ),
        (
            "Relay CI",
            "relayci.io",
            "/var/www/relayci.io/public",
            "node",
        ),
        (
            "Relay Builds",
            "builds.relayci.io",
            "/var/www/builds.relayci.io/public",
            "static",
        ),
        // ── Healthcare / wellness ─────────────────────────────────────────────
        (
            "MediTrack",
            "meditrack.health",
            "/var/www/meditrack.health/public",
            "node",
        ),
        (
            "MediTrack App",
            "app.meditrack.health",
            "/var/www/app.meditrack.health/public",
            "static",
        ),
        (
            "Wellpath",
            "wellpath.care",
            "/var/www/wellpath.care/public",
            "node",
        ),
        (
            "Wellpath Portal",
            "my.wellpath.care",
            "/var/www/my.wellpath.care/public",
            "static",
        ),
        (
            "FitPulse",
            "fitpulse.app",
            "/var/www/fitpulse.app/public",
            "node",
        ),
        (
            "FitPulse API",
            "api.fitpulse.app",
            "/var/www/api.fitpulse.app/public",
            "node",
        ),
        (
            "ZenMind",
            "zenmind.co",
            "/var/www/zenmind.co/public",
            "node",
        ),
        (
            "ZenMind Sessions",
            "sessions.zenmind.co",
            "/var/www/sessions.zenmind.co/public",
            "static",
        ),
        (
            "ClearRx",
            "clearrx.pharmacy",
            "/var/www/clearrx.pharmacy/public",
            "php",
        ),
        (
            "ClearRx Orders",
            "orders.clearrx.pharmacy",
            "/var/www/orders.clearrx.pharmacy/public",
            "node",
        ),
        // ── Education ────────────────────────────────────────────────────────
        (
            "LearnLoop",
            "learnloop.edu",
            "/var/www/learnloop.edu/public",
            "node",
        ),
        (
            "LearnLoop Courses",
            "courses.learnloop.edu",
            "/var/www/courses.learnloop.edu/public",
            "static",
        ),
        (
            "AcademiQ",
            "academiq.io",
            "/var/www/academiq.io/public",
            "node",
        ),
        (
            "AcademiQ Dashboard",
            "app.academiq.io",
            "/var/www/app.academiq.io/public",
            "static",
        ),
        (
            "TutorBase",
            "tutorbase.com",
            "/var/www/tutorbase.com/public",
            "node",
        ),
        (
            "TutorBase API",
            "api.tutorbase.com",
            "/var/www/api.tutorbase.com/public",
            "node",
        ),
        (
            "SkillBridge",
            "skillbridge.training",
            "/var/www/skillbridge.training/public",
            "node",
        ),
        (
            "SkillBridge Portal",
            "portal.skillbridge.training",
            "/var/www/portal.skillbridge.training/public",
            "static",
        ),
        (
            "QuizLab",
            "quizlab.online",
            "/var/www/quizlab.online/public",
            "node",
        ),
        (
            "QuizLab Results",
            "results.quizlab.online",
            "/var/www/results.quizlab.online/public",
            "static",
        ),
        // ── Media / publishing ───────────────────────────────────────────────
        (
            "The Daily Wire",
            "thedailywire.press",
            "/var/www/thedailywire.press/public",
            "wp",
        ),
        (
            "Wire Editorial",
            "editorial.thedailywire.press",
            "/var/www/editorial.thedailywire.press/public",
            "node",
        ),
        (
            "Epoch Magazine",
            "epochmagazine.com",
            "/var/www/epochmagazine.com/public",
            "wp",
        ),
        (
            "Epoch Subscribers",
            "members.epochmagazine.com",
            "/var/www/members.epochmagazine.com/public",
            "static",
        ),
        (
            "Broadcast Now",
            "broadcastnow.tv",
            "/var/www/broadcastnow.tv/public",
            "node",
        ),
        (
            "Broadcast Stream",
            "stream.broadcastnow.tv",
            "/var/www/stream.broadcastnow.tv/public",
            "node",
        ),
        (
            "Podcast Central",
            "podcastcentral.fm",
            "/var/www/podcastcentral.fm/public",
            "wp",
        ),
        (
            "Podcast RSS",
            "feeds.podcastcentral.fm",
            "/var/www/feeds.podcastcentral.fm/public",
            "node",
        ),
        (
            "PixelPress",
            "pixelpress.pub",
            "/var/www/pixelpress.pub/public",
            "wp",
        ),
        (
            "PixelPress Authors",
            "authors.pixelpress.pub",
            "/var/www/authors.pixelpress.pub/public",
            "static",
        ),
        // ── Finance / fintech ────────────────────────────────────────────────
        (
            "Vault Finance",
            "vaultfinance.io",
            "/var/www/vaultfinance.io/public",
            "node",
        ),
        (
            "Vault App",
            "app.vaultfinance.io",
            "/var/www/app.vaultfinance.io/public",
            "static",
        ),
        (
            "Vault API",
            "api.vaultfinance.io",
            "/var/www/api.vaultfinance.io/public",
            "node",
        ),
        (
            "PayBridge",
            "paybridge.finance",
            "/var/www/paybridge.finance/public",
            "node",
        ),
        (
            "PayBridge Dashboard",
            "dashboard.paybridge.finance",
            "/var/www/dashboard.paybridge.finance/public",
            "static",
        ),
        (
            "TokenLedger",
            "tokenledger.co",
            "/var/www/tokenledger.co/public",
            "node",
        ),
        (
            "TokenLedger API",
            "api.tokenledger.co",
            "/var/www/api.tokenledger.co/public",
            "node",
        ),
        (
            "ClearBooks",
            "clearbooks.accountancy",
            "/var/www/clearbooks.accountancy/public",
            "php",
        ),
        (
            "ClearBooks Client",
            "clients.clearbooks.accountancy",
            "/var/www/clients.clearbooks.accountancy/public",
            "static",
        ),
        (
            "WealthGraph",
            "wealthgraph.app",
            "/var/www/wealthgraph.app/public",
            "node",
        ),
        // ── Travel / hospitality ─────────────────────────────────────────────
        (
            "Roam Travel",
            "roamtravel.com",
            "/var/www/roamtravel.com/public",
            "node",
        ),
        (
            "Roam Bookings",
            "book.roamtravel.com",
            "/var/www/book.roamtravel.com/public",
            "node",
        ),
        (
            "StayEasy",
            "stayeasy.rentals",
            "/var/www/stayeasy.rentals/public",
            "node",
        ),
        (
            "StayEasy Host",
            "host.stayeasy.rentals",
            "/var/www/host.stayeasy.rentals/public",
            "node",
        ),
        (
            "Horizon Hotels",
            "horizonhotels.co",
            "/var/www/horizonhotels.co/public",
            "node",
        ),
        (
            "Horizon Reservations",
            "reservations.horizonhotels.co",
            "/var/www/reservations.horizonhotels.co/public",
            "node",
        ),
        (
            "Voyage Planner",
            "voyageplanner.travel",
            "/var/www/voyageplanner.travel/public",
            "node",
        ),
        (
            "Voyage API",
            "api.voyageplanner.travel",
            "/var/www/api.voyageplanner.travel/public",
            "node",
        ),
        (
            "Atlas Tours",
            "atlastours.guide",
            "/var/www/atlastours.guide/public",
            "wp",
        ),
        (
            "Atlas Bookings",
            "book.atlastours.guide",
            "/var/www/book.atlastours.guide/public",
            "node",
        ),
        // ── Food / delivery ───────────────────────────────────────────────────
        (
            "FoodRun",
            "foodrun.delivery",
            "/var/www/foodrun.delivery/public",
            "node",
        ),
        (
            "FoodRun Merchant",
            "merchant.foodrun.delivery",
            "/var/www/merchant.foodrun.delivery/public",
            "node",
        ),
        (
            "Saffron Kitchen",
            "saffronkitchen.com",
            "/var/www/saffronkitchen.com/public",
            "woo",
        ),
        (
            "Saffron Orders",
            "orders.saffronkitchen.com",
            "/var/www/orders.saffronkitchen.com/public",
            "node",
        ),
        (
            "Bento Box",
            "bentobox.food",
            "/var/www/bentobox.food/public",
            "woo",
        ),
        (
            "Bento Catering",
            "catering.bentobox.food",
            "/var/www/catering.bentobox.food/public",
            "node",
        ),
        (
            "Harvest Table",
            "harvesttable.co",
            "/var/www/harvesttable.co/public",
            "woo",
        ),
        (
            "Harvest Checkout",
            "checkout.harvesttable.co",
            "/var/www/checkout.harvesttable.co/public",
            "node",
        ),
        (
            "QuickBite",
            "quickbite.app",
            "/var/www/quickbite.app/public",
            "node",
        ),
        (
            "QuickBite Driver",
            "driver.quickbite.app",
            "/var/www/driver.quickbite.app/public",
            "node",
        ),
        // ── Real estate ──────────────────────────────────────────────────────
        (
            "NestFinder",
            "nestfinder.properties",
            "/var/www/nestfinder.properties/public",
            "node",
        ),
        (
            "NestFinder Agent",
            "agent.nestfinder.properties",
            "/var/www/agent.nestfinder.properties/public",
            "static",
        ),
        (
            "PropTrack",
            "proptrack.io",
            "/var/www/proptrack.io/public",
            "node",
        ),
        (
            "PropTrack Listings",
            "listings.proptrack.io",
            "/var/www/listings.proptrack.io/public",
            "static",
        ),
        (
            "Keystone Realty",
            "keystonerealty.com",
            "/var/www/keystonerealty.com/public",
            "node",
        ),
        (
            "Keystone Portal",
            "portal.keystonerealty.com",
            "/var/www/portal.keystonerealty.com/public",
            "static",
        ),
        (
            "Urban Loft",
            "urbanloft.rent",
            "/var/www/urbanloft.rent/public",
            "node",
        ),
        (
            "Urban Loft Tenant",
            "tenants.urbanloft.rent",
            "/var/www/tenants.urbanloft.rent/public",
            "static",
        ),
        (
            "SpaceShare",
            "spaceshare.co",
            "/var/www/spaceshare.co/public",
            "node",
        ),
        (
            "SpaceShare Host",
            "host.spaceshare.co",
            "/var/www/host.spaceshare.co/public",
            "node",
        ),
        // ── Logistics / supply chain ─────────────────────────────────────────
        (
            "SwiftLog",
            "swiftlog.logistics",
            "/var/www/swiftlog.logistics/public",
            "node",
        ),
        (
            "SwiftLog Tracking",
            "track.swiftlog.logistics",
            "/var/www/track.swiftlog.logistics/public",
            "node",
        ),
        (
            "CargoNow",
            "cargonow.io",
            "/var/www/cargonow.io/public",
            "node",
        ),
        (
            "CargoNow Dashboard",
            "dashboard.cargonow.io",
            "/var/www/dashboard.cargonow.io/public",
            "static",
        ),
        (
            "Route Master",
            "routemaster.delivery",
            "/var/www/routemaster.delivery/public",
            "go",
        ),
        (
            "Route Master API",
            "api.routemaster.delivery",
            "/var/www/api.routemaster.delivery/public",
            "go",
        ),
        (
            "PackFlow",
            "packflow.supply",
            "/var/www/packflow.supply/public",
            "node",
        ),
        (
            "PackFlow WMS",
            "wms.packflow.supply",
            "/var/www/wms.packflow.supply/public",
            "static",
        ),
        (
            "Freightwise",
            "freightwise.global",
            "/var/www/freightwise.global/public",
            "node",
        ),
        (
            "Freightwise Quotes",
            "quotes.freightwise.global",
            "/var/www/quotes.freightwise.global/public",
            "static",
        ),
        // ── HR / workforce ───────────────────────────────────────────────────
        (
            "TalentCore",
            "talentcore.hr",
            "/var/www/talentcore.hr/public",
            "node",
        ),
        (
            "TalentCore Portal",
            "portal.talentcore.hr",
            "/var/www/portal.talentcore.hr/public",
            "static",
        ),
        (
            "PeopleOS",
            "peopleos.app",
            "/var/www/peopleos.app/public",
            "node",
        ),
        (
            "PeopleOS API",
            "api.peopleos.app",
            "/var/www/api.peopleos.app/public",
            "node",
        ),
        (
            "HireFlow",
            "hireflow.io",
            "/var/www/hireflow.io/public",
            "node",
        ),
        (
            "HireFlow Careers",
            "careers.hireflow.io",
            "/var/www/careers.hireflow.io/public",
            "static",
        ),
        (
            "ShiftSync",
            "shiftsync.works",
            "/var/www/shiftsync.works/public",
            "node",
        ),
        (
            "ShiftSync Manager",
            "manager.shiftsync.works",
            "/var/www/manager.shiftsync.works/public",
            "static",
        ),
        (
            "PayrollNow",
            "payrollnow.co",
            "/var/www/payrollnow.co/public",
            "node",
        ),
        (
            "PayrollNow Reports",
            "reports.payrollnow.co",
            "/var/www/reports.payrollnow.co/public",
            "static",
        ),
        // ── IoT / smart home ─────────────────────────────────────────────────
        (
            "SmartNest",
            "smartnest.io",
            "/var/www/smartnest.io/public",
            "node",
        ),
        (
            "SmartNest Hub",
            "hub.smartnest.io",
            "/var/www/hub.smartnest.io/public",
            "static",
        ),
        (
            "Iotify",
            "iotify.cloud",
            "/var/www/iotify.cloud/public",
            "go",
        ),
        (
            "Iotify Dashboard",
            "dashboard.iotify.cloud",
            "/var/www/dashboard.iotify.cloud/public",
            "static",
        ),
        (
            "SensorNet",
            "sensornet.dev",
            "/var/www/sensornet.dev/public",
            "go",
        ),
        (
            "SensorNet API",
            "api.sensornet.dev",
            "/var/www/api.sensornet.dev/public",
            "go",
        ),
        (
            "GridWatch",
            "gridwatch.energy",
            "/var/www/gridwatch.energy/public",
            "py",
        ),
        (
            "GridWatch Monitor",
            "monitor.gridwatch.energy",
            "/var/www/monitor.gridwatch.energy/public",
            "static",
        ),
        (
            "AutoHome",
            "autohome.systems",
            "/var/www/autohome.systems/public",
            "node",
        ),
        (
            "AutoHome Control",
            "control.autohome.systems",
            "/var/www/control.autohome.systems/public",
            "static",
        ),
        // ── Security / infosec ───────────────────────────────────────────────
        (
            "VaultGuard",
            "vaultguard.security",
            "/var/www/vaultguard.security/public",
            "node",
        ),
        (
            "VaultGuard Portal",
            "portal.vaultguard.security",
            "/var/www/portal.vaultguard.security/public",
            "static",
        ),
        (
            "PenScope",
            "penscope.io",
            "/var/www/penscope.io/public",
            "node",
        ),
        (
            "PenScope Reports",
            "reports.penscope.io",
            "/var/www/reports.penscope.io/public",
            "static",
        ),
        (
            "ShieldAI",
            "shieldai.tech",
            "/var/www/shieldai.tech/public",
            "py",
        ),
        (
            "ShieldAI Alerts",
            "alerts.shieldai.tech",
            "/var/www/alerts.shieldai.tech/public",
            "static",
        ),
        (
            "TrustLink",
            "trustlink.net",
            "/var/www/trustlink.net/public",
            "node",
        ),
        (
            "TrustLink Admin",
            "admin.trustlink.net",
            "/var/www/admin.trustlink.net/public",
            "static",
        ),
        (
            "CipherVault",
            "ciphervault.co",
            "/var/www/ciphervault.co/public",
            "node",
        ),
        (
            "CipherVault API",
            "api.ciphervault.co",
            "/var/www/api.ciphervault.co/public",
            "node",
        ),
        // ── Marketing / CRM ──────────────────────────────────────────────────
        (
            "LeadPulse",
            "leadpulse.marketing",
            "/var/www/leadpulse.marketing/public",
            "node",
        ),
        (
            "LeadPulse CRM",
            "crm.leadpulse.marketing",
            "/var/www/crm.leadpulse.marketing/public",
            "static",
        ),
        (
            "CampaignKit",
            "campaignkit.io",
            "/var/www/campaignkit.io/public",
            "node",
        ),
        (
            "CampaignKit Reports",
            "reports.campaignkit.io",
            "/var/www/reports.campaignkit.io/public",
            "static",
        ),
        (
            "ReachMore",
            "reachmore.email",
            "/var/www/reachmore.email/public",
            "node",
        ),
        (
            "ReachMore Lists",
            "lists.reachmore.email",
            "/var/www/lists.reachmore.email/public",
            "node",
        ),
        (
            "BrandBeat",
            "brandbeat.co",
            "/var/www/brandbeat.co/public",
            "node",
        ),
        (
            "BrandBeat Analytics",
            "analytics.brandbeat.co",
            "/var/www/analytics.brandbeat.co/public",
            "static",
        ),
        (
            "Funnel Labs",
            "funnellabs.growth",
            "/var/www/funnellabs.growth/public",
            "node",
        ),
        (
            "Funnel Labs API",
            "api.funnellabs.growth",
            "/var/www/api.funnellabs.growth/public",
            "node",
        ),
        // ── Gaming ───────────────────────────────────────────────────────────
        (
            "PixelVault Games",
            "pixelvaultgames.com",
            "/var/www/pixelvaultgames.com/public",
            "node",
        ),
        (
            "PixelVault Store",
            "store.pixelvaultgames.com",
            "/var/www/store.pixelvaultgames.com/public",
            "woo",
        ),
        (
            "GameCraft",
            "gamecraft.gg",
            "/var/www/gamecraft.gg/public",
            "node",
        ),
        (
            "GameCraft API",
            "api.gamecraft.gg",
            "/var/www/api.gamecraft.gg/public",
            "node",
        ),
        (
            "LevelUp Studios",
            "levelupstudios.games",
            "/var/www/levelupstudios.games/public",
            "node",
        ),
        (
            "LevelUp CDN",
            "cdn.levelupstudios.games",
            "/var/www/cdn.levelupstudios.games/public",
            "static",
        ),
        (
            "ArenaNet",
            "arenanet.online",
            "/var/www/arenanet.online/public",
            "node",
        ),
        (
            "ArenaNet Leagues",
            "leagues.arenanet.online",
            "/var/www/leagues.arenanet.online/public",
            "static",
        ),
        (
            "QuestBridge",
            "questbridge.co",
            "/var/www/questbridge.co/public",
            "node",
        ),
        (
            "QuestBridge API",
            "api.questbridge.co",
            "/var/www/api.questbridge.co/public",
            "node",
        ),
        // ── AI / ML ───────────────────────────────────────────────────────────
        (
            "NeuralBase",
            "neuralbase.ai",
            "/var/www/neuralbase.ai/public",
            "py",
        ),
        (
            "NeuralBase API",
            "api.neuralbase.ai",
            "/var/www/api.neuralbase.ai/public",
            "py",
        ),
        (
            "NeuralBase Docs",
            "docs.neuralbase.ai",
            "/var/www/docs.neuralbase.ai/public",
            "static",
        ),
        (
            "InferCore",
            "infercore.ml",
            "/var/www/infercore.ml/public",
            "py",
        ),
        (
            "InferCore Dashboard",
            "dashboard.infercore.ml",
            "/var/www/dashboard.infercore.ml/public",
            "static",
        ),
        (
            "DataMind",
            "datamind.io",
            "/var/www/datamind.io/public",
            "py",
        ),
        (
            "DataMind Studio",
            "studio.datamind.io",
            "/var/www/studio.datamind.io/public",
            "static",
        ),
        ("Cognify", "cognify.ai", "/var/www/cognify.ai/public", "py"),
        (
            "Cognify API",
            "api.cognify.ai",
            "/var/www/api.cognify.ai/public",
            "py",
        ),
        (
            "ModelHub",
            "modelhub.tech",
            "/var/www/modelhub.tech/public",
            "py",
        ),
    ];

    let n_servers = server_ids.len();
    for (i, (name, domain, document_root, app_type)) in sites.iter().enumerate() {
        let (server_id, server_hostname) = &server_ids[i % n_servers];
        let spec = app_spec(app_type);

        let source_config: serde_json::Value = match spec.template_id {
            Some(tid) => serde_json::json!({ "template_id": tid }),
            None => serde_json::json!({}),
        };

        // Insert site (idempotent), then fetch id regardless of insert/conflict
        sqlx::query(
            "INSERT INTO sites (name, primary_domain, server_id, document_root, status) \
             VALUES ($1, $2, $3, $4, 'active') \
             ON CONFLICT (primary_domain) DO NOTHING",
        )
        .bind(name)
        .bind(domain)
        .bind(server_id)
        .bind(document_root)
        .execute(pool)
        .await?;

        let site_id: (Uuid,) =
            sqlx::query_as("SELECT id FROM sites WHERE primary_domain = $1 LIMIT 1")
                .bind(domain)
                .fetch_one(pool)
                .await?;

        let site_id = site_id.0;

        // Insert application (idempotent via UNIQUE site_id constraint)
        let app_row: Option<(Uuid,)> = sqlx::query_as(
            "INSERT INTO applications \
               (site_id, kind, runtime_version, source_kind, source_config) \
             VALUES ($1, $2, $3, $4, $5) \
             ON CONFLICT (site_id) DO UPDATE \
               SET kind = EXCLUDED.kind, \
                   runtime_version = EXCLUDED.runtime_version, \
                   source_kind = EXCLUDED.source_kind, \
                   source_config = EXCLUDED.source_config \
             RETURNING id",
        )
        .bind(site_id)
        .bind(spec.kind)
        .bind(spec.runtime_version)
        .bind(spec.source_kind)
        .bind(&source_config)
        .fetch_optional(pool)
        .await?;

        if let Some((app_id,)) = app_row {
            // Link application_id back to site
            sqlx::query("UPDATE sites SET application_id = $1 WHERE id = $2")
                .bind(app_id)
                .bind(site_id)
                .execute(pool)
                .await?;
        }

        println!(
            "  site {domain} [{} / {}] → {}",
            spec.kind, app_type, server_hostname
        );
    }
    Ok(())
}
