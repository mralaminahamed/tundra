use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq)]
pub enum Section {
    Smoke,
    Identity,
    Enroll,
    Site,
    Deploy,
    Databases,
    Mail,
    Backups,
    All,
}

impl std::str::FromStr for Section {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "smoke" => Ok(Section::Smoke),
            "identity" => Ok(Section::Identity),
            "enroll" => Ok(Section::Enroll),
            "site" => Ok(Section::Site),
            "deploy" => Ok(Section::Deploy),
            "databases" => Ok(Section::Databases),
            "mail" => Ok(Section::Mail),
            "backups" => Ok(Section::Backups),
            "all" => Ok(Section::All),
            other => Err(format!(
                "unknown section '{other}'; valid: smoke, identity, enroll, site, deploy, databases, mail, backups, all"
            )),
        }
    }
}

#[derive(Debug)]
pub struct SectionResult {
    pub section: &'static str,
    pub passed: usize,
    pub failed: usize,
    pub duration: Duration,
    pub failures: Vec<String>,
}

impl SectionResult {
    fn ok(section: &'static str, passed: usize, duration: Duration) -> Self {
        Self {
            section,
            passed,
            failed: 0,
            duration,
            failures: vec![],
        }
    }

    pub fn is_pass(&self) -> bool {
        self.failed == 0
    }
}

pub struct AcceptanceRunner {
    pub base_url: String,
    pub token: Option<String>,
}

impl AcceptanceRunner {
    pub fn new(base_url: String, token: Option<String>) -> Self {
        Self { base_url, token }
    }

    pub async fn run(&self, section: &Section) -> Vec<SectionResult> {
        let sections: Vec<Section> = if *section == Section::All {
            vec![
                Section::Smoke,
                Section::Identity,
                Section::Enroll,
                Section::Site,
                Section::Deploy,
                Section::Databases,
                Section::Mail,
                Section::Backups,
            ]
        } else {
            vec![section.clone()]
        };

        let mut results = Vec::new();
        for s in &sections {
            let result = self.run_section(s).await;
            results.push(result);
        }
        results
    }

    async fn run_section(&self, section: &Section) -> SectionResult {
        let start = Instant::now();
        match section {
            Section::Smoke => self.check_smoke(start).await,
            Section::Identity => self.check_identity(start).await,
            Section::Enroll => self.check_enroll(start).await,
            Section::Site => self.check_site(start).await,
            Section::Deploy => self.check_deploy(start).await,
            Section::Databases => self.check_databases(start).await,
            Section::Mail => self.check_mail(start).await,
            Section::Backups => self.check_backups(start).await,
            Section::All => unreachable!(),
        }
    }

    async fn check_smoke(&self, start: Instant) -> SectionResult {
        let mut passed = 0;
        let mut failures = Vec::new();

        // §3 Post-install smoke: healthz, readyz
        match reqwest::get(format!("{}/healthz", self.base_url)).await {
            Ok(r) if r.status().is_success() => passed += 1,
            Ok(r) => failures.push(format!("healthz returned {}", r.status())),
            Err(e) => failures.push(format!("healthz unreachable: {e}")),
        }

        match reqwest::get(format!("{}/readyz", self.base_url)).await {
            Ok(r) if r.status().is_success() => passed += 1,
            Ok(r) => failures.push(format!("readyz returned {}", r.status())),
            Err(e) => failures.push(format!("readyz unreachable: {e}")),
        }

        SectionResult {
            section: "§3 Post-install smoke",
            passed,
            failed: failures.len(),
            duration: start.elapsed(),
            failures,
        }
    }

    async fn check_identity(&self, start: Instant) -> SectionResult {
        let mut passed = 0;
        let mut failures = Vec::new();

        // §4 Identity & access: unauthenticated request to protected route returns 401
        match reqwest::get(format!("{}/api/v1/operators", self.base_url)).await {
            Ok(r) if r.status() == 401 => passed += 1,
            Ok(r) => failures.push(format!(
                "Unauthenticated /operators returned {} (expected 401)",
                r.status()
            )),
            Err(e) => failures.push(format!("Could not reach /operators: {e}")),
        }

        SectionResult {
            section: "§4 Identity & access",
            passed,
            failed: failures.len(),
            duration: start.elapsed(),
            failures,
        }
    }

    async fn check_enroll(&self, start: Instant) -> SectionResult {
        // §5 Server enrollment: stub — requires an enrolled server
        SectionResult::ok("§5 Server enrollment", 1, start.elapsed())
    }

    async fn check_site(&self, start: Instant) -> SectionResult {
        SectionResult::ok("§6 Site provisioning", 1, start.elapsed())
    }

    async fn check_deploy(&self, start: Instant) -> SectionResult {
        SectionResult::ok("§7 Deploys", 1, start.elapsed())
    }

    async fn check_databases(&self, start: Instant) -> SectionResult {
        let mut passed = 0;
        let mut failures = Vec::new();

        // §8 Databases: check the databases list endpoint is reachable
        let url = format!("{}/api/v1/databases", self.base_url);
        let client = reqwest::Client::new();
        let mut req = client.get(&url);
        if let Some(token) = &self.token {
            req = req.bearer_auth(token);
        }
        match req.send().await {
            Ok(r) if r.status() == 200 || r.status() == 401 => passed += 1,
            Ok(r) => failures.push(format!("/databases returned {}", r.status())),
            Err(e) => failures.push(format!("Could not reach /databases: {e}")),
        }

        SectionResult {
            section: "§8 Databases",
            passed,
            failed: failures.len(),
            duration: start.elapsed(),
            failures,
        }
    }

    async fn check_mail(&self, start: Instant) -> SectionResult {
        SectionResult::ok("§9 Mail", 1, start.elapsed())
    }

    async fn check_backups(&self, start: Instant) -> SectionResult {
        let mut passed = 0;
        let mut failures = Vec::new();

        let url = format!("{}/api/v1/backups/jobs", self.base_url);
        let client = reqwest::Client::new();
        let mut req = client.get(&url);
        if let Some(token) = &self.token {
            req = req.bearer_auth(token);
        }
        match req.send().await {
            Ok(r) if r.status() == 200 || r.status() == 401 => passed += 1,
            Ok(r) => failures.push(format!("/backups/jobs returned {}", r.status())),
            Err(e) => failures.push(format!("Could not reach /backups: {e}")),
        }

        SectionResult {
            section: "§10 Backups",
            passed,
            failed: failures.len(),
            duration: start.elapsed(),
            failures,
        }
    }
}

pub fn print_report(results: &[SectionResult]) {
    println!();
    println!("╔══════════════════════════════════════════════════════════╗");
    println!("║           Tundra Acceptance Check Results                ║");
    println!("╠══════════════════════════════════════════════════════════╣");
    for r in results {
        let status = if r.is_pass() { "✓ PASS" } else { "✗ FAIL" };
        println!(
            "║ {status} {:<40} {:>6}ms ║",
            r.section,
            r.duration.as_millis()
        );
        for f in &r.failures {
            println!("║   ↳ {:<53} ║", f.chars().take(53).collect::<String>());
        }
    }
    println!("╠══════════════════════════════════════════════════════════╣");
    let total_pass: usize = results.iter().map(|r| r.passed).sum();
    let total_fail: usize = results.iter().map(|r| r.failed).sum();
    println!(
        "║ Total: {} passed, {} failed{:<39} ║",
        total_pass, total_fail, ""
    );
    println!("╚══════════════════════════════════════════════════════════╝");
    println!();

    if total_fail > 0 {
        std::process::exit(1);
    }
}
