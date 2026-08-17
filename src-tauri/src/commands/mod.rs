// Tauri command layer — one module per feature domain (CLAUDE.md standard).
//
// Every protected command:
//   1. resolves the session token -> user, re-reading role/status from the DB,
//   2. enforces the role permission matrix (require_capability),
//   3. writes an audit-log row for meaningful actions.
// The frontend's role/userId are never trusted.
//
// Every command wrapper passes `&db.fresh()` — never the managed `State<Db>`
// itself. A remote libSQL connection is a single Hrana stream; two invokes
// sharing one stream (the frontend fires several at once on every page load)
// desynchronise its baton and Turso answers
// `stream not found: generation mismatch`. See `db::Db::fresh`.

pub mod attendance;
pub mod audit;
pub mod auth;
pub mod classes;
pub mod payments;
pub mod sessions;
pub mod staff;
pub mod students;
