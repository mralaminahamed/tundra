use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BackupTargetKind {
    S3,
    Local,
    Sftp,
    B2,
    Wasabi,
    R2,
}

impl BackupTargetKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::S3 => "s3",
            Self::Local => "local",
            Self::Sftp => "sftp",
            Self::B2 => "b2",
            Self::Wasabi => "wasabi",
            Self::R2 => "r2",
        }
    }
}

impl std::str::FromStr for BackupTargetKind {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "s3" => Ok(Self::S3),
            "local" => Ok(Self::Local),
            "sftp" => Ok(Self::Sftp),
            "b2" => Ok(Self::B2),
            "wasabi" => Ok(Self::Wasabi),
            "r2" => Ok(Self::R2),
            other => Err(format!("unknown backup target kind: {other}")),
        }
    }
}

#[derive(Debug, Clone)]
pub struct BackupTarget {
    pub id: uuid::Uuid,
    pub name: String,
    pub kind: BackupTargetKind,
    pub config: serde_json::Value,
    pub repo_password: String, // Decrypted at use-time
    pub is_default: bool,
}

impl BackupTarget {
    /// Returns the restic repository URL for this target.
    pub fn restic_repo_url(&self) -> anyhow::Result<String> {
        match self.kind {
            BackupTargetKind::Local => {
                let path = self.config["path"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("local target missing 'path'"))?;
                Ok(path.to_string())
            }
            BackupTargetKind::S3 | BackupTargetKind::Wasabi | BackupTargetKind::R2 => {
                let bucket = self.config["bucket"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("s3 target missing 'bucket'"))?;
                let prefix = self.config["prefix"].as_str().unwrap_or("tundra");
                Ok(format!("s3:{bucket}/{prefix}"))
            }
            BackupTargetKind::B2 => {
                let bucket = self.config["bucket"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("b2 target missing 'bucket'"))?;
                Ok(format!("b2:{bucket}/tundra"))
            }
            BackupTargetKind::Sftp => {
                let host = self.config["host"]
                    .as_str()
                    .ok_or_else(|| anyhow::anyhow!("sftp target missing 'host'"))?;
                let path = self.config["path"].as_str().unwrap_or("/backups/tundra");
                Ok(format!("sftp:{host}:{path}"))
            }
        }
    }
}
