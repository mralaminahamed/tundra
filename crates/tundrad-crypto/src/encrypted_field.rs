use crate::CryptoError;
use aes_gcm::{Nonce, aead::Aead};
use rand::RngCore;
use serde::{Serialize, de::DeserializeOwned};
use sqlx::{
    Decode, Encode, Postgres, Type,
    encode::IsNull,
    error::BoxDynError,
    postgres::{PgArgumentBuffer, PgTypeInfo, PgValueRef},
};
use std::marker::PhantomData;

const VERSION: u8 = 0x01;
const NONCE_LEN: usize = 12;

/// Marker trait: every encrypted column family declares its HKDF info string here.
pub trait EncryptedFamily: Send + Sync + 'static {
    const FAMILY: &'static str;
}

/// A value of type `T` encrypted with AES-256-GCM under the column-family key for `F`.
///
/// Wire format (stored as `bytea`):
/// `[1-byte version=0x01][12-byte nonce][ciphertext][16-byte GCM tag]`
pub struct EncryptedField<T, F: EncryptedFamily>(pub T, PhantomData<F>);

impl<T, F: EncryptedFamily> EncryptedField<T, F> {
    pub fn new(value: T) -> Self {
        Self(value, PhantomData)
    }

    pub fn into_inner(self) -> T {
        self.0
    }

    pub fn value(&self) -> &T {
        &self.0
    }
}

impl<T: Clone, F: EncryptedFamily> Clone for EncryptedField<T, F> {
    fn clone(&self) -> Self {
        Self(self.0.clone(), PhantomData)
    }
}

impl<T: std::fmt::Debug, F: EncryptedFamily> std::fmt::Debug for EncryptedField<T, F> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_tuple("EncryptedField")
            .field(&"<redacted>")
            .finish()
    }
}

// ── Encrypt ──────────────────────────────────────────────────────────────────

pub(crate) fn encrypt_value<T: Serialize>(value: &T, family: &str) -> Result<Vec<u8>, CryptoError> {
    let ring = crate::KeyRing::global()?;
    let cipher = ring.family_cipher(family)?;

    let plaintext = serde_json::to_vec(value)?;

    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    // aes-gcm appends the 16-byte tag to the ciphertext
    let ct_with_tag = cipher
        .encrypt(nonce, plaintext.as_slice())
        .map_err(|_| CryptoError::Encrypt)?;

    let mut out = Vec::with_capacity(1 + NONCE_LEN + ct_with_tag.len());
    out.push(VERSION);
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ct_with_tag);
    Ok(out)
}

// ── Decrypt ──────────────────────────────────────────────────────────────────

pub(crate) fn decrypt_value<T: DeserializeOwned>(
    bytes: &[u8],
    family: &str,
) -> Result<T, CryptoError> {
    const MIN_LEN: usize = 1 + NONCE_LEN + 16; // version + nonce + tag (empty plaintext)
    if bytes.len() < MIN_LEN {
        return Err(CryptoError::InvalidCiphertext("too short"));
    }
    if bytes[0] != VERSION {
        return Err(CryptoError::InvalidCiphertext("unknown version byte"));
    }
    let nonce = Nonce::from_slice(&bytes[1..1 + NONCE_LEN]);
    let ct_with_tag = &bytes[1 + NONCE_LEN..];

    let ring = crate::KeyRing::global()?;
    let cipher = ring.family_cipher(family)?;

    let plaintext = cipher
        .decrypt(nonce, ct_with_tag)
        .map_err(|_| CryptoError::Decrypt)?;

    Ok(serde_json::from_slice(&plaintext)?)
}

// ── SQLx ─────────────────────────────────────────────────────────────────────

impl<T, F: EncryptedFamily> Type<Postgres> for EncryptedField<T, F> {
    fn type_info() -> PgTypeInfo {
        // Stored as `bytea`
        <Vec<u8> as Type<Postgres>>::type_info()
    }
}

impl<'q, T, F> Encode<'q, Postgres> for EncryptedField<T, F>
where
    T: Serialize,
    F: EncryptedFamily,
{
    fn encode_by_ref(&self, buf: &mut PgArgumentBuffer) -> Result<IsNull, BoxDynError> {
        let encrypted = encrypt_value(&self.0, F::FAMILY)?;
        <Vec<u8> as Encode<Postgres>>::encode_by_ref(&encrypted, buf)
    }
}

impl<'r, T, F> Decode<'r, Postgres> for EncryptedField<T, F>
where
    T: DeserializeOwned,
    F: EncryptedFamily,
{
    fn decode(value: PgValueRef<'r>) -> Result<Self, BoxDynError> {
        let bytes: Vec<u8> = Decode::<Postgres>::decode(value)?;
        let inner = decrypt_value::<T>(&bytes, F::FAMILY)?;
        Ok(Self(inner, PhantomData))
    }
}

// ── Well-known family types ───────────────────────────────────────────────────

macro_rules! def_family {
    ($name:ident, $info:literal) => {
        #[derive(Debug, Clone, Copy)]
        pub struct $name;
        impl EncryptedFamily for $name {
            const FAMILY: &'static str = $info;
        }
    };
}

def_family!(TotpSecretFamily, "tundra:v1:identity:totp_secret");
def_family!(RecoveryCodesFamily, "tundra:v1:identity:recovery_codes");
def_family!(EnvVarFamily, "tundra:v1:site:env_var");
def_family!(PluginSettingsFamily, "tundra:v1:plugin:settings");
def_family!(IntegrationSecretFamily, "tundra:v1:integration:secret");

pub type EncryptedTotpSecret = EncryptedField<String, TotpSecretFamily>;
pub type EncryptedRecoveryCodes = EncryptedField<Vec<String>, RecoveryCodesFamily>;
pub type EncryptedEnvVar = EncryptedField<String, EnvVarFamily>;
pub type EncryptedPluginSettings = EncryptedField<serde_json::Value, PluginSettingsFamily>;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::key_ring::test_helpers::test_ring;

    // Direct encrypt/decrypt round-trip without going through the global singleton
    fn round_trip<T: Serialize + DeserializeOwned + PartialEq + std::fmt::Debug>(value: T) {
        let ring = test_ring();
        const FAM: &str = "tundra:v1:test:value";

        // Temporarily install as global (only works if not already installed)
        // For unit tests we bypass the global and call internal helpers via the ring directly.
        let cipher = ring.family_cipher(FAM).unwrap();
        let plaintext = serde_json::to_vec(&value).unwrap();
        let mut nonce_bytes = [0u8; NONCE_LEN];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ct = cipher.encrypt(nonce, plaintext.as_slice()).unwrap();
        let mut blob = vec![VERSION];
        blob.extend_from_slice(&nonce_bytes);
        blob.extend_from_slice(&ct);

        let pt = cipher.decrypt(nonce, ct.as_slice()).unwrap();
        let recovered: T = serde_json::from_slice(&pt).unwrap();
        assert_eq!(value, recovered);
    }

    #[test]
    fn string_round_trip() {
        round_trip("super-secret-totp-seed".to_string());
    }

    #[test]
    fn vec_round_trip() {
        round_trip(vec!["code1".to_string(), "code2".to_string()]);
    }

    #[test]
    fn version_byte_checked() {
        let blob = [0x02u8; 30]; // wrong version
        let result = decrypt_value::<String>(&blob, "tundra:v1:test:value");
        assert!(matches!(
            result,
            Err(CryptoError::KeyRingNotInitialized | CryptoError::InvalidCiphertext(_))
        ));
    }
}
