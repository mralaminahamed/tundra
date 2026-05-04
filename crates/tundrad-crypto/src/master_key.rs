use crate::CryptoError;
use rand::TryRng;
use zeroize::{Zeroize, ZeroizeOnDrop};

/// 64-byte file layout: [0..32] = key material, [32..64] = BLAKE3-256(key material).
pub struct MasterKey {
    key: [u8; 32],
}

impl MasterKey {
    /// Load and verify from disk. Refuses to continue on any mismatch.
    pub fn load(path: &std::path::Path) -> Result<Self, CryptoError> {
        let bytes = std::fs::read(path)?;
        if bytes.len() != 64 {
            return Err(CryptoError::InvalidMasterKeyLength(bytes.len()));
        }
        let expected = blake3::hash(&bytes[..32]);
        if expected.as_bytes() != &bytes[32..] {
            return Err(CryptoError::MasterKeyIntegrityFailed);
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(&bytes[..32]);
        Ok(Self { key })
    }

    /// Generate a fresh master key. Returns the raw 64-byte file contents (caller writes to disk).
    pub fn generate() -> ([u8; 64], Self) {
        let mut key = [0u8; 32];
        rand::rng().try_fill_bytes(&mut key).expect("rng");
        let hash = blake3::hash(&key);
        let mut file_bytes = [0u8; 64];
        file_bytes[..32].copy_from_slice(&key);
        file_bytes[32..].copy_from_slice(hash.as_bytes());
        let instance = Self { key };
        (file_bytes, instance)
    }

    pub(crate) fn bytes(&self) -> &[u8; 32] {
        &self.key
    }
}

impl Zeroize for MasterKey {
    fn zeroize(&mut self) {
        self.key.zeroize();
    }
}

impl ZeroizeOnDrop for MasterKey {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn round_trip_generate_load() {
        let (file_bytes, key) = MasterKey::generate();
        let mut f = NamedTempFile::new().unwrap();
        f.write_all(&file_bytes).unwrap();
        let loaded = MasterKey::load(f.path()).unwrap();
        assert_eq!(key.bytes(), loaded.bytes());
    }

    #[test]
    fn rejects_wrong_length() {
        let mut f = NamedTempFile::new().unwrap();
        f.write_all(&[0u8; 32]).unwrap();
        assert!(matches!(
            MasterKey::load(f.path()),
            Err(CryptoError::InvalidMasterKeyLength(32))
        ));
    }

    #[test]
    fn rejects_tampered_trailer() {
        let (mut file_bytes, _) = MasterKey::generate();
        file_bytes[32] ^= 0xFF; // flip a bit in the trailer
        let mut f = NamedTempFile::new().unwrap();
        f.write_all(&file_bytes).unwrap();
        assert!(matches!(
            MasterKey::load(f.path()),
            Err(CryptoError::MasterKeyIntegrityFailed)
        ));
    }
}
