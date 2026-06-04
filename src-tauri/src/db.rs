use parking_lot::Mutex;
use rusqlite::Connection;
use std::path::Path;

/// Managed Tauri state wrapping the single SQLite connection.
pub struct Db(pub Mutex<Connection>);

/// Open (or create) the SQLite database and apply the schema migration.
/// The schema uses `IF NOT EXISTS`, so re-running on an existing DB is safe.
pub fn init(db_path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")?;
    conn.execute_batch(include_str!("../migrations/0001_init.sql"))?;
    Ok(conn)
}

/// In-memory database with schema + seed, for unit tests.
#[cfg(test)]
pub fn init_memory() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
    conn.execute_batch(include_str!("../migrations/0001_init.sql")).unwrap();
    crate::seed::seed_if_empty(&conn).unwrap();
    conn
}
