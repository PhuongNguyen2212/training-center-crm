// Tauri application entry point + production data layer wiring.
//
// On startup we connect to the shared Turso (libSQL) database over HTTP
// (online-only), apply the schema, seed demo data on first run, and register the
// command layer. All domain access goes through Tauri commands that re-check the
// session's role server-side (see commands/ and auth.rs).

#[macro_use]
mod secrets;
mod auth;
mod commands;
mod db;
mod dump;
mod error;
mod gcal;
mod models;
mod ratelimit;
mod seed;
mod server;
mod storage;
mod util;

pub use server::serve;

// ---- Facade for the `backup` binary (modules stay private) ----

/// Open the shared Turso database (applies schema/migrations like the server).
pub async fn backup_db_open(url: &str, token: &str) -> error::AppResult<db::Db> {
    db::open(url, token).await
}

/// Dump every table as replayable INSERT statements.
pub async fn backup_dump(db: &db::Db) -> error::AppResult<String> {
    dump::dump_all(&db.conn).await
}

/// Upload a backup file to R2 (reads R2_* from the environment).
pub async fn backup_upload(key: &str, bytes: &[u8]) -> error::AppResult<()> {
    let r2 = storage::R2::from_env()?;
    storage::put(&r2, key, bytes, "application/sql").await
}

/// Test-only public surface for DB-backed integration tests (see `tests/`).
/// Gated on `db-tests` because it relies on the in-memory libSQL backend, which
/// needs the C/`core` build (CI only). Not compiled into production binaries.
#[cfg(feature = "db-tests")]
pub mod testkit {
    pub use crate::auth::{current_user, AuthUser, LoginGuard, Sessions};
    pub use crate::commands::attendance::{list_attendance_impl, mark_attendance_impl};
    pub use crate::commands::auth::{change_own_password_impl, login_impl, me_impl};
    pub use crate::commands::students::{list_students_impl, soft_delete_student_impl};
    pub use crate::db::{open_memory, Db};
    pub use crate::error::{AppError, AppResult};
    pub use crate::models::LoginResponse;
    pub use crate::seed::seed_if_empty;
    pub use crate::server::test_router;

    /// An empty in-memory session table (token -> user_id).
    pub fn empty_sessions() -> Sessions {
        Sessions(parking_lot::Mutex::new(std::collections::HashMap::new()))
    }

    /// An empty brute-force login guard.
    pub fn empty_guard() -> LoginGuard {
        LoginGuard(parking_lot::Mutex::new(std::collections::HashMap::new()))
    }
}

// ---- Desktop app (Tauri). Compiled only with the `desktop` feature so the
// headless `server` binary can build without Tauri/webkit. ----

#[cfg(feature = "desktop")]
use auth::{LoginGuard, Sessions};
#[cfg(feature = "desktop")]
use gcal::GCal;
#[cfg(feature = "desktop")]
use parking_lot::Mutex;
#[cfg(feature = "desktop")]
use std::collections::HashMap;
#[cfg(feature = "desktop")]
use storage::R2;
#[cfg(feature = "desktop")]
use tauri::Manager;

#[cfg(feature = "desktop")]
#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(feature = "desktop")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load .env in development (no-op in production where secrets come from the
    // environment / OS keychain).
    dotenvy::dotenv().ok();

    // libSQL's call chain is stack-heavy; give tokio worker threads a 32MB stack
    // (the main thread is covered by the /STACK linker arg in .cargo/config.toml).
    let rt = tokio::runtime::Builder::new_multi_thread()
        .thread_stack_size(32 * 1024 * 1024)
        .enable_all()
        .build()
        .expect("không khởi tạo được tokio runtime");
    tauri::async_runtime::set(rt.handle().clone());
    std::mem::forget(rt); // keep the runtime alive for the app's lifetime

    tauri::Builder::default()
        .setup(|app| {
            let url = secret!("TURSO_DATABASE_URL")
                .expect("thiếu TURSO_DATABASE_URL (.env khi dev, hoặc nhúng lúc build)");
            let token = secret!("TURSO_AUTH_TOKEN").expect("thiếu TURSO_AUTH_TOKEN");

            let database = tauri::async_runtime::block_on(async {
                let database = db::open(&url, &token).await?;
                seed::seed_if_empty(&database.conn).await?;
                Ok::<_, error::AppError>(database)
            })
            .expect("kết nối/khởi tạo Turso thất bại");

            let r2 = R2::from_env().expect("khởi tạo R2 (lưu trữ tệp) thất bại");
            let gcal = GCal::from_env(); // optional; no-op if not configured

            app.manage(database);
            app.manage(Sessions(Mutex::new(HashMap::new())));
            app.manage(LoginGuard(Mutex::new(HashMap::new())));
            app.manage(r2);
            app.manage(gcal);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_version,
            commands::auth::login,
            commands::auth::logout,
            commands::auth::me,
            commands::auth::change_own_password,
            commands::students::list_students,
            commands::students::create_student,
            commands::students::update_student,
            commands::students::soft_delete_student,
            commands::staff::list_users,
            commands::staff::create_staff,
            commands::staff::set_user_status,
            commands::staff::update_user_role,
            commands::staff::reset_user_password,
            commands::audit::list_audit,
            commands::audit::list_class_notifications,
            commands::classes::list_classes,
            commands::classes::create_class,
            commands::classes::update_class,
            commands::classes::set_class_status,
            commands::classes::enroll_student,
            commands::classes::unenroll_student,
            commands::classes::delete_class,
            commands::sessions::list_sessions,
            commands::sessions::create_session,
            commands::sessions::update_session,
            commands::sessions::delete_session,
            commands::sessions::upsert_sessions_from_google,
            commands::attendance::list_attendance,
            commands::attendance::mark_attendance,
            commands::attendance::list_homework,
            commands::attendance::set_homework,
            commands::payments::list_payment_docs,
            commands::payments::create_payment_doc,
            commands::payments::read_payment_doc,
            commands::payments::soft_delete_payment_doc,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
