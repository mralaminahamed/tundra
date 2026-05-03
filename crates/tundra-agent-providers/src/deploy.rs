use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Instant;

use tokio::sync::mpsc::Sender;
use tracing::{info, warn};

/// Blue or green deployment slot.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Slot {
    Blue,
    Green,
}

impl Slot {
    pub fn as_str(self) -> &'static str {
        match self {
            Slot::Blue => "blue",
            Slot::Green => "green",
        }
    }

    /// Return the inactive (target) slot given the currently-active slot.
    pub fn opposite(self) -> Self {
        match self {
            Slot::Blue => Slot::Green,
            Slot::Green => Slot::Blue,
        }
    }
}

/// Specification for a site deployment.
#[derive(Debug, Clone)]
pub struct DeploySpec {
    pub deployment_id: String,
    pub site_id: String,
    /// Unique public id used for systemd unit naming, e.g. `"abc123"`.
    pub public_id: String,
    pub document_root: String,
    /// e.g. `"laravel"`, `"static"`, `"blank"`
    pub kind: String,
    /// If `Some`, a build command to run after fetching sources.
    pub build_command: Option<String>,
    /// HTTP path to probe during health-check (e.g. `"/"`).
    pub health_check_path: String,
    /// Git SHA or `"blank"` for an empty initial release.
    pub source_ref: String,
    /// Environment variables to inject at deploy time.
    pub env_vars: HashMap<String, String>,
    /// Currently-active slot (`None` for first deploy — will pick Blue).
    pub active_slot: Option<Slot>,
    /// Port that the active slot's process is listening on (for health probe).
    pub listen_port: Option<u16>,
}

/// Progress events emitted by [`DeployPipeline::run`].
#[derive(Debug, Clone)]
pub enum DeployProgress {
    /// Pipeline accepted and started.
    Started { deployment_id: String },
    /// Entering a named pipeline stage.
    Stage { name: String },
    /// A log line from within a stage.
    Log { line: String, level: String },
    /// Deployment completed successfully.
    Finished {
        deployment_id: String,
        duration_ms: u64,
        /// The slot that is now active after this deployment.
        new_active_slot: Slot,
    },
    /// Deployment failed at `stage` with the given error message.
    Failed {
        deployment_id: String,
        error: String,
        stage: String,
    },
}

/// Executes the deploy pipeline for a single deployment.
///
/// The pipeline operates on disk under `releases_base/<deployment_id>/` and
/// atomically promotes via the `current_link` symlink.
pub struct DeployPipeline {
    /// e.g. `/srv/sites/<site_id>/releases/`
    releases_base: PathBuf,
    /// e.g. `/srv/sites/<site_id>/current`  (managed as a symlink)
    current_link: PathBuf,
}

impl DeployPipeline {
    pub fn new(releases_base: impl Into<PathBuf>, current_link: impl Into<PathBuf>) -> Self {
        Self {
            releases_base: releases_base.into(),
            current_link: current_link.into(),
        }
    }

