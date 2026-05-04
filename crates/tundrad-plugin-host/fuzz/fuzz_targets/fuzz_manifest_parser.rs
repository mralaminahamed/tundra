#![no_main]
use libfuzzer_sys::fuzz_target;
use tundrad_plugin_host::manifest::parse_manifest;

fuzz_target!(|data: &[u8]| {
    // Try to parse arbitrary bytes as a plugin manifest TOML.
    // Should never panic — errors are expected and returned as Err.
    let _ = parse_manifest(data);
});
