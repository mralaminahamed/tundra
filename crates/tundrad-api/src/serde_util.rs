use serde::{Deserialize, Deserializer};
use time::format_description::well_known::Rfc3339;

/// Deserializes `Option<Option<T>>` so that:
///   - key absent  → `None`          (field not supplied, leave as-is)
///   - key = null  → `Some(None)`    (explicit clear)
///   - key = value → `Some(Some(v))` (update to value)
pub fn option_option<'de, T, D>(de: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Ok(Some(Option::deserialize(de)?))
}

/// Format a `time::OffsetDateTime` as an RFC 3339 string (ISO 8601).
/// Falls back to the debug representation on format error (should never happen).
pub fn fmt_dt(dt: time::OffsetDateTime) -> String {
    dt.format(&Rfc3339).unwrap_or_else(|_| dt.to_string())
}

/// Format an optional `time::OffsetDateTime` as an RFC 3339 string.
pub fn fmt_dt_opt(dt: Option<time::OffsetDateTime>) -> Option<String> {
    dt.map(fmt_dt)
}

/// Convert a Unix timestamp (seconds) to an RFC 3339 string.
/// Returns `None` if the timestamp is out of range.
pub fn fmt_unix_ts(secs: i64) -> Option<String> {
    time::OffsetDateTime::from_unix_timestamp(secs)
        .ok()
        .and_then(|dt| dt.format(&Rfc3339).ok())
}
