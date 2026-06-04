use crate::auth::{current_user, require_role, write_audit, Sessions};
use crate::db::Db;
use crate::error::AppResult;
use crate::models::{Attendance, Homework};
use crate::util::{new_id, now_iso};
use rusqlite::{params, OptionalExtension};
use tauri::State;

#[tauri::command]
pub fn list_attendance(
    token: String,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<Vec<Attendance>> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin", "teacher"])?;
    let conn = db.0.lock();
    let mut stmt = conn.prepare(
        "SELECT id,student_id,session_id,status,marked_by,marked_at,is_override FROM attendance ORDER BY marked_at",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Attendance {
                id: r.get(0)?,
                student_id: r.get(1)?,
                session_id: r.get(2)?,
                status: r.get(3)?,
                marked_by: r.get(4)?,
                marked_at: r.get(5)?,
                is_override: r.get::<_, i64>(6)? != 0,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// Append-only: if a record already exists for (student, session), insert a new
/// override row instead of editing the original (attendance = legal proof).
#[tauri::command]
pub fn mark_attendance(
    token: String,
    student_id: String,
    session_id: String,
    status: String,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<Attendance> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin", "teacher"])?;
    let conn = db.0.lock();

    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM attendance WHERE student_id=?1 AND session_id=?2 LIMIT 1",
            params![student_id, session_id],
            |r| r.get(0),
        )
        .optional()?;
    let is_override = existing.is_some();

    let id = new_id();
    let now = now_iso();
    conn.execute(
        "INSERT INTO attendance (id,student_id,session_id,status,marked_by,marked_at,is_override,created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?6)",
        params![id, student_id, session_id, status, user.id, now, is_override as i64],
    )?;
    write_audit(
        &conn,
        &user.id,
        if is_override { "attendance.override" } else { "attendance.mark" },
        &format!("Điểm danh {status}{}", if is_override { " (ghi đè)" } else { "" }),
    )?;
    Ok(Attendance {
        id,
        student_id,
        session_id,
        status,
        marked_by: user.id,
        marked_at: now,
        is_override,
    })
}

#[tauri::command]
pub fn list_homework(
    token: String,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<Vec<Homework>> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin", "teacher"])?;
    let conn = db.0.lock();
    let mut stmt = conn
        .prepare("SELECT id,student_id,session_id,status,recorded_by FROM homework")?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Homework {
                id: r.get(0)?,
                student_id: r.get(1)?,
                session_id: r.get(2)?,
                status: r.get(3)?,
                recorded_by: r.get(4)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// Upsert homework status per (student, session).
#[tauri::command]
pub fn set_homework(
    token: String,
    student_id: String,
    session_id: String,
    status: String,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<Homework> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin", "teacher"])?;
    let conn = db.0.lock();
    let now = now_iso();
    conn.execute(
        "INSERT INTO homework (id,student_id,session_id,status,recorded_by,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?6)
         ON CONFLICT(student_id,session_id)
         DO UPDATE SET status=excluded.status, recorded_by=excluded.recorded_by, updated_at=excluded.updated_at",
        params![new_id(), student_id, session_id, status, user.id, now],
    )?;
    let (id, recorded_by): (String, String) = conn.query_row(
        "SELECT id,recorded_by FROM homework WHERE student_id=?1 AND session_id=?2",
        params![student_id, session_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    Ok(Homework { id, student_id, session_id, status, recorded_by })
}
