/// Mailgun API client stub.
#[derive(Debug, Clone)]
pub struct MailgunClient {
    api_key: String,
    domain: String,
}

impl MailgunClient {
    pub fn new(api_key: String, domain: String) -> Self {
        Self { api_key, domain }
    }

    const BASE_URL: &'static str = "https://api.mailgun.net/v3";

    /// Stub: verify the configured domain is validated in Mailgun.
    pub async fn verify_domain(&self) -> Result<bool, MailgunError> {
        // In production: GET /v3/domains/{domain}
        let _ = (Self::BASE_URL, &self.api_key, &self.domain);
        Ok(true)
    }

    /// Stub: retrieve delivery stats for the domain.
    pub async fn get_stats(&self) -> Result<Vec<String>, MailgunError> {
        tracing::info!(
            domain = %self.domain,
            "Mailgun get stats (stub)"
        );
        Ok(vec![])
    }
}

#[derive(Debug, thiserror::Error)]
pub enum MailgunError {
    #[error("API error: {0}")]
    Api(String),
    #[error("HTTP error: {0}")]
    Http(String),
}
