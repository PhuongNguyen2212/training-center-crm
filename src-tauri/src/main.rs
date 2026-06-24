// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// The default binary is the Tauri desktop app; it only runs with the `desktop`
// feature. The headless HTTP server is `--bin server` instead.
fn main() {
    #[cfg(feature = "desktop")]
    app_lib::run();
}