    /// Run the full deploy pipeline, emitting [`DeployProgress`] events on `tx`.
    ///
    /// Returns the newly-active [`Slot`] on success, or an `Err(String)` containing
    /// the error message (a corresponding [`DeployProgress::Failed`] is also sent).
    pub async fn run(&self, spec: DeploySpec, tx: Sender<DeployProgress>) -> Result<Slot, String> {
        let started_at = Instant::now();

        // Determine target slot: always deploy to the *inactive* slot.
        let target_slot = spec.active_slot.map(|s| s.opposite()).unwrap_or(Slot::Blue);

        // -- started -------------------------------------------------------
        send(
            &tx,
            DeployProgress::Started {
                deployment_id: spec.deployment_id.clone(),
            },
        )
        .await;

        info!(
            deployment_id = %spec.deployment_id,
            site_id = %spec.site_id,
            source_ref = %spec.source_ref,
            "deploy pipeline started",
        );

        // -- stage: fetching -----------------------------------------------
        let current_stage = "fetching";
        send(
            &tx,
            DeployProgress::Stage {
                name: current_stage.into(),
            },
        )
        .await;

        if spec.source_ref == "blank" {
            log_line(
                &tx,
                "source_ref=blank: skipping git fetch, using empty release",
                "info",
            )
            .await;
        } else {
            log_line(
                &tx,
                &format!(
                    "Stub: would clone git ref '{}' for site '{}'",
                    spec.source_ref, spec.site_id
                ),
                "info",
            )
            .await;
            log_line(&tx, "Stub: git clone wired in P3", "info").await;
        }

        // -- stage: building -----------------------------------------------
        let current_stage = "building";
        if let Some(ref cmd) = spec.build_command {
            send(
                &tx,
                DeployProgress::Stage {
                    name: current_stage.into(),
                },
            )
            .await;
            log_line(
                &tx,
                &format!("Stub: would run build command: {cmd}"),
                "info",
            )
            .await;
            log_line(&tx, "Stub: subprocess execution wired in P3", "info").await;
        }
        // On blank or no build_command, skip silently.

        // -- stage: assembling ---------------------------------------------
        let current_stage = "assembling";
        send(
            &tx,
            DeployProgress::Stage {
                name: current_stage.into(),
            },
        )
        .await;

        let release_dir = self.releases_base.join(&spec.deployment_id);
        log_line(
            &tx,
            &format!("Creating release directory: {}", release_dir.display()),
            "info",
        )
        .await;

        tokio::fs::create_dir_all(&release_dir)
            .await
            .map_err(|e| {
                let msg = format!(
                    "failed to create release dir {}: {e}",
                    release_dir.display()
                );
                msg
            })
            .map_err(|err| {
                let tx2 = tx.clone();
                let dep_id = spec.deployment_id.clone();
                let stage = current_stage.to_owned();
                // We cannot use async inside map_err directly; signal via a blocking send.
                let _ = tx2.try_send(DeployProgress::Failed {
                    deployment_id: dep_id,
                    error: err.clone(),
                    stage,
                });
                err
            })?;

        log_line(&tx, "Release directory created", "info").await;

        // -- stage: slot_start ---------------------------------------------
        // Start the target-slot systemd unit (stub: log only).
        let current_stage = "slot_start";
        send(
            &tx,
            DeployProgress::Stage {
                name: current_stage.into(),
            },
        )
        .await;
        log_line(
            &tx,
            &format!(
                "Stub: would start tundra-app@{}-{}.service",
                spec.public_id,
                target_slot.as_str()
            ),
            "info",
        )
        .await;

        // -- stage: health_checking ----------------------------------------
        let current_stage = "health_checking";
        send(
            &tx,
            DeployProgress::Stage {
                name: current_stage.into(),
            },
        )
        .await;
        log_line(
            &tx,
            &format!(
                "Stub: would probe health_check_path '{}' on slot {}",
                spec.health_check_path,
                target_slot.as_str()
            ),
            "info",
        )
        .await;
        log_line(&tx, "Health check passed (stub)", "info").await;

        // -- stage: promoting ----------------------------------------------
        // Atomically promote: update proxy upstream to target slot, then stop old slot.
        let current_stage = "promoting";
        send(
            &tx,
            DeployProgress::Stage {
                name: current_stage.into(),
            },
        )
        .await;

        if let Err(e) = self.promote(&release_dir).await {
            send(
                &tx,
                DeployProgress::Failed {
                    deployment_id: spec.deployment_id.clone(),
                    error: e.clone(),
                    stage: current_stage.to_owned(),
                },
            )
            .await;
            return Err(e);
        }

        log_line(
            &tx,
            &format!(
                "Promoted release {} → {} (slot: {})",
                release_dir.display(),
                self.current_link.display(),
                target_slot.as_str()
            ),
            "info",
        )
        .await;

        // Stop the old (previously-active) slot — stub.
        if let Some(old_slot) = spec.active_slot {
            log_line(
                &tx,
                &format!(
                    "Stub: would stop tundra-app@{}-{}.service",
                    spec.public_id,
                    old_slot.as_str()
                ),
                "info",
            )
            .await;
        }

        // -- cleanup (prune old releases) ----------------------------------
        if let Err(e) = self.prune_old_releases().await {
            warn!(error = %e, "failed to prune old releases (non-fatal)");
            log_line(
                &tx,
                &format!("Warning: could not prune old releases: {e}"),
                "warn",
            )
            .await;
        }

        // -- finished -------------------------------------------------------
        let duration_ms = started_at.elapsed().as_millis() as u64;
        send(
            &tx,
            DeployProgress::Finished {
                deployment_id: spec.deployment_id.clone(),
                duration_ms,
                new_active_slot: target_slot,
            },
        )
        .await;

        info!(
            deployment_id = %spec.deployment_id,
            duration_ms,
            slot = %target_slot.as_str(),
            "deploy pipeline finished",
        );

        Ok(target_slot)
    }

