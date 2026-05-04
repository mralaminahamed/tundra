#![no_main]
use libfuzzer_sys::fuzz_target;
use tundrad_api::audit_redact::redact;

fuzz_target!(|data: &[u8]| {
    // Try to parse the input as JSON and run it through the redaction pipeline.
    // Should never panic — if it's not valid JSON, return early.
    if let Ok(s) = std::str::from_utf8(data) {
        if let Ok(val) = serde_json::from_str(s) {
            let (_, _) = redact(&val);
        }
    }
});
