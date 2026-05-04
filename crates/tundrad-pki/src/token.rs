use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::TryRng;
use sha2::{Digest, Sha256};
use time::OffsetDateTime;

/// A single-use server enrolment token. Show `raw` once; store only the hash.
pub struct SetupToken {
    pub raw: String,
    pub expires_at: OffsetDateTime,
}

/// SHA-256(raw token bytes) — what gets stored in the database.
#[derive(Clone, Debug, PartialEq)]
pub struct SetupTokenHash(pub Vec<u8>);

impl SetupToken {
    /// Generate a new 32-byte random token, valid 24 hours.
    pub fn generate() -> Self {
        let mut bytes = [0u8; 32];
        rand::rng().try_fill_bytes(&mut bytes).expect("rng");
        let encoded = URL_SAFE_NO_PAD.encode(bytes);
        Self {
            raw: format!("tnd_setup_{encoded}"),
            expires_at: OffsetDateTime::now_utc() + time::Duration::hours(24),
        }
    }

    pub fn hash(&self) -> SetupTokenHash {
        SetupTokenHash(Sha256::digest(self.raw.as_bytes()).to_vec())
    }
}

impl SetupTokenHash {
    /// Hash an incoming raw token for DB lookup.
    pub fn from_raw(raw: &str) -> Self {
        SetupTokenHash(Sha256::digest(raw.as_bytes()).to_vec())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_has_correct_prefix() {
        let t = SetupToken::generate();
        assert!(t.raw.starts_with("tnd_setup_"), "got: {}", t.raw);
    }

    #[test]
    fn token_hash_deterministic() {
        let t = SetupToken::generate();
        assert_eq!(t.hash(), SetupTokenHash::from_raw(&t.raw));
    }

    #[test]
    fn different_tokens_have_different_hashes() {
        let a = SetupToken::generate();
        let b = SetupToken::generate();
        assert_ne!(a.hash(), b.hash());
    }

    #[test]
    fn expires_in_24h() {
        let t = SetupToken::generate();
        let diff = t.expires_at - OffsetDateTime::now_utc();
        assert!(diff.whole_hours() >= 23 && diff.whole_hours() <= 24);
    }
}