    /// Atomically swap `current_link` to point at `release_dir`.
    ///
    /// Strategy: create `current.tmp` symlink, then `rename` it over `current`.
    /// `rename(2)` is atomic on Linux (POSIX guarantee).
    async fn promote(&self, release_dir: &std::path::Path) -> Result<(), String> {
        // Build the `.tmp` sibling path.
        let tmp_link = {
            let mut p = self.current_link.clone();
            let mut name = p
                .file_name()
                .unwrap_or_else(|| std::ffi::OsStr::new("current"))
                .to_os_string();
            name.push(".tmp");
            p.set_file_name(name);
            p
        };

        // Remove stale `.tmp` if present (best-effort).
        let _ = tokio::fs::remove_file(&tmp_link).await;

        // Create the temporary symlink.
        tokio::task::spawn_blocking({
            let release_dir = release_dir.to_path_buf();
            let tmp_link = tmp_link.clone();
            move || {
                std::os::unix::fs::symlink(&release_dir, &tmp_link).map_err(|e| {
                    format!(
                        "symlink {} → {} failed: {e}",
                        tmp_link.display(),
                        release_dir.display()
                    )
                })
            }
        })
        .await
        .map_err(|e| format!("spawn_blocking join error: {e}"))??;

        // Atomically rename `.tmp` → `current`.
        tokio::task::spawn_blocking({
            let tmp_link = tmp_link.clone();
            let current_link = self.current_link.clone();
            move || {
                std::fs::rename(&tmp_link, &current_link).map_err(|e| {
                    format!(
                        "rename {} → {} failed: {e}",
                        tmp_link.display(),
                        current_link.display()
                    )
                })
            }
        })
        .await
        .map_err(|e| format!("spawn_blocking join error: {e}"))??;

        Ok(())
    }

    /// Keep only the 5 most-recent release directories; remove the rest.
    async fn prune_old_releases(&self) -> Result<(), String> {
        let mut entries = tokio::fs::read_dir(&self.releases_base)
            .await
            .map_err(|e| format!("read_dir {}: {e}", self.releases_base.display()))?;

        let mut dirs: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();

        while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
            let meta = entry.metadata().await.map_err(|e| e.to_string())?;
            if meta.is_dir() {
                let mtime = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                dirs.push((mtime, entry.path()));
            }
        }

        // Sort descending by mtime (newest first).
        dirs.sort_by(|a, b| b.0.cmp(&a.0));

        // Remove everything past the 5 newest.
        for (_, path) in dirs.into_iter().skip(5) {
            info!(path = %path.display(), "pruning old release");
            if let Err(e) = tokio::fs::remove_dir_all(&path).await {
                warn!(path = %path.display(), error = %e, "failed to remove old release");
            }
        }

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async fn send(tx: &Sender<DeployProgress>, event: DeployProgress) {
    // Receiver closed → deployment was cancelled; best-effort only.
    let _ = tx.send(event).await;
}

async fn log_line(tx: &Sender<DeployProgress>, line: &str, level: &str) {
    send(
        tx,
        DeployProgress::Log {
            line: line.to_owned(),
            level: level.to_owned(),
        },
    )
    .await;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::mpsc;

    fn blank_spec(deployment_id: &str, site_id: &str) -> DeploySpec {
        DeploySpec {
            deployment_id: deployment_id.to_owned(),
            site_id: site_id.to_owned(),
            public_id: "testpub".into(),
            document_root: "/srv/sites/test/current".into(),
            kind: "static".into(),
            build_command: None,
            health_check_path: "/".into(),
            source_ref: "blank".into(),
            env_vars: HashMap::new(),
            active_slot: None,
            listen_port: None,
        }
    }

    #[tokio::test]
    async fn blank_deploy_emits_started_stages_finished() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let releases = tmp.path().join("releases");
        let current = tmp.path().join("current");

        tokio::fs::create_dir_all(&releases).await.unwrap();

        let pipeline = DeployPipeline::new(&releases, &current);
        let (tx, mut rx) = mpsc::channel(64);
        let spec = blank_spec("dep-0001", "site-abc");

        pipeline
            .run(spec, tx)
            .await
            .expect("pipeline should succeed");

        let mut events = Vec::new();
        while let Ok(ev) = rx.try_recv() {
            events.push(ev);
        }

        // Must have at least one event.
        assert!(!events.is_empty(), "no events received");

        // First event must be Started.
        assert!(
            matches!(&events[0], DeployProgress::Started { deployment_id } if deployment_id == "dep-0001"),
            "first event was not Started: {:?}",
            events[0],
        );

        // Last event must be Finished.
        let last = events.last().unwrap();
        assert!(
            matches!(last, DeployProgress::Finished { deployment_id, .. } if deployment_id == "dep-0001"),
            "last event was not Finished: {:?}",
            last,
        );

        // At least one Stage event must be present.
        let has_stage = events
            .iter()
            .any(|e| matches!(e, DeployProgress::Stage { .. }));
        assert!(has_stage, "no Stage event emitted");

        // Release directory must exist on disk.
        let release_dir = releases.join("dep-0001");
        assert!(
            release_dir.exists(),
            "release directory was not created: {}",
            release_dir.display()
        );

        // `current` symlink must point at the release directory.
        let link_target = std::fs::read_link(&current).expect("current should be a symlink");
        assert_eq!(
            link_target.canonicalize().unwrap(),
            release_dir.canonicalize().unwrap(),
        );
    }

