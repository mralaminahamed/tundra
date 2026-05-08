use reqwest::Client;
use serde::{Deserialize, Serialize};

/// A queued deployment returned by the control plane polling endpoint.
#[derive(Debug, Clone, Deserialize)]
pub struct QueuedDeployment {
    pub deployment_id: String,
    pub site_id: String,
    pub application_id: String,
    pub kind: String,
    pub runtime_version: Option<String>,
    pub build_command: Option<String>,
    pub start_command: Option<String>,
    pub health_check_path: String,
    pub source_kind: String,
    pub source_config: serde_json::Value,
    pub source_ref: Option<String>,
    pub document_root: String,
    pub primary_domain: String,
}

/// Status update sent from agent → tundrad.
#[derive(Debug, Serialize)]
pub struct DeploymentStatusUpdate {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// HTTP client for the tundrad agent API.
#[derive(Clone)]
pub struct TundraClient {
    client: Client,
    base_url: String,
    server_id: String,
}

impl TundraClient {
    pub fn new(base_url: String, server_id: String) -> Self {
        Self {
            client: Client::builder()
                // Accept self-signed certificates in dev/single-host mode.
                .danger_accept_invalid_certs(true)
                .build()
                .expect("failed to build HTTP client"),
            base_url,
            server_id,
        }
    }

    /// Poll the control plane for queued deployments assigned to this server.
    pub async fn poll_queued_deployments(&self) -> anyhow::Result<Vec<QueuedDeployment>> {
        let resp = self
            .client
            .get(format!("{}/api/v1/agent/deployments", self.base_url))
            .header("X-Tundra-Server-Id", &self.server_id)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!("poll failed: {} — {}", status, body));
        }

        #[derive(Deserialize)]
        struct Response {
            data: Vec<QueuedDeployment>,
        }
        let r: Response = resp.json().await?;
        Ok(r.data)
    }

    /// Report a status transition for a deployment back to the control plane.
    pub async fn update_deployment_status(
        &self,
        deployment_id: &str,
        update: DeploymentStatusUpdate,
    ) -> anyhow::Result<()> {
        let resp = self
            .client
            .patch(format!(
                "{}/api/v1/agent/deployments/{}/status",
                self.base_url, deployment_id
            ))
            .header("X-Tundra-Server-Id", &self.server_id)
            .json(&update)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!(
                "status update failed: {} — {}",
                status,
                body
            ));
        }
        Ok(())
    }
}
