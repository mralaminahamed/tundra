//! Audit-log redaction pipeline.
//!
//! Every mutation handler writes a row to `audit_log`.  Before the `arguments`
//! JSON blob is persisted, it must pass through [`redact`] so that secrets never
//! reach the database in plaintext.
//!
//! Rules (from `docs/03-security/tundra-security-audit-v1.md §4.5`):
//! 1. Any field whose name appears in [`SENSITIVE_FIELD_NAMES`] is replaced with
//!    `"<redacted:N-bytes>"` where N is the approximate byte size of the original
//!    value.
//! 2. A field named `"value"` is also redacted when it appears in the same JSON
//!    object as `"is_secret": true`.
//! 3. Redaction is recursive — nested objects and arrays are fully traversed.

use serde_json::{Map, Value};

/// Field names that are unconditionally redacted regardless of context.
const SENSITIVE_FIELD_NAMES: &[&str] = &[
    "password",
    "token",
    "secret",
    "private_key",
    "recovery_code",
    "api_key",
    "master_key",
    "passphrase",
];

/// Redact sensitive fields from a JSON value before writing to `audit_log`.
///
/// Returns `(redacted_value, redaction_count)`.  A non-zero count can be used
/// by callers to emit a tracing span attribute for observability.
pub fn redact(value: &Value) -> (Value, usize) {
    redact_inner(value)
}

fn redact_inner(value: &Value) -> (Value, usize) {
    match value {
        Value::Object(obj) => redact_object(obj),
        Value::Array(arr) => redact_array(arr),
        other => (other.clone(), 0),
    }
}

fn redact_object(obj: &Map<String, Value>) -> (Value, usize) {
    // Determine whether this object has `"is_secret": true` at the top level.
    let is_secret = obj
        .get("is_secret")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let mut new_obj = Map::with_capacity(obj.len());
    let mut redaction_count: usize = 0;

    for (k, v) in obj {
        let should_redact =
            SENSITIVE_FIELD_NAMES.contains(&k.as_str()) || (k == "value" && is_secret);

        if should_redact {
            let byte_hint = estimate_byte_size(v);
            new_obj.insert(
                k.clone(),
                Value::String(format!("<redacted:{byte_hint}-bytes>")),
            );
            redaction_count += 1;
        } else {
            let (rv, rc) = redact_inner(v);
            new_obj.insert(k.clone(), rv);
            redaction_count += rc;
        }
    }

    (Value::Object(new_obj), redaction_count)
}

fn redact_array(arr: &[Value]) -> (Value, usize) {
    let mut new_arr = Vec::with_capacity(arr.len());
    let mut count: usize = 0;
    for item in arr {
        let (rv, rc) = redact_inner(item);
        new_arr.push(rv);
        count += rc;
    }
    (Value::Array(new_arr), count)
}

