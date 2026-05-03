//! Generates systemd unit files for Tundra applications per Appendix B
//! of the technical implementation plan.
//!
//! Security directives are applied verbatim from Appendix B; JIT runtimes
//! (Node, Python/Cython, Ruby) have MemoryDenyWriteExecute=false.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum AppKind {
    Static,
    Php,
    Laravel,
    Nodejs,
    Python,
    Go,
    Rust,
    Ruby,
    Dotnet,
    Docker,
}

impl AppKind {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "static" => Some(Self::Static),
            "php" => Some(Self::Php),
            "laravel" => Some(Self::Laravel),
            "nodejs" => Some(Self::Nodejs),
            "python" => Some(Self::Python),
            "go" => Some(Self::Go),
            "rust" => Some(Self::Rust),
            "ruby" => Some(Self::Ruby),
            "dotnet" => Some(Self::Dotnet),
            "docker" => Some(Self::Docker),
            _ => None,
        }
    }

    /// JIT runtimes must have MemoryDenyWriteExecute=false
    pub fn uses_jit(&self) -> bool {
        matches!(self, Self::Nodejs | Self::Ruby | Self::Dotnet)
    }
}

#[derive(Debug, Clone)]
pub struct AppUnitParams {
    pub public_id: String,
    pub domain: String,
    pub kind: AppKind,
    pub runtime_version: String,
    pub exec_start: String,
    pub memory_max: String,   // e.g. "512M"
    pub cpu_quota: String,    // e.g. "150%"
    pub install_base: String, // e.g. "/usr/local/tundra/runtimes"
    /// For blue/green: "blue" or "green" (empty string = single instance)
    pub slot: String,
}

#[derive(Debug, Clone)]
pub struct DaemonUnitParams {
    pub public_id: String,
    pub daemon_id: String,
    pub command: String,
    pub working_dir: String,
    pub user: String,
    pub memory_max: String,
    pub cpu_quota: String,
}

#[derive(Debug, Clone)]
pub struct CronUnitParams {
    pub public_id: String,
    pub task_id: String,
    pub command: String,
    pub working_dir: String,
    pub user: String,
    pub schedule: String, // systemd OnCalendar expression
}

/// Generate the application systemd service unit per Appendix B.
pub fn render_app_unit(p: &AppUnitParams) -> String {
    let instance_name = if p.slot.is_empty() {
        p.public_id.clone()
    } else {
        format!("{}-{}", p.public_id, p.slot)
    };
    let user = format!("tundra-{}", p.public_id);
    let site_path = format!("/srv/sites/{}", p.public_id);
    let memory_deny_wx = if p.kind.uses_jit() { "false" } else { "true" };

    format!(
        r#"# /etc/systemd/system/tundra-app@{instance_name}.service
[Unit]
Description=Tundra application {domain}
After=network.target

[Service]
Type=simple
User={user}
Group={user}
WorkingDirectory={site_path}/current
EnvironmentFile={site_path}/shared/.env
ExecStart={exec_start}
Restart=on-failure
RestartSec=2
TimeoutStopSec=15

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ReadWritePaths={site_path}/shared
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
RestrictNamespaces=true
LockPersonality=true
MemoryDenyWriteExecute={memory_deny_wx}
RestrictRealtime=true
SystemCallArchitectures=native
SystemCallFilter=@system-service

# Resources
MemoryMax={memory_max}
CPUQuota={cpu_quota}

[Install]
WantedBy=multi-user.target
"#,
        instance_name = instance_name,
        domain = p.domain,
        user = user,
        site_path = site_path,
        exec_start = p.exec_start,
        memory_deny_wx = memory_deny_wx,
        memory_max = p.memory_max,
        cpu_quota = p.cpu_quota,
    )
}

/// Generate the daemon systemd service unit.
pub fn render_daemon_unit(p: &DaemonUnitParams) -> String {
    format!(
        r#"[Unit]
Description=Tundra daemon {public_id}-{daemon_id}
After=network.target

[Service]
Type=simple
User={user}
Group={user}
WorkingDirectory={working_dir}
ExecStart={command}
Restart=on-failure
RestartSec=5
TimeoutStopSec=30

NoNewPrivileges=true
ProtectSystem=strict
PrivateTmp=true
MemoryMax={memory_max}
CPUQuota={cpu_quota}

[Install]
WantedBy=multi-user.target
"#,
        public_id = p.public_id,
        daemon_id = p.daemon_id,
        user = p.user,
        working_dir = p.working_dir,
        command = p.command,
        memory_max = p.memory_max,
        cpu_quota = p.cpu_quota,
    )
}

