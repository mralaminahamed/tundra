/// Namecheap API client stub.
#[derive(Debug, Clone)]
pub struct NamecheapClient {
    api_user: String,
    api_key: String,
    client_ip: String,
    sandbox: bool,
}

impl NamecheapClient {
    pub fn new(api_user: String, api_key: String, client_ip: String, sandbox: bool) -> Self {
        Self {
            api_user,
            api_key,
            client_ip,
            sandbox,
        }
    }

    fn base_url(&self) -> &'static str {
        if self.sandbox {
            "https://api.sandbox.namecheap.com/xml.response"
        } else {
            "https://api.namecheap.com/xml.response"
        }
    }

    /// Stub: list domains from Namecheap account.
    pub async fn list_domains(&self) -> Result<Vec<String>, NamecheapError> {
        // In production: calls namecheap.domains.getList API
        let _ = self.base_url();
        Ok(vec![])
    }

    /// Stub: set nameservers for a domain.
    pub async fn set_nameservers(
        &self,
        domain: &str,
        nameservers: &[String],
    ) -> Result<(), NamecheapError> {
        tracing::info!(
            domain,
            ns = ?nameservers,
            api_user = %self.api_user,
            "Namecheap set nameservers (stub)"
        );
        Ok(())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum NamecheapError {
    #[error("API error: {0}")]
    Api(String),
    #[error("HTTP error: {0}")]
    Http(String),
}
