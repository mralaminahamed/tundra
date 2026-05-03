use crate::PkiError;
use rcgen::{
    BasicConstraints, CertificateParams, DnType, ExtendedKeyUsagePurpose, Ia5String, IsCa, KeyPair,
    KeyUsagePurpose, SanType,
};
use sha2::{Digest, Sha256};
use time::OffsetDateTime;
use uuid::Uuid;

/// Raw PEM bytes for the CA bundle — write to disk, distribute cert to agents.
pub struct CaBundle {
    pub ca_cert_pem: String,
    /// Mode 0400, root-only; never log or expose.
    pub ca_key_pem: String,
}

/// An issued agent mTLS client certificate.
pub struct AgentCertificate {
    pub cert_pem: String,
    /// Empty when issued from a CSR (caller already has the key).
    pub key_pem: String,
    /// SHA-256(DER), lowercase hex — stored in `agent_credentials.cert_fingerprint`.
    pub fingerprint: String,
    pub not_before: OffsetDateTime,
    pub not_after: OffsetDateTime,
}

/// Internal CA that signs agent mTLS client certificates.
pub struct TundraCA {
    /// The original PEM — distributed to agents as their trust anchor.
    ca_cert_pem: String,
    ca_key_pair: KeyPair,
    ca_cert: rcgen::Certificate,
}

impl TundraCA {
    /// Generate a new 5-year CA. Caller persists the returned `CaBundle`.
    pub fn generate() -> Result<(CaBundle, Self), PkiError> {
        let ca_key = KeyPair::generate()?;

        let mut params = CertificateParams::new(vec![])?;
        params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
        params.key_usages = vec![KeyUsagePurpose::KeyCertSign, KeyUsagePurpose::CrlSign];
        params
            .distinguished_name
            .push(DnType::OrganizationName, "Tundra Internal CA");
        params
            .distinguished_name
            .push(DnType::CommonName, "Tundra Root CA v1");

        let now = OffsetDateTime::now_utc();
        params.not_before = now;
        params.not_after = now + time::Duration::days(365 * 5);

        let ca_cert = params.self_signed(&ca_key)?;
        let ca_cert_pem = ca_cert.pem();
        let ca_key_pem = ca_key.serialize_pem();

        let bundle = CaBundle {
            ca_cert_pem: ca_cert_pem.clone(),
            ca_key_pem: ca_key_pem.clone(),
        };

        Ok((
            bundle,
            TundraCA {
                ca_cert_pem,
                ca_key_pair: ca_key,
                ca_cert,
            },
        ))
    }

    /// Reload CA from disk PEM strings on daemon startup.
    /// Re-self-signs with the same key so we have a `Certificate` for issuing.
    /// The original `ca_cert_pem` is what agents trust; the re-signed copy is
    /// only used internally to produce properly-chained leaf certs.
    pub fn from_pem(cert_pem: &str, key_pem: &str) -> Result<Self, PkiError> {
        let ca_key = KeyPair::from_pem(key_pem).map_err(|e| PkiError::PemParse(e.to_string()))?;
        let params = CertificateParams::from_ca_cert_pem(cert_pem)
            .map_err(|e| PkiError::PemParse(e.to_string()))?;
        let ca_cert = params.self_signed(&ca_key)?;
        Ok(TundraCA {
            ca_cert_pem: cert_pem.to_owned(),
            ca_key_pair: ca_key,
            ca_cert,
        })
    }

    /// Issue a 90-day agent client cert for `server_id`.
    /// CN = `tundra-agent`, SAN = `URI:tundra-agent://server-<uuid>`
    pub fn issue_agent_cert(&self, server_id: Uuid) -> Result<AgentCertificate, PkiError> {
        let agent_key = KeyPair::generate()?;
        let key_pem = agent_key.serialize_pem();
        let cert = self.sign_key(&agent_key, server_id)?;
        Ok(AgentCertificate { key_pem, ..cert })
    }

    /// Sign an agent cert from a PEM-encoded private key (renewal via Heartbeat CSR).
    pub fn sign_csr(
        &self,
        key_pem_bytes: &[u8],
        server_id: Uuid,
    ) -> Result<AgentCertificate, PkiError> {
        let key_str =
            std::str::from_utf8(key_pem_bytes).map_err(|e| PkiError::PemParse(e.to_string()))?;
        let key = KeyPair::from_pem(key_str).map_err(|e| PkiError::PemParse(e.to_string()))?;
        self.sign_key(&key, server_id)
    }

    fn sign_key(&self, agent_key: &KeyPair, server_id: Uuid) -> Result<AgentCertificate, PkiError> {
        let now = OffsetDateTime::now_utc();
        let not_after = now + time::Duration::days(90);

        let san_uri = Ia5String::try_from(format!("tundra-agent://server-{server_id}"))
            .map_err(|e| PkiError::CertGen(e.to_string()))?;

        let mut params = CertificateParams::new(vec![])?;
        params
            .distinguished_name
            .push(DnType::CommonName, "tundra-agent");
        params.subject_alt_names = vec![SanType::URI(san_uri)];
        params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ClientAuth];
        params.not_before = now;
        params.not_after = not_after;

        let cert = params.signed_by(agent_key, &self.ca_cert, &self.ca_key_pair)?;
        let der = cert.der();
        let fingerprint = hex::encode(Sha256::digest(der.as_ref()));

        Ok(AgentCertificate {
            cert_pem: cert.pem(),
            key_pem: String::new(),
            fingerprint,
            not_before: now,
            not_after,
        })
    }

    /// `true` when the cert expires in ≤30 days — triggers renewal.
    pub fn should_renew(not_after: OffsetDateTime) -> bool {
        (not_after - OffsetDateTime::now_utc()).whole_days() <= 30
    }

    pub fn ca_cert_pem(&self) -> &str {
        &self.ca_cert_pem
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ca_generate_and_reload() {
        let (bundle, _) = TundraCA::generate().unwrap();
        assert!(bundle.ca_cert_pem.contains("CERTIFICATE"));
        assert!(bundle.ca_key_pem.contains("PRIVATE KEY"));
        TundraCA::from_pem(&bundle.ca_cert_pem, &bundle.ca_key_pem).unwrap();
    }

    #[test]
    fn issue_agent_cert_has_fingerprint() {
        let (_, ca) = TundraCA::generate().unwrap();
        let cert = ca.issue_agent_cert(Uuid::now_v7()).unwrap();
        assert!(!cert.fingerprint.is_empty());
        assert_eq!(cert.fingerprint.len(), 64);
        assert!(!cert.key_pem.is_empty());
    }

    #[test]
    fn should_renew_threshold() {
        let now = OffsetDateTime::now_utc();
        assert!(TundraCA::should_renew(now + time::Duration::days(15)));
        assert!(TundraCA::should_renew(now + time::Duration::days(30)));
        // 35 days gives enough buffer so clock drift between the two now() calls
        // (one in this test, one inside should_renew) doesn't cause a false positive.
        assert!(!TundraCA::should_renew(now + time::Duration::days(35)));
    }
}
