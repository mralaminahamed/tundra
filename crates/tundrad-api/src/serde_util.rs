use serde::{Deserialize, Deserializer};

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
