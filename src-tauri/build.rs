use std::collections::HashMap;
use std::fs;

fn main() {
    embed_secrets();
    // tauri_build is only needed for the desktop app; the headless server build
    // (--no-default-features) skips it (and the frontend/webkit requirements).
    if std::env::var_os("CARGO_FEATURE_DESKTOP").is_some() {
        tauri_build::build();
    }
}

/// Bake secrets from the project-root `.env` into the binary at build time so
/// the distributed `.exe` runs without a `.env` on the user's machine. The
/// `secret!` macro prefers the runtime env (dev) and falls back to these.
fn embed_secrets() {
    println!("cargo:rerun-if-changed=../.env");
    let raw = fs::read_to_string("../.env").unwrap_or_default();
    let mut map = HashMap::new();
    for line in raw.lines() {
        let l = line.trim();
        if l.is_empty() || l.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = l.split_once('=') {
            map.insert(k.trim().to_string(), v.trim().to_string());
        }
    }

    // Single-line secrets → embed directly.
    for k in [
        "TURSO_DATABASE_URL",
        "TURSO_AUTH_TOKEN",
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET",
        "R2_ENDPOINT",
        "GOOGLE_CALENDAR_ID",
    ] {
        if let Some(v) = map.get(k) {
            if !v.is_empty() {
                println!("cargo:rustc-env={k}={v}");
            }
        }
    }

    // Google service-account key file → embed its content as base64 (the JSON is
    // multi-line, which cargo:rustc-env can't carry directly).
    if let Some(path) = map.get("GOOGLE_SERVICE_ACCOUNT_FILE") {
        let rel = path.trim_start_matches("./");
        let rel = rel.strip_prefix("../").unwrap_or(rel);
        for cand in [format!("../{rel}"), rel.to_string()] {
            println!("cargo:rerun-if-changed={cand}");
            if let Ok(content) = fs::read(&cand) {
                use base64::Engine;
                let b64 = base64::engine::general_purpose::STANDARD.encode(content);
                println!("cargo:rustc-env=GOOGLE_SERVICE_ACCOUNT_B64={b64}");
                break;
            }
        }
    }
}
