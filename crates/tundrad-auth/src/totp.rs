//! RFC 6238 TOTP implementation using HMAC-SHA1 directly.
//! No third-party TOTP crate — uses `hmac` + `sha1` crates only.

use hmac::{Hmac, Mac};
use rand::TryRng;
use sha1::Sha1;
use sha1::digest::KeyInit;

type HmacSha1 = Hmac<Sha1>;

// RFC 4648 base32 alphabet (uppercase A-Z, digits 2-7).
const BASE32_ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// ─── Base32 encode/decode ────────────────────────────────────────────────────

/// Encode `data` to RFC 4648 base32 (no padding).
fn base32_encode(data: &[u8]) -> String {
    let mut out = String::new();
    let mut buf: u64 = 0;
    let mut bits = 0u8;

    for &byte in data {
        buf = (buf << 8) | u64::from(byte);
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            let idx = ((buf >> bits) & 0x1F) as usize;
            out.push(BASE32_ALPHABET[idx] as char);
        }
    }

    if bits > 0 {
        let idx = ((buf << (5 - bits)) & 0x1F) as usize;
        out.push(BASE32_ALPHABET[idx] as char);
    }

    out
}

/// Decode a base32-encoded string (case-insensitive, ignore `=` padding).
/// Returns `None` if the input contains invalid characters.
fn base32_decode(input: &str) -> Option<Vec<u8>> {
    let mut buf: u64 = 0;
    let mut bits = 0u8;
    let mut out = Vec::new();

    for ch in input.chars() {
        if ch == '=' {
            continue; // ignore padding
        }
        let val = match ch.to_ascii_uppercase() {
            c @ 'A'..='Z' => (c as u8 - b'A') as u64,
            c @ '2'..='7' => (c as u8 - b'2' + 26) as u64,
            _ => return None,
        };
        buf = (buf << 5) | val;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            out.push(((buf >> bits) & 0xFF) as u8);
        }
    }

    Some(out)
}

// ─── Public API ─────────────────────────────────────────────────────────────

/// Generate a new TOTP secret: 20 random bytes encoded as base32.
pub fn generate_secret() -> String {
    let mut bytes = [0u8; 20];
    rand::rng().try_fill_bytes(&mut bytes).expect("rng");
    base32_encode(&bytes)
}

/// Build an `otpauth://` URI suitable for QR code display.
pub fn totp_uri(secret: &str, account: &str, issuer: &str) -> String {
    format!(
        "otpauth://totp/{issuer}:{account}?secret={secret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30"
    )
}

/// Compute a single TOTP code for time step `t`.
fn hotp(secret_bytes: &[u8], t: u64) -> String {
    let msg = t.to_be_bytes();
    let mut mac = HmacSha1::new_from_slice(secret_bytes).expect("HMAC-SHA1 accepts any key length");
    mac.update(&msg);
    let hmac = mac.finalize().into_bytes();

    let offset = (hmac[19] & 0x0F) as usize;
    let code = (((hmac[offset] & 0x7F) as u32) << 24
        | (hmac[offset + 1] as u32) << 16
        | (hmac[offset + 2] as u32) << 8
        | hmac[offset + 3] as u32)
        % 1_000_000;

    format!("{code:06}")
}

/// Verify a 6-digit TOTP code against a base32 secret.
///
/// `window` allows clock-drift tolerance: `window = 1` checks T-1, T, T+1.
pub fn verify(secret_base32: &str, code: &str, window: u8) -> bool {
    let secret_bytes = match base32_decode(secret_base32) {
        Some(b) => b,
        None => return false,
    };

    let t = current_t();

    for delta in 0..=u64::from(window) {
        if delta == 0 {
            if hotp(&secret_bytes, t) == code {
                return true;
            }
        } else {
            // Check +delta and -delta (guard against underflow).
            if hotp(&secret_bytes, t + delta) == code {
                return true;
            }
            if t >= delta && hotp(&secret_bytes, t - delta) == code {
                return true;
            }
        }
    }

    false
}

/// Return the current TOTP time step (Unix seconds / 30).
fn current_t() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() / 30)
        .unwrap_or(0)
}

/// Generate 10 single-use recovery codes (16 lowercase hex chars each).
pub fn generate_recovery_codes() -> Vec<String> {
    let mut rng = rand::rng();
    (0..10)
        .map(|_| {
            let mut bytes = [0u8; 8]; // 8 bytes → 16 hex chars
            rng.try_fill_bytes(&mut bytes).expect("rng");
            bytes.iter().map(|b| format!("{b:02x}")).collect()
        })
        .collect()
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base32_round_trip() {
        let secret = generate_secret();
        let decoded = base32_decode(&secret).expect("decode must succeed");
        let re_encoded = base32_encode(&decoded);
        assert_eq!(secret, re_encoded);
    }

    #[test]
    fn base32_round_trip_known() {
        // "Hello!" → JBSWY3DPEE (RFC 4648 base32, no padding)
        let encoded = base32_encode(b"Hello!");
        assert_eq!(encoded, "JBSWY3DPEE");
        let decoded = base32_decode("JBSWY3DPEE").unwrap();
        assert_eq!(decoded, b"Hello!");
    }

    /// RFC 6238 Appendix B test vector (SHA-1, T=1, seed = 12345678901234567890).
    /// T=1 means unix_time = 59, T_step = 59/30 = 1.
    #[test]
    fn rfc6238_test_vector_t1() {
        // RFC 6238 seed for SHA-1: "12345678901234567890" as bytes
        let seed = b"12345678901234567890";
        let secret_b32 = base32_encode(seed);

        // T = floor(59 / 30) = 1
        let code = hotp(seed, 1);
        assert_eq!(code, "287082", "RFC 6238 T=1 vector");

        // Also verify via the base32 path (decode should give back the same seed bytes)
        let decoded = base32_decode(&secret_b32).unwrap();
        assert_eq!(hotp(&decoded, 1), "287082");
    }

    /// RFC 6238 Appendix B test vector T=37037 (unix_time = 1111111109).
    #[test]
    fn rfc6238_test_vector_t37037() {
        let seed = b"12345678901234567890";
        // T = floor(1111111109 / 30) = 37037036
        let code = hotp(seed, 37037036);
        assert_eq!(code, "081804", "RFC 6238 T=37037036 vector");
    }

    #[test]
    fn recovery_code_format() {
        let codes = generate_recovery_codes();
        assert_eq!(codes.len(), 10);
        for code in &codes {
            assert_eq!(code.len(), 16, "code must be 16 chars: {code}");
            assert!(
                code.chars()
                    .all(|c| c.is_ascii_hexdigit() && !c.is_uppercase()),
                "code must be lowercase hex: {code}"
            );
        }
    }

    #[test]
    fn totp_uri_format() {
        let uri = totp_uri("JBSWY3DPEB3W64TM", "alice@example.com", "Tundra");
        assert!(uri.starts_with("otpauth://totp/"));
        assert!(uri.contains("secret=JBSWY3DPEB3W64TM"));
        assert!(uri.contains("issuer=Tundra"));
    }
}
