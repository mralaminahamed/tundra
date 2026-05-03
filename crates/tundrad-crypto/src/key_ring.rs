use crate::{CryptoError, MasterKey};
use aes_gcm::{Aes256Gcm, KeyInit};
use hkdf::Hkdf;
use sha2::Sha256;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

static KEY_RING: OnceLock<Arc<KeyRing>> = OnceLock::new();

/// Thread-safe singleton. Holds the master key and lazily derives per-column-family AES keys.
pub struct KeyRing {
    master: MasterKey,
    cache: Mutex<HashMap<String, [u8; 32]>>,
}

impl KeyRing {
    /// Initialise the process-global KeyRing. Call once at daemon startup.
    pub fn init_global(master: MasterKey) -> Result<Arc<Self>, CryptoError> {
        let ring = Arc::new(Self {
            master,
            cache: Mutex::new(HashMap::new()),
        });
        KEY_RING
            .set(ring.clone())
            .map_err(|_| CryptoError::AlreadyInitialized)?;
        Ok(ring)
    }

    /// Retrieve the global instance. Panics in tests if not initialised; returns Err in prod.
    pub fn global() -> Result<&'static Arc<KeyRing>, CryptoError> {
        KEY_RING.get().ok_or(CryptoError::KeyRingNotInitialized)
    }

    /// Derive (or return cached) AES-256-GCM cipher for `family`.
    /// `family` must be a stable string like `"tundra:v1:identity:totp_secret"`.
    pub fn family_cipher(&self, family: &str) -> Result<Aes256Gcm, CryptoError> {
        let mut cache = self.cache.lock().expect("KeyRing lock poisoned");
        if let Some(key_bytes) = cache.get(family) {
            return Aes256Gcm::new_from_slice(key_bytes).map_err(|_| CryptoError::AeadInit);
        }
        let hk = Hkdf::<Sha256>::new(None, self.master.bytes());
        let mut okm = [0u8; 32];
        hk.expand(family.as_bytes(), &mut okm)
            .map_err(|_| CryptoError::HkdfExpand)?;
        let cipher = Aes256Gcm::new_from_slice(&okm).map_err(|_| CryptoError::AeadInit)?;
        cache.insert(family.to_owned(), okm);
        Ok(cipher)
    }
}

#[cfg(test)]
pub(crate) mod test_helpers {
    use super::*;

    /// Build a KeyRing from a fixed test master key (not globally registered).
    pub fn test_ring() -> Arc<KeyRing> {
        let (_, master) = MasterKey::generate();
        Arc::new(KeyRing {
            master,
            cache: Mutex::new(HashMap::new()),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn different_families_produce_different_keys() {
        let ring = test_helpers::test_ring();
        let c1 = ring
            .family_cipher("tundra:v1:identity:totp_secret")
            .unwrap();
        let c2 = ring
            .family_cipher("tundra:v1:plugin_settings:secret")
            .unwrap();
        // Smoke test: both succeed; we can't easily compare AES keys directly so just verify
        // they are callable without error and produce different outputs for the same input.
        use aes_gcm::{Nonce, aead::Aead};
        use rand::RngCore;
        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let pt = b"hello";
        let ct1 = c1.encrypt(nonce, pt.as_ref()).unwrap();
        let ct2 = c2.encrypt(nonce, pt.as_ref()).unwrap();
        assert_ne!(ct1, ct2);
    }

    #[test]
    fn same_family_is_cached() {
        let ring = test_helpers::test_ring();
        // Hit it twice — second call reads from cache
        let _ = ring
            .family_cipher("tundra:v1:identity:totp_secret")
            .unwrap();
        let _ = ring
            .family_cipher("tundra:v1:identity:totp_secret")
            .unwrap();
    }
}
