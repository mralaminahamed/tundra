//! API token minting, hashing, and format validation.
//!
//! Format: `tnd_<env>_<base64url-no-pad of 32 random bytes>` (43 chars for the random part).

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::RngCore;
use sha2::{Digest, Sha256};

/// The deployment environment encoded in the token prefix.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TokenEnv {
    Prod,
    Dev,
    Test,
}

impl TokenEnv {
    fn as_str(self) -> &'static str {
        match self {
            TokenEnv::Prod => "prod",
            TokenEnv::Dev => "dev",
            TokenEnv::Test => "test",
        }
    }
}

/// Mint a new API token.
///
/// Returns `(raw_token, sha256_hash)`.
/// - `raw_token` is returned to the caller **once** and never stored.
/// - `sha256_hash` is what gets stored in the database.
pub fn mint_token(env: TokenEnv) -> (String, Vec<u8>) {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let random_part = URL_SAFE_NO_PAD.encode(bytes);
    let raw = format!("tnd_{}_{}", env.as_str(), random_part);
    let hash = hash_token(&raw);
    (raw, hash)
}

/// SHA-256 of the raw token string (for database lookups).
pub fn hash_token(raw: &str) -> Vec<u8> {
    Sha256::digest(raw.as_bytes()).to_vec()
}

/// Validate that `raw` matches the expected token format.
///
/// Format: `tnd_(prod|dev|test)_<43-char base64url-no-pad string>`
pub fn verify_token_format(raw: &str) -> bool {
    let parts: Vec<&str> = raw.splitn(3, '_').collect();
    if parts.len() != 3 {
        return false;
    }
    if parts[0] != "tnd" {
        return false;
    }
    if !matches!(parts[1], "prod" | "dev" | "test") {
        return false;
    }
    let random = parts[2];
    // base64url-no-pad of 32 bytes → ceil(32 * 8 / 6) = 43 chars
    if random.len() != 43 {
        return false;
    }
    random
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mint_correct_prefix_prod() {
        let (token, _hash) = mint_token(TokenEnv::Prod);
        assert!(token.starts_with("tnd_prod_"), "token: {token}");
    }

    #[test]
    fn mint_correct_prefix_dev() {
        let (token, _hash) = mint_token(TokenEnv::Dev);
        assert!(token.starts_with("tnd_dev_"), "token: {token}");
    }

    #[test]
    fn mint_correct_prefix_test() {
        let (token, _hash) = mint_token(TokenEnv::Test);
        assert!(token.starts_with("tnd_test_"), "token: {token}");
    }

    #[test]
    fn random_part_is_43_chars() {
        for env in [TokenEnv::Prod, TokenEnv::Dev, TokenEnv::Test] {
            let (token, _) = mint_token(env);
            let random_part = token.splitn(3, '_').nth(2).unwrap();
            assert_eq!(random_part.len(), 43, "env={env:?} token={token}");
        }
    }

    #[test]
    fn hash_round_trip() {
        let (token, stored_hash) = mint_token(TokenEnv::Prod);
        let lookup_hash = hash_token(&token);
        assert_eq!(stored_hash, lookup_hash);
    }

    #[test]
    fn hash_differs_for_different_tokens() {
        let (t1, h1) = mint_token(TokenEnv::Prod);
        let (t2, h2) = mint_token(TokenEnv::Prod);
        assert_ne!(t1, t2);
        assert_ne!(h1, h2);
    }

    #[test]
    fn format_validation_accepts_valid() {
        let (token, _) = mint_token(TokenEnv::Prod);
        assert!(verify_token_format(&token), "should accept minted token");
    }

    #[test]
    fn format_validation_rejects_bad_prefix() {
        assert!(!verify_token_format(
            "bad_prod_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        ));
    }

    #[test]
    fn format_validation_rejects_bad_env() {
        assert!(!verify_token_format(
            "tnd_staging_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        ));
    }

    #[test]
    fn format_validation_rejects_short_random() {
        assert!(!verify_token_format("tnd_prod_tooshort"));
    }

    #[test]
    fn format_validation_rejects_bad_chars() {
        // 43 chars but contains spaces
        assert!(!verify_token_format(
            "tnd_prod_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA!"
        ));
    }
}
