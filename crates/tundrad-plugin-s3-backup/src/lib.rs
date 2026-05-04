use async_trait::async_trait;
use tundra_plugin_sdk::{HostServices, Plugin, PluginCapability, PluginError, PluginManifest};

pub struct S3BackupPlugin;

#[async_trait]
impl Plugin for S3BackupPlugin {
    fn manifest(&self) -> PluginManifest {
        PluginManifest {
            id: "com.tundra.s3-backup".into(),
            name: "S3-Compatible Backup".into(),
            version: env!("CARGO_PKG_VERSION").into(),
            description: "Store backups in any S3-compatible bucket (AWS S3, Wasabi, Backblaze B2, Cloudflare R2). Supports lifecycle rules and encryption.".into(),
            author: "Al Amin Ahamed".into(),
            license: "Apache-2.0".into(),
            tundra_min_version: "1.0.0".into(),
            capabilities: vec![
                PluginCapability::Net {
                    hosts: vec![
                        "s3.amazonaws.com".into(),
                        "*.s3.amazonaws.com".into(),
                        "*.r2.cloudflarestorage.com".into(),
                        "s3.wasabisys.com".into(),
                    ],
                    max_rpm: 600,
                    max_bytes_per_request: 104_857_600,
                },
                PluginCapability::Secret {
                    names: vec![
                        "s3.access-key-id".into(),
                        "s3.secret-access-key".into(),
                        "s3.bucket".into(),
                        "s3.endpoint".into(),
                        "s3.region".into(),
                    ],
                },
                PluginCapability::DbRead {
                    tables: vec![
                        "backups".into(),
                        "backup_jobs".into(),
                        "backup_snapshots".into(),
                        "servers".into(),
                        "sites".into(),
                    ],
                },
                PluginCapability::DbWrite {
                    tables: vec![
                        "backup_snapshots".into(),
                        "backup_jobs".into(),
                        "plugin_s3_backup_state".into(),
                    ],
                },
                PluginCapability::EventsSubscribe {
                    events: vec![
                        "backup.job.triggered".into(),
                        "backup.snapshot.created".into(),
                    ],
                },
                PluginCapability::EventsPublish {
                    events: vec![
                        "s3backup.upload.completed".into(),
                        "s3backup.upload.failed".into(),
                    ],
                },
                PluginCapability::BackgroundJobs { max_concurrent: 3 },
            ],
        }
    }

    async fn enable(&self, host: &dyn HostServices) -> Result<(), PluginError> {
        let bucket = host.get_secret("s3.bucket").await?;
        host.log(
            tracing::Level::INFO,
            &format!(
                "S3 backup plugin enabled for bucket {}",
                bucket.as_str().unwrap_or("unknown")
            ),
            &[],
        );
        drop(bucket);
        Ok(())
    }

    async fn disable(&self, _host: &dyn HostServices) -> Result<(), PluginError> {
        Ok(())
    }

    async fn shutdown(&self) {}
}
