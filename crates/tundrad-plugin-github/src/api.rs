use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubRepo {
    pub id: i64,
    pub full_name: String,
    pub name: String,
    pub description: Option<String>,
    pub private: bool,
    pub default_branch: String,
    pub language: Option<String>,
}

/// GitHub App client stub.
#[derive(Debug, Clone)]
pub struct GitHubAppClient {
    app_id: String,
    // In production: private key used to sign JWTs
}

impl GitHubAppClient {
    pub fn new(app_id: String) -> Self {
        Self { app_id }
    }

    /// Stub: list repositories accessible to an installation.
    pub async fn list_repositories(
        &self,
        installation_id: i64,
    ) -> Result<Vec<GitHubRepo>, GitHubError> {
        tracing::info!(
            installation_id,
            app_id = %self.app_id,
            "GitHub list repos (stub)"
        );
        Ok(vec![])
    }
}

#[derive(Debug, thiserror::Error)]
pub enum GitHubError {
    #[error("API error: {code} — {message}")]
    Api { code: u16, message: String },
    #[error("Auth error: {0}")]
    Auth(String),
}
