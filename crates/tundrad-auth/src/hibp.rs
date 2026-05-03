//! k-anonymity Have I Been Pwned password breach check.
//!
//! Uses the range API: only the first 5 hex chars of the SHA-1 hash are sent
//! to the remote service — the full hash never leaves the caller.

use sha1::{Digest, Sha1};

use crate::AuthError;

/// Check whether `password` appears in the HIBP Pwned Passwords database.
///
/// Uses k-anonymity: only the first 5 uppercase hex chars of `SHA-1(password)`
/// are sent to `https://api.pwnedpasswords.com/range/{prefix}`.
///
/// Returns:
/// - `Ok(true)`  — password is in the breach database.
/// - `Ok(false)` — password is not in the breach database.
/// - `Err(AuthError::HibpUnavailable)` — network / service error (non-fatal).
///
/// Callers **must not** block on this result — log the error and continue.
pub async fn is_pwned(password: &str, client: &reqwest::Client) -> Result<bool, AuthError> {
    let hash_bytes = Sha1::digest(password.as_bytes());
    // Uppercase hex string of the full hash.
    let hash_hex: String = hash_bytes.iter().map(|b| format!("{b:02X}")).collect();

    let prefix = &hash_hex[..5];
    let suffix = &hash_hex[5..];

    let url = format!("https://api.pwnedpasswords.com/range/{prefix}");
    let response = client.get(&url).send().await.map_err(|e| {
        tracing::warn!(error = %e, "HIBP request failed");
        AuthError::HibpUnavailable
    })?;

    let body = response.text().await.map_err(|e| {
        tracing::warn!(error = %e, "HIBP response read failed");
        AuthError::HibpUnavailable
    })?;

    // Each line: "<SUFFIX>:<count>\r\n"
    let pwned = body.lines().any(|line| {
        line.split(':')
            .next()
            .map(|s| s.eq_ignore_ascii_case(suffix))
            .unwrap_or(false)
    });

    Ok(pwned)
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Verify the SHA-1 + hex logic against a known value without hitting the network.
    /// "password" → SHA-1 → 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    #[test]
    fn sha1_hex_known_value() {
        let hash_bytes = Sha1::digest(b"password");
        let hex: String = hash_bytes.iter().map(|b| format!("{b:02X}")).collect();
        assert_eq!(hex, "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8");
        assert_eq!(&hex[..5], "5BAA6");
        assert_eq!(&hex[5..], "1E4C9B93F3F0682250B6CF8331B7EE68FD8");
    }

    /// Simulate a HIBP response body that contains the suffix for "password".
    /// Confirms the line-matching logic works correctly.
    #[test]
    fn parse_response_finds_pwned() {
        // Suffix for "password": 1E4C9B93F3F0682250B6CF8331B7EE68FD8
        let suffix = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";
        let fake_body = "1A2B3C4D5E6F7890ABCDEF1234567890ABC:3\r\n\
                         1E4C9B93F3F0682250B6CF8331B7EE68FD8:9545824\r\n\
                         ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ:1\r\n";

        let pwned = fake_body.lines().any(|line| {
            line.split(':')
                .next()
                .map(|s| s.eq_ignore_ascii_case(suffix))
                .unwrap_or(false)
        });
        assert!(pwned, "should detect 'password' as pwned");
    }

    /// Confirms the matching logic returns false when the suffix is absent.
    #[test]
    fn parse_response_clean_password() {
        let suffix = "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"[5..].to_string();
        let fake_body = "1A2B3C4D5E6F7890ABCDEF1234567890ABC:3\r\n\
                         1E4C9B93F3F0682250B6CF8331B7EE68FD8:9545824\r\n";

        let pwned = fake_body.lines().any(|line| {
            line.split(':')
                .next()
                .map(|s| s.eq_ignore_ascii_case(&suffix))
                .unwrap_or(false)
        });
        assert!(!pwned, "should not detect clean password as pwned");
    }
}
