use crate::auth::{current_user, require_role, Sessions};
use crate::db::Db;
use crate::error::AppResult;
use crate::models::AuditLog;
use tauri::State;

#[tauri::command]
pub fn list_audit(
    token: String,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<Vec<AuditLog>> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin"])?;
    let conn = db.0.lock();
    let mut stmt = conn.prepare(
        "SELECT id,user_id,action,detail,created_at FROM audit_logs ORDER BY created_at DESC LIMIT 200",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(AuditLog {
                id: r.get(0)?,
                user_id: r.get(1)?,
                action: r.get(2)?,
                detail: r.get(3)?,
                created_at: r.get(4)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}
