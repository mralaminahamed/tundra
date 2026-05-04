pub fn redact_arguments(args: &serde_json::Value) -> serde_json::Value {
    // Redact sensitive fields before logging
    let mut redacted = args.clone();
    if let Some(obj) = redacted.as_object_mut() {
        for key in &["password", "token", "secret", "private_key", "value"] {
            if obj.contains_key(*key) {
                obj.insert((*key).to_string(), serde_json::json!("<redacted>"));
            }
        }
    }
    redacted
}
