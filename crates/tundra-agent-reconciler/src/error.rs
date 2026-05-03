use thiserror::Error;

#[derive(Debug, Error)]
pub enum ReconcileError {
    #[error("observe failed: {0}")]
    ObserveFailed(String),

    #[error("reconcile failed: {0}")]
    ReconcileFailed(String),

    #[error("destroy failed: {0}")]
    DestroyFailed(String),

    #[error(transparent)]
    Other(#[from] anyhow::Error),
}
