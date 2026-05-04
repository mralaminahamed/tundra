use crate::CryptoError;
use argon2::{
    Argon2, Params, Version,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
};
use rand_core::OsRng;

/// Argon2id — m=64MiB, t=3, p=1. Non-negotiable per security audit §4.1.
fn argon2() -> Result<Argon2<'static>, CryptoError> {
    let params = Params::new(
        65_536, // m_cost = 64 MiB (in KiB)
        3,      // t_cost
        1,      // p_cost
        None,
    )
    .map_err(|_| CryptoError::AeadInit)?; // reuse AeadInit as "bad params"
    Ok(Argon2::new(
        argon2::Algorithm::Argon2id,
        Version::V0x13,
        params,
    ))
}

/// Hash a password. Returns the PHC string (includes algorithm, params, salt, hash).
pub fn hash_password(password: &str) -> Result<String, CryptoError> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = argon2()?
        .hash_password(password.as_bytes(), &salt)
        .map_err(|_| CryptoError::Encrypt)?;
    Ok(hash.to_string())
}

/// Verify a password against a stored PHC string.
/// Returns `true` if correct, `false` if wrong (never exposes timing differences).
pub fn verify_password(password: &str, hash: &str) -> Result<bool, CryptoError> {
    let parsed = PasswordHash::new(hash).map_err(|_| CryptoError::InvalidCiphertext("bad hash"))?;
    Ok(argon2()?
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_and_verify() {
        let hash = hash_password("correct-horse-battery-staple").unwrap();
        assert!(verify_password("correct-horse-battery-staple", &hash).unwrap());
        assert!(!verify_password("wrong-password", &hash).unwrap());
    }

    #[test]
    fn hash_includes_argon2id_algorithm_tag() {
        let hash = hash_password("test").unwrap();
        assert!(
            hash.starts_with("$argon2id$"),
            "expected PHC argon2id prefix, got: {hash}"
        );
    }

    #[test]
    fn different_hashes_for_same_password() {
        let h1 = hash_password("password").unwrap();
        let h2 = hash_password("password").unwrap();
        assert_ne!(h1, h2, "salts should differ");
    }
}
