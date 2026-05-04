use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

/// Validate a GitHub webhook signature.
///
/// The signature comes from the `X-Hub-Signature-256` header as `sha256=<hex>`.
/// Returns `true` if the signature is valid, `false` otherwise.
pub fn validate_signature(payload: &[u8], secret: &[u8], signature_header: &str) -> bool {
    let expected_hex = match signature_header.strip_prefix("sha256=") {
        Some(h) => h,
        None => return false,
    };

    let expected_bytes = match hex::decode(expected_hex) {
        Ok(b) => b,
        Err(_) => return false,
    };

    let mut mac = HmacSha256::new_from_slice(secret).expect("HMAC accepts any key length");
    mac.update(payload);
    mac.verify_slice(&expected_bytes).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_signature_accepted() {
        let secret = b"test-secret";
        let payload = b"hello world";
        // Compute expected signature
        let mut mac = HmacSha256::new_from_slice(secret).unwrap();
        mac.update(payload);
        let sig_bytes = mac.finalize().into_bytes();
        let sig_hex = format!("sha256={}", hex::encode(sig_bytes));
        assert!(validate_signature(payload, secret, &sig_hex));
    }

    #[test]
    fn invalid_signature_rejected() {
        assert!(!validate_signature(
            b"payload",
            b"secret",
            "sha256=deadbeef"
        ));
        assert!(!validate_signature(b"payload", b"secret", "invalid-format"));
    }
}
