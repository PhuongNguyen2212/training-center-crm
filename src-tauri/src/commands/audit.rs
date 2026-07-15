use crate::auth::{current_user, Sessions};
use crate::db::{query_all, Db};
use crate::error::AppResult;
use crate::models::AuditLog;
use libsql::Row;
#[cfg(feature = "desktop")]
use tauri::State;

// Shared SELECT: join the actor's display name so the UI can show WHO did
// each activity (falls back to the raw id if the account was ever removed).
const COLS: &str = "a.id, a.user_id, COALESCE(u.name, a.user_id), a.action, a.detail, a.created_at";
const FROM: &str = "FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id";

fn map_audit(r: &Row) -> libsql::Result<AuditLog> {
    Ok(AuditLog {
        id: r.get(0)?,
        user_id: r.get(1)?,
        user_name: r.get(2)?,
        action: r.get(3)?,
        detail: r.get(4)?,
        created_at: r.get(5)?,
    })
}

// ---- Transport-agnostic logic ----

/// Class-activity notifications (enroll/unenroll/create/delete/...). Broadcast to
/// EVERY logged-in user — unscoped, unlike the personal audit log.
pub async fn list_class_notifications_impl(
    token: &str,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<Vec<AuditLog>> {
    current_user(db, sessions, token).await?; // any authenticated user
    query_all(
        &db.conn,
        &format!("SELECT {COLS} {FROM} WHERE a.action LIKE 'class.%' ORDER BY a.created_at DESC LIMIT 50"),
        (),
        map_audit,
    )
    .await
}

pub async fn list_audit_impl(
    token: &str,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<Vec<AuditLog>> {
    let user = current_user(db, sessions, token).await?;
    // Everyone may view their OWN activity; only admin sees everyone's.
    if user.role == "admin" {
        query_all(
            &db.conn,
            &format!("SELECT {COLS} {FROM} ORDER BY a.created_at DESC LIMIT 200"),
            (),
            map_audit,
        )
        .await
    } else {
        query_all(
            &db.conn,
            &format!(
                "SELECT {COLS} {FROM} WHERE a.user_id = ?1 ORDER BY a.created_at DESC LIMIT 200"
            ),
            libsql::params![user.id.clone()],
            map_audit,
        )
        .await
    }
}

// ---- Tauri command wrappers ----

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn list_class_notifications(
    token: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<Vec<AuditLog>> {
    list_class_notifications_impl(&token, &db, &sessions).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn list_audit(
    token: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<Vec<AuditLog>> {
    list_audit_impl(&token, &db, &sessions).await
}
