/// Cloudflare API client stub.
#[derive(Debug, Clone)]
pub struct CloudflareClient {
    api_token: String,
    zone_id: String,
}

impl CloudflareClient {
    pub fn new(api_token: String, zone_id: String) -> Self {
        Self { api_token, zone_id }
    }

    const BASE_URL: &'static str = "https://api.cloudflare.com/client/v4";

    /// Stub: list DNS records for the configured zone.
    pub async fn list_dns_records(&self) -> Result<Vec<String>, CloudflareError> {
        // In production: GET /zones/{zone_id}/dns_records
        let _ = (Self::BASE_URL, &self.api_token, &self.zone_id);
        Ok(vec![])
    }

    /// Stub: create a DNS TXT record (e.g., ACME DNS-01 challenge).
    pub async fn create_txt_record(
        &self,
        name: &str,
        content: &str,
        ttl: u32,
    ) -> Result<String, CloudflareError> {
        tracing::info!(
            zone_id = %self.zone_id,
            name,
            content,
            ttl,
            "Cloudflare create TXT record (stub)"
        );
        Ok(String::new())
    }

    /// Stub: delete a DNS record by ID.
    pub async fn delete_dns_record(&self, record_id: &str) -> Result<(), CloudflareError> {
        tracing::info!(
            zone_id = %self.zone_id,
            record_id,
            "Cloudflare delete DNS record (stub)"
        );
        Ok(())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum CloudflareError {
    #[error("API error: {0}")]
    Api(String),
    #[error("HTTP error: {0}")]
    Http(String),
}