/// Generate the cron service unit.
pub fn render_cron_service(p: &CronUnitParams) -> String {
    format!(
        r#"[Unit]
Description=Tundra cron {public_id}-{task_id}

[Service]
Type=oneshot
User={user}
Group={user}
WorkingDirectory={working_dir}
ExecStart={command}
NoNewPrivileges=true
ProtectSystem=strict
PrivateTmp=true
"#,
        public_id = p.public_id,
        task_id = p.task_id,
        user = p.user,
        working_dir = p.working_dir,
        command = p.command,
    )
}

/// Generate the cron timer unit.
pub fn render_cron_timer(p: &CronUnitParams) -> String {
    format!(
        r#"[Unit]
Description=Tundra cron timer {public_id}-{task_id}

[Timer]
OnCalendar={schedule}
Persistent=true

[Install]
WantedBy=timers.target
"#,
        public_id = p.public_id,
        task_id = p.task_id,
        schedule = p.schedule,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node_params() -> AppUnitParams {
        AppUnitParams {
            public_id: "abc123".into(),
            domain: "example.com".into(),
            kind: AppKind::Nodejs,
            runtime_version: "22".into(),
            exec_start: "/usr/local/tundra/runtimes/node-22/bin/node server.js".into(),
            memory_max: "512M".into(),
            cpu_quota: "150%".into(),
            install_base: "/usr/local/tundra/runtimes".into(),
            slot: "".into(),
        }
    }

    #[test]
    fn node_unit_contains_hardening_directives() {
        let unit = render_app_unit(&node_params());
        assert!(unit.contains("NoNewPrivileges=true"));
        assert!(unit.contains("ProtectSystem=strict"));
        assert!(unit.contains("ProtectHome=true"));
        assert!(unit.contains("PrivateTmp=true"));
        assert!(unit.contains("PrivateDevices=true"));
        assert!(unit.contains("ProtectKernelTunables=true"));
        assert!(unit.contains("ProtectKernelModules=true"));
        assert!(unit.contains("ProtectControlGroups=true"));
        assert!(unit.contains("RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6"));
        assert!(unit.contains("RestrictNamespaces=true"));
        assert!(unit.contains("LockPersonality=true"));
        assert!(unit.contains("RestrictRealtime=true"));
        assert!(unit.contains("SystemCallArchitectures=native"));
        assert!(unit.contains("SystemCallFilter=@system-service"));
    }

    #[test]
    fn node_unit_jit_exempt_from_memory_deny_wx() {
        let unit = render_app_unit(&node_params());
        // Node.js uses V8 JIT — must NOT deny write+execute memory
        assert!(unit.contains("MemoryDenyWriteExecute=false"));
    }

    #[test]
    fn go_unit_enforces_memory_deny_wx() {
        let mut p = node_params();
        p.kind = AppKind::Go;
        p.exec_start = "/srv/sites/abc123/current/app".into();
        let unit = render_app_unit(&p);
        assert!(unit.contains("MemoryDenyWriteExecute=true"));
    }

    #[test]
    fn blue_green_slot_in_instance_name() {
        let mut p = node_params();
        p.slot = "blue".into();
        let unit = render_app_unit(&p);
        assert!(unit.contains("abc123-blue"));
    }

    #[test]
    fn resource_limits_present() {
        let unit = render_app_unit(&node_params());
        assert!(unit.contains("MemoryMax=512M"));
        assert!(unit.contains("CPUQuota=150%"));
    }

    #[test]
    fn cron_timer_on_calendar() {
        let p = CronUnitParams {
            public_id: "site1".into(),
            task_id: "task1".into(),
            command: "php artisan schedule:run".into(),
            working_dir: "/srv/sites/site1/current".into(),
            user: "tundra-site1".into(),
            schedule: "*-*-* *:*:00".into(),
        };
        let timer = render_cron_timer(&p);
        assert!(timer.contains("OnCalendar=*-*-* *:*:00"));
        assert!(timer.contains("Persistent=true"));
    }

    #[test]
    fn daemon_unit_restart_on_failure() {
        let p = DaemonUnitParams {
            public_id: "site1".into(),
            daemon_id: "worker1".into(),
            command: "php artisan queue:work".into(),
            working_dir: "/srv/sites/site1/current".into(),
            user: "tundra-site1".into(),
            memory_max: "256M".into(),
            cpu_quota: "50%".into(),
        };
        let unit = render_daemon_unit(&p);
        assert!(unit.contains("Restart=on-failure"));
        assert!(unit.contains("MemoryMax=256M"));
    }
}
