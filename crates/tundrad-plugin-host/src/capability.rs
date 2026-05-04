use std::collections::HashSet;
use tundra_plugin_sdk::PluginCapability;

#[derive(Debug, Default)]
pub struct GrantedCapabilities {
    granted: HashSet<String>,
}

impl GrantedCapabilities {
    pub fn grant(&mut self, cap: &PluginCapability) {
        for key in capability_keys(cap) {
            self.granted.insert(key);
        }
    }

    pub fn has_net(&self, host: &str) -> bool {
        self.granted.contains(&format!("net:{host}")) || self.granted.contains("net:*")
    }

    pub fn has_secret(&self, name: &str) -> bool {
        self.granted.contains(&format!("secret:{name}"))
    }

    pub fn has_db_read(&self, table: &str) -> bool {
        self.granted.contains(&format!("db.read:{table}"))
    }

    pub fn has_db_write(&self, table: &str) -> bool {
        self.granted.contains(&format!("db.write:{table}"))
    }

    pub fn check_secret(&self, name: &str) -> Result<(), tundra_plugin_sdk::HostError> {
        if self.has_secret(name) {
            Ok(())
        } else {
            Err(tundra_plugin_sdk::HostError::CapabilityNotGranted(format!(
                "secret:{name}"
            )))
        }
    }
}

fn capability_keys(cap: &PluginCapability) -> Vec<String> {
    match cap {
        PluginCapability::Net { hosts, .. } => hosts.iter().map(|h| format!("net:{h}")).collect(),
        PluginCapability::Secret { names } => names.iter().map(|n| format!("secret:{n}")).collect(),
        PluginCapability::DbRead { tables } => {
            tables.iter().map(|t| format!("db.read:{t}")).collect()
        }
        PluginCapability::DbWrite { tables } => {
            tables.iter().map(|t| format!("db.write:{t}")).collect()
        }
        PluginCapability::EventsSubscribe { events } => events
            .iter()
            .map(|e| format!("events.subscribe:{e}"))
            .collect(),
        PluginCapability::EventsPublish { events } => events
            .iter()
            .map(|e| format!("events.publish:{e}"))
            .collect(),
        PluginCapability::BackgroundJobs { .. } => vec!["background_jobs".into()],
        PluginCapability::HttpPublicRoute { paths } => {
            paths.iter().map(|p| format!("http.public:{p}")).collect()
        }
    }
}
