// Tauri command layer — one module per feature domain (CLAUDE.md standard).
//
// Every protected command:
//   1. resolves the session token -> user, re-reading role/status from the DB,
//   2. enforces the role permission matrix (require_capability),
//   3. writes an audit-log row for meaningful actions.
// The frontend's role/userId are never trusted.

pub mod attendance;
pub mod audit;
pub mod auth;
#[cfg(feature = "desktop")]
pub mod backup;
pub mod classes;
pub mod payments;
pub mod sessions;
pub mod staff;
pub mod students;