/// Estimate the byte length of a JSON value for the redaction hint.
/// For strings we use the raw string length; for everything else we serialize.
fn estimate_byte_size(v: &Value) -> usize {
    match v {
        Value::String(s) => s.len(),
        _ => v.to_string().len(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn redacts_password_field() {
        let input = json!({ "email": "a@b.com", "password": "hunter2" });
        let (out, count) = redact(&input);
        assert_eq!(count, 1);
        assert!(out["password"].as_str().unwrap().starts_with("<redacted:"));
        assert_eq!(out["email"], "a@b.com");
    }

    #[test]
    fn redacts_token_field() {
        let (out, count) = redact(&json!({ "token": "abc123", "action": "verify" }));
        assert_eq!(count, 1);
        assert!(out["token"].as_str().unwrap().starts_with("<redacted:"));
    }

    #[test]
    fn redacts_recovery_code_field() {
        let (out, count) = redact(&json!({ "recovery_code": "deadbeef1234", "action": "use" }));
        assert_eq!(count, 1);
        assert!(
            out["recovery_code"]
                .as_str()
                .unwrap()
                .starts_with("<redacted:")
        );
    }

    #[test]
    fn redacts_private_key_field() {
        let (out, count) = redact(&json!({ "private_key": "-----BEGIN RSA PRIVATE KEY-----" }));
        assert_eq!(count, 1);
        assert!(
            out["private_key"]
                .as_str()
                .unwrap()
                .starts_with("<redacted:")
        );
    }

    #[test]
    fn redacts_value_when_is_secret_true() {
        let input = json!({ "key": "DB_PASSWORD", "value": "super-secret", "is_secret": true });
        let (out, count) = redact(&input);
        assert_eq!(count, 1);
        assert!(out["value"].as_str().unwrap().starts_with("<redacted:"));
        // Non-sensitive fields survive.
        assert_eq!(out["key"], "DB_PASSWORD");
    }

    #[test]
    fn does_not_redact_value_when_not_secret() {
        let input = json!({ "key": "APP_ENV", "value": "production", "is_secret": false });
        let (out, count) = redact(&input);
        assert_eq!(count, 0);
        assert_eq!(out["value"], "production");
    }

    #[test]
    fn does_not_redact_value_without_is_secret_key() {
        let input = json!({ "value": "some-plaintext" });
        let (out, count) = redact(&input);
        assert_eq!(count, 0);
        assert_eq!(out["value"], "some-plaintext");
    }

    #[test]
    fn nested_redaction_traverses_objects() {
        let input = json!({ "credentials": { "token": "abc123", "host": "db.example.com" } });
        let (out, count) = redact(&input);
        assert_eq!(count, 1);
        assert!(
            out["credentials"]["token"]
                .as_str()
                .unwrap()
                .starts_with("<redacted:")
        );
        assert_eq!(out["credentials"]["host"], "db.example.com");
    }

    #[test]
    fn array_elements_are_traversed() {
        let input = json!([
            { "password": "p1" },
            { "email": "a@b.com" }
        ]);
        let (out, count) = redact(&input);
        assert_eq!(count, 1);
        assert!(
            out[0]["password"]
                .as_str()
                .unwrap()
                .starts_with("<redacted:")
        );
        assert_eq!(out[1]["email"], "a@b.com");
    }

    #[test]
    fn byte_hint_reflects_original_length() {
        let secret = "hunter2"; // 7 chars
        let input = json!({ "password": secret });
        let (out, _) = redact(&input);
        assert_eq!(
            out["password"],
            format!("<redacted:{}-bytes>", secret.len())
        );
    }

    #[test]
    fn non_object_non_array_passed_through() {
        let (out, count) = redact(&json!(42));
        assert_eq!(count, 0);
        assert_eq!(out, json!(42));
    }

    // ── Security regression tests (§4.5) ─────────────────────────────────────

    /// §4.5: password must always be redacted.
    #[test]
    fn sec_4_5_password_always_redacted() {
        let (out, n) = redact(&json!({ "password": "hunter2", "email": "a@b.com" }));
        assert!(n > 0, "password must be redacted");
        assert!(out["password"].as_str().unwrap().starts_with("<redacted:"));
        assert_eq!(out["email"], "a@b.com", "non-sensitive fields preserved");
    }

    /// §4.5: `value` when is_secret=true must be redacted.
    #[test]
    fn sec_4_5_secret_value_redacted() {
        let (out, n) = redact(&json!({ "key": "X", "value": "secret!", "is_secret": true }));
        assert!(n > 0);
        assert!(out["value"].as_str().unwrap().contains("<redacted:"));
    }

    /// §4.5: Non-secret values must NOT be redacted.
    #[test]
    fn sec_4_5_non_secret_value_preserved() {
        let (out, n) = redact(
            &json!({ "key": "APP_URL", "value": "https://example.com", "is_secret": false }),
        );
        assert_eq!(n, 0);
        assert_eq!(out["value"], "https://example.com");
    }
}