    #[tokio::test]
    async fn deploy_with_source_ref_and_build_command_emits_stages() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let releases = tmp.path().join("releases");
        let current = tmp.path().join("current");

        tokio::fs::create_dir_all(&releases).await.unwrap();

        let pipeline = DeployPipeline::new(&releases, &current);
        let (tx, mut rx) = mpsc::channel(64);
        let spec = DeploySpec {
            deployment_id: "dep-0002".into(),
            site_id: "site-abc".into(),
            public_id: "siteabc".into(),
            document_root: "/srv/sites/site-abc/current".into(),
            kind: "laravel".into(),
            build_command: Some("composer install --no-dev".into()),
            health_check_path: "/health".into(),
            source_ref: "abc123def456".into(),
            env_vars: HashMap::new(),
            active_slot: Some(Slot::Blue),
            listen_port: Some(3000),
        };

        pipeline
            .run(spec, tx)
            .await
            .expect("pipeline should succeed");

        let mut events = Vec::new();
        while let Ok(ev) = rx.try_recv() {
            events.push(ev);
        }

        let stage_names: Vec<&str> = events
            .iter()
            .filter_map(|e| {
                if let DeployProgress::Stage { name } = e {
                    Some(name.as_str())
                } else {
                    None
                }
            })
            .collect();

        // Fetching and building stages must both appear.
        assert!(
            stage_names.contains(&"fetching"),
            "missing 'fetching' stage"
        );
        assert!(
            stage_names.contains(&"building"),
            "missing 'building' stage"
        );
        assert!(
            stage_names.contains(&"promoting"),
            "missing 'promoting' stage"
        );

        // Last event is Finished.
        assert!(matches!(
            events.last().unwrap(),
            DeployProgress::Finished { .. }
        ));
    }

    #[tokio::test]
    async fn prune_keeps_at_most_five_releases() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let releases = tmp.path().join("releases");
        tokio::fs::create_dir_all(&releases).await.unwrap();

        // Pre-create 7 release directories.
        for i in 0u32..7 {
            let dir = releases.join(format!("dep-old-{i:04}"));
            tokio::fs::create_dir_all(&dir).await.unwrap();
            // Sleep a tiny bit so mtimes differ.
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        }

        // Run one more deploy (dep-new); after pruning we should keep 5 total.
        let current = tmp.path().join("current");
        let pipeline = DeployPipeline::new(&releases, &current);
        let (tx, _rx) = mpsc::channel(128);
        let spec = blank_spec("dep-new-0001", "site-prune");

        pipeline
            .run(spec, tx)
            .await
            .expect("pipeline should succeed");

        // Count remaining entries under releases/.
        let mut count = 0usize;
        let mut rd = tokio::fs::read_dir(&releases).await.unwrap();
        while rd.next_entry().await.unwrap().is_some() {
            count += 1;
        }

        assert_eq!(count, 5, "expected 5 releases after pruning, got {count}");
    }

    #[tokio::test]
    async fn blue_green_first_deploy_lands_on_blue() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let releases = tmp.path().join("releases");
        let current = tmp.path().join("current");
        tokio::fs::create_dir_all(&releases).await.unwrap();

        let pipeline = DeployPipeline::new(&releases, &current);
        let (tx, mut rx) = mpsc::channel(64);
        let spec = blank_spec("dep-bg-001", "site-bg");

        let new_slot = pipeline
            .run(spec, tx)
            .await
            .expect("pipeline should succeed");
        assert_eq!(new_slot, Slot::Blue, "first deploy should target Blue slot");

        // Finished event must carry Blue slot.
        let mut events = Vec::new();
        while let Ok(ev) = rx.try_recv() {
            events.push(ev);
        }
        assert!(matches!(
            events.last().unwrap(),
            DeployProgress::Finished {
                new_active_slot: Slot::Blue,
                ..
            }
        ));
    }

    #[tokio::test]
    async fn blue_green_second_deploy_flips_to_green() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let releases = tmp.path().join("releases");
        let current = tmp.path().join("current");
        tokio::fs::create_dir_all(&releases).await.unwrap();

        let pipeline = DeployPipeline::new(&releases, &current);
        let (tx, _rx) = mpsc::channel(64);
        let mut spec = blank_spec("dep-bg-002", "site-bg");
        spec.active_slot = Some(Slot::Blue);

        let new_slot = pipeline
            .run(spec, tx)
            .await
            .expect("pipeline should succeed");
        assert_eq!(
            new_slot,
            Slot::Green,
            "second deploy should flip to Green slot"
        );
    }
}
