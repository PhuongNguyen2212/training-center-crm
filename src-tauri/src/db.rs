use crate::error::{AppError, AppResult};
use libsql::{Builder, Connection, Database, Row};
use std::sync::Arc;

/// Managed state wrapping the libSQL (Turso) database.
///
/// A *remote* libSQL `Connection` is not a plain handle: it is a stateful
/// Hrana-over-HTTP stream, where every response hands back a new baton and
/// invalidates the previous one. Sharing a single connection across concurrent
/// requests therefore races and fails with `generation mismatch: N != M`, and
/// one left idle long enough gets reaped server-side. So request handlers call
/// [`Db::fresh`] to get a stream of their own; dropping it makes libSQL close
/// that stream on Turso automatically.
#[derive(Clone)]
pub struct Db {
    pub conn: Connection,
    db: Arc<Database>,
    /// Remote streams are per-request. A local `:memory:` database is the exact
    /// opposite — each `connect()` opens a *separate, empty* database — so the
    /// test path has to keep reusing the one connection it opened.
    remote: bool,
}

impl Db {
    /// A handle for one request, carrying its own Hrana stream.
    pub fn fresh(&self) -> Db {
        if !self.remote {
            return self.clone();
        }
        match self.db.connect() {
            Ok(conn) => Db {
                conn,
                db: Arc::clone(&self.db),
                remote: true,
            },
            Err(e) => {
                // The remote backend only builds a struct here, so this is
                // unreachable in practice; degrade instead of failing the
                // request, but make the log loud if it ever does happen.
                tracing::error!("không mở được stream Turso mới: {e}");
                self.clone()
            }
        }
    }
}

/// Open a remote Turso connection (online-only) and apply the schema. The
/// schema uses `IF NOT EXISTS`, so applying it on every startup is safe; on the
/// shared Turso DB it only matters on first run.
pub async fn open(url: &str, token: &str) -> AppResult<Db> {
    let database = Builder::new_remote(url.to_string(), token.to_string())
        .build()
        .await
        .map_err(|e| AppError::new(format!("Không kết nối được Turso: {e}")))?;
    let conn = database
        .connect()
        .map_err(|e| AppError::new(format!("Không mở được kết nối Turso: {e}")))?;
    conn.execute_batch(include_str!("../migrations/0001_init.sql"))
        .await
        .map_err(|e| AppError::new(format!("Áp dụng schema thất bại: {e}")))?;
    migrate(&conn).await?;
    Ok(Db {
        conn,
        db: Arc::new(database),
        remote: true,
    })
}

/// Additive migrations for databases created before a column existed. SQLite's
/// ALTER TABLE ADD COLUMN errors when the column is already there — that error
/// is the "already migrated" signal and is safely ignored.
async fn migrate(conn: &Connection) -> AppResult<()> {
    let added = conn
        .execute(
            "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0",
            (),
        )
        .await
        .is_ok();
    if added {
        // One-time backfill: the seeded admin still carries the published
        // default password — force a change at next login.
        conn.execute(
            "UPDATE users SET must_change_password = 1 WHERE id = 'u-admin'",
            (),
        )
        .await?;
    }
    Ok(())
}

/// Open an **in-memory** libSQL database with the schema applied — for tests
/// only. Requires the `db-tests` feature (libSQL's local `core` backend), so it
/// is excluded from the default pure-Rust/remote build.
#[cfg(feature = "db-tests")]
pub async fn open_memory() -> AppResult<Db> {
    let database = Builder::new_local(":memory:")
        .build()
        .await
        .map_err(|e| AppError::new(format!("Không mở được DB in-memory: {e}")))?;
    let conn = database
        .connect()
        .map_err(|e| AppError::new(format!("Không mở được kết nối: {e}")))?;
    conn.execute_batch(include_str!("../migrations/0001_init.sql"))
        .await
        .map_err(|e| AppError::new(format!("Áp dụng schema thất bại: {e}")))?;
    // `remote: false` — a second `connect()` to `:memory:` would be a brand new
    // empty database, so `fresh()` must hand back this same connection.
    Ok(Db {
        conn,
        db: Arc::new(database),
        remote: false,
    })
}

/// Query and map the first row, or `None` if there are no rows.
pub async fn query_opt<T>(
    conn: &Connection,
    sql: &str,
    params: impl libsql::params::IntoParams,
    map: impl Fn(&Row) -> libsql::Result<T>,
) -> AppResult<Option<T>> {
    let mut rows = conn.query(sql, params).await?;
    match rows.next().await? {
        Some(r) => Ok(Some(map(&r)?)),
        None => Ok(None),
    }
}

/// Query and map all rows into a Vec.
pub async fn query_all<T>(
    conn: &Connection,
    sql: &str,
    params: impl libsql::params::IntoParams,
    map: impl Fn(&Row) -> libsql::Result<T>,
) -> AppResult<Vec<T>> {
    let mut rows = conn.query(sql, params).await?;
    let mut out = Vec::new();
    while let Some(r) = rows.next().await? {
        out.push(map(&r)?);
    }
    Ok(out)
}
