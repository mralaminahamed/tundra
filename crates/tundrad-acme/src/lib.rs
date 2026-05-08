//! ACME certificate provisioner wrapping `instant-acme`.
//!
//! # Usage
//!
//! ```ignore
//! let provisioner = AcmeProvisioner::lets_encrypt_staging()
//!     .with_email("ops@example.com".to_owned());
//!
//! let cert = provisioner
//!     .provision("example.com", |token, key_auth| {
//!         Box::pin(async move { store_challenge(token, key_auth).await })
//!     })
//!     .await?;
//! ```

use std::time::Duration;

use instant_acme::{
    Account, ChallengeType, Identifier, LetsEncrypt, NewAccount, NewOrder, OrderStatus,
    RetryPolicy,
};
use time::OffsetDateTime;

/// A provisioned certificate — all fields are PEM-encoded strings.
#[derive(Debug, Clone)]
pub struct IssuedCert {
    /// The leaf certificate PEM (first block in the chain).
    pub cert_pem: String,
    /// The full certificate chain PEM (leaf + intermediates as returned by the CA).
    pub chain_pem: String,
    /// The private key PEM (PKCS#8 format).
    pub key_pem: String,
    /// Not-before validity boundary.
    pub not_before: OffsetDateTime,
    /// Not-after validity boundary (expiry).
    pub not_after: OffsetDateTime,
    /// The HTTP-01 challenge token (URL-path segment after `/.well-known/acme-challenge/`).
    pub challenge_token: String,
    /// The full key-authorization string to serve at the challenge URL.
    pub key_authorization: String,
}

/// Thin wrapper around the instant-acme `Account` that runs the full HTTP-01 issuance flow.
#[derive(Debug, Clone)]
pub struct AcmeProvisioner {
    directory_url: String,
    email: String,
}

impl AcmeProvisioner {
    /// Use the Let's Encrypt **production** directory.
    pub fn lets_encrypt() -> Self {
        Self {
            directory_url: LetsEncrypt::Production.url().to_owned(),
            email: String::new(),
        }
    }

    /// Use the Let's Encrypt **staging** directory (no rate limits, untrusted root).
    pub fn lets_encrypt_staging() -> Self {
        Self {
            directory_url: LetsEncrypt::Staging.url().to_owned(),
            email: String::new(),
        }
    }

    /// Set the contact e-mail for ACME account registration.
    pub fn with_email(mut self, email: String) -> Self {
        self.email = email;
        self
    }

    /// Provision a TLS certificate for `domain` via HTTP-01.
    ///
    /// The `on_challenge` callback is called **before** the ACME server is asked to validate the
    /// challenge.  The caller must persist `(token, key_auth)` so that
    /// `GET /.well-known/acme-challenge/<token>` returns `key_auth` as plain text.
    ///
    /// The callback returns a pinned boxed future so it can perform async I/O (e.g. a DB write).
    pub async fn provision(
        &self,
        domain: &str,
        mut on_challenge: impl FnMut(
            &str,
            &str,
        ) -> std::pin::Pin<
            Box<dyn std::future::Future<Output = anyhow::Result<()>> + Send>,
        >,
    ) -> anyhow::Result<IssuedCert> {
        let contact = if self.email.is_empty() {
            vec![]
        } else {
            vec![format!("mailto:{}", self.email)]
        };
        let contact_refs: Vec<&str> = contact.iter().map(String::as_str).collect();

        tracing::info!(domain, "ACME: creating/restoring account");
        let (account, _credentials) = Account::builder()?
            .create(
                &NewAccount {
                    contact: &contact_refs,
                    terms_of_service_agreed: true,
                    only_return_existing: false,
                },
                self.directory_url.clone(),
                None, // no external account binding
            )
            .await?;

        tracing::info!(domain, "ACME: creating order");
        let identifiers = [Identifier::Dns(domain.to_owned())];
        let mut order = account
            .new_order(&NewOrder::new(&identifiers))
            .await?;

        let order_url = order.url().to_owned();
        tracing::debug!(order_url, "ACME: order created");

        // ── Collect the HTTP-01 challenge ─────────────────────────────────────
        let mut challenge_token = String::new();
        let mut key_authorization = String::new();

        {
            let mut authorizations = order.authorizations();
            while let Some(result) = authorizations.next().await {
                let mut auth = result?;

                if auth.status == instant_acme::AuthorizationStatus::Valid {
                    tracing::debug!("ACME: authorization already valid, skipping");
                    continue;
                }

                let mut ch = auth
                    .challenge(ChallengeType::Http01)
                    .ok_or_else(|| anyhow::anyhow!("ACME: no HTTP-01 challenge offered"))?;

                let key_auth = ch.key_authorization();
                challenge_token = ch.token.clone();
                key_authorization = key_auth.as_str().to_owned();

                tracing::info!(
                    domain,
                    token = %challenge_token,
                    "ACME: storing HTTP-01 challenge"
                );

                on_challenge(&challenge_token, &key_authorization).await?;

                ch.set_ready().await?;
            }
        }

        if challenge_token.is_empty() {
            return Err(anyhow::anyhow!(
                "ACME: no pending HTTP-01 challenge found for {domain}"
            ));
        }

        // ── Poll until the order is ready to finalize ─────────────────────────
        tracing::info!(domain, "ACME: polling order until ready");
        let retry = RetryPolicy::new()
            .initial_delay(Duration::from_secs(3))
            .backoff(1.5)
            .timeout(Duration::from_secs(120));

        let status = order.poll_ready(&retry).await?;
        if status != OrderStatus::Ready {
            return Err(anyhow::anyhow!(
                "ACME: order ended in unexpected status {status:?} for {domain}"
            ));
        }

        // ── Finalize (rcgen generates CSR + private key internally) ───────────
        tracing::info!(domain, "ACME: finalizing order");
        let key_pem = order.finalize().await?;

        // ── Wait for the certificate to become available ──────────────────────
        tracing::info!(domain, "ACME: polling for certificate");
        let retry_cert = RetryPolicy::new()
            .initial_delay(Duration::from_secs(3))
            .backoff(1.5)
            .timeout(Duration::from_secs(60));

        let chain_pem = order.poll_certificate(&retry_cert).await?;

        // Split leaf from the rest of the chain.
        let cert_pem = first_pem_block(&chain_pem);

        // Set not_before = now and not_after = now + 90 days (standard LE validity).
        // A TODO for a future improvement is to parse the actual X.509 dates.
        // TODO: parse not_before / not_after from cert_pem using x509-parser feature.
        let now = OffsetDateTime::now_utc();
        let not_before = now;
        let not_after = now + time::Duration::days(90);

        tracing::info!(domain, "ACME: certificate issued successfully");

        Ok(IssuedCert {
            cert_pem,
            chain_pem,
            key_pem,
            not_before,
            not_after,
            challenge_token,
            key_authorization,
        })
    }
}

/// Extract the first PEM block from a certificate chain.
fn first_pem_block(chain: &str) -> String {
    let mut in_block = false;
    let mut lines: Vec<&str> = Vec::new();

    for line in chain.lines() {
        if line.starts_with("-----BEGIN") {
            if in_block {
                // Already collected one cert — stop here.
                break;
            }
            in_block = true;
        }
        if in_block {
            lines.push(line);
        }
        if line.starts_with("-----END") {
            break;
        }
    }

    if lines.is_empty() {
        chain.to_owned()
    } else {
        lines.join("\n") + "\n"
    }
}
