use crate::auth::{current_user, require_role, write_audit, Sessions};
use crate::db::Db;
use crate::error::AppResult;
use crate::models::{Session, SessionInput};
use crate::util::{new_id, now_iso};
use rusqlite::{params, OptionalExtension, Row};
use tauri::State;

const COLS: &str = "id,google_event_id,title,start_time,end_time,teacher_id,class_id";

fn map_session(r: &Row) -> rusqlite::Result<Session> {
    Ok(Session {
        id: r.get(0)?,
        google_event_id: r.get(1)?,
        title: r.get(2)?,
        start_time: r.get(3)?,
        end_time: r.get(4)?,
        teacher_id: r.get(5)?,
        class_id: r.get(6)?,
    })
}

#[tauri::command]
pub fn list_sessions(
    token: String,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<Vec<Session>> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin", "teacher"])?;
    let conn = db.0.lock();
    if user.role == "teacher" {
        let mut stmt = conn.prepare(&format!(
            "SELECT {COLS} FROM sessions WHERE teacher_id = ?1 ORDER BY start_time"
        ))?;
        let rows = stmt
            .query_map([&user.id], map_session)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    } else {
        let mut stmt = conn.prepare(&format!("SELECT {COLS} FROM sessions ORDER BY start_time"))?;
        let rows = stmt
            .query_map([], map_session)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }
}

#[tauri::command]
pub fn create_session(
    token: String,
    input: SessionInput,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<Session> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin"])?;
    let id = new_id();
    let now = now_iso();
    let conn = db.0.lock();
    conn.execute(
        "INSERT INTO sessions (id,google_event_id,title,start_time,end_time,teacher_id,class_id,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)",
        params![id, input.google_event_id, input.title, input.start_time, input.end_time, input.teacher_id, input.class_id, now],
    )?;
    write_audit(&conn, &user.id, "schedule.create", &format!("Tạo buổi học {}", input.title))?;
    conn.query_row(&format!("SELECT {COLS} FROM sessions WHERE id=?1"), [&id], map_session)
        .map_err(Into::into)
}

#[tauri::command]
pub fn update_session(
    token: String,
    id: String,
    input: SessionInput,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<Session> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin"])?;
    let conn = db.0.lock();
    conn.execute(
        "UPDATE sessions SET title=?2,start_time=?3,end_time=?4,teacher_id=?5,class_id=?6,updated_at=?7 WHERE id=?1",
        params![id, input.title, input.start_time, input.end_time, input.teacher_id, input.class_id, now_iso()],
    )?;
    write_audit(&conn, &user.id, "schedule.edit", &format!("Sửa buổi học {id}"))?;
    conn.query_row(&format!("SELECT {COLS} FROM sessions WHERE id=?1"), [&id], map_session)
        .map_err(Into::into)
}

#[tauri::command]
pub fn delete_session(
    token: String,
    id: String,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<()> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin"])?;
    let conn = db.0.lock();
    conn.execute("DELETE FROM sessions WHERE id=?1", [&id])?;
    write_audit(&conn, &user.id, "schedule.delete", &format!("Xóa buổi học {id}"))?;
    Ok(())
}

/// Upsert events pulled from Google Calendar, keyed by google_event_id.
/// Keeps existing sessions; updates matches; inserts new ones (no deletion).
#[tauri::command]
pub fn upsert_sessions_from_google(
    token: String,
    incoming: Vec<SessionInput>,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<Vec<Session>> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin"])?;
    let conn = db.0.lock();
    for ev in &incoming {
        let Some(gid) = &ev.google_event_id else { continue };
        let existing: Option<String> = conn
            .query_row("SELECT id FROM sessions WHERE google_event_id=?1", [gid], |r| r.get(0))
            .optional()?;
        if let Some(id) = existing {
            conn.execute(
                "UPDATE sessions SET title=?2,start_time=?3,end_time=?4,teacher_id=?5,class_id=?6,updated_at=?7 WHERE id=?1",
                params![id, ev.title, ev.start_time, ev.end_time, ev.teacher_id, ev.class_id, now_iso()],
            )?;
        } else {
            let now = now_iso();
            conn.execute(
                "INSERT INTO sessions (id,google_event_id,title,start_time,end_time,teacher_id,class_id,created_at,updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)",
                params![new_id(), gid, ev.title, ev.start_time, ev.end_time, ev.teacher_id, ev.class_id, now],
            )?;
        }
    }
    write_audit(&conn, &user.id, "schedule.sync", &format!("Đồng bộ {} buổi từ Google", incoming.len()))?;
    let mut stmt = conn.prepare(&format!("SELECT {COLS} FROM sessions ORDER BY start_time"))?;
    let rows = stmt.query_map([], map_session)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}
