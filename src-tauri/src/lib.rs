// Tauri application entry point + production data layer wiring.
//
// On startup we open/create the SQLite DB in the OS app-data dir, run the
// schema migration, seed demo data on first run, and register the command
// layer. All domain access goes through Tauri commands that re-check the
// session's role server-side (see commands/ and auth.rs).

mod auth;
mod commands;
mod db;
mod error;
mod models;
mod seed;
mod util;

use auth::{LoginGuard, Sessions};
use db::Db;
use parking_lot::Mutex;
use std::collections::HashMap;
use tauri::Manager;

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app
                .path()
                .app_data_dir()
                .expect("không lấy được thư mục app data");
            std::fs::create_dir_all(&dir).ok();
            let db_path = dir.join("crm.db");

            let conn = db::init(&db_path).expect("khởi tạo cơ sở dữ liệu thất bại");
            seed::seed_if_empty(&conn).expect("seed dữ liệu thất bại");

            app.manage(Db(Mutex::new(conn)));
            app.manage(Sessions(Mutex::new(HashMap::new())));
            app.manage(LoginGuard(Mutex::new(HashMap::new())));
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
            commands::classes::list_classes,
            commands::classes::create_class,
            commands::classes::update_class,
            commands::classes::set_class_status,
            commands::classes::enroll_student,
            commands::classes::unenroll_student,
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
            commands::payments::soft_delete_payment_doc,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
