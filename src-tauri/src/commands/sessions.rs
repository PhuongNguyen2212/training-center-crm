use crate::auth::{current_user, require_capability, write_audit, AuthUser, Capability, Sessions};
use crate::db::{query_all, query_opt, Db};
use crate::error::{AppError, AppResult};
use crate::gcal::GCal;
use crate::models::{Session, SessionInput};
use crate::util::{new_id, now_iso};
use libsql::{Connection, Row};
use std::collections::HashMap;
#[cfg(feature = "desktop")]
use tauri::State;

async fn google_event_id(conn: &Connection, id: &str) -> AppResult<Option<String>> {
    Ok(query_opt(
        conn,
        "SELECT google_event_id FROM sessions WHERE id=?1",
        libsql::params![id.to_string()],
        |r| r.get::<Option<String>>(0),
    )
    .await?
    .flatten())
}

const COLS: &str = "id,google_event_id,title,start_time,end_time,teacher_id";

fn map_session(r: &Row) -> libsql::Result<Session> {
    Ok(Session {
        id: r.get(0)?,
        google_event_id: r.get(1)?,
        title: r.get(2)?,
        start_time: r.get(3)?,
        end_time: r.get(4)?,
        teacher_id: r.get(5)?,
        student_ids: Vec::new(), // filled by with_rosters / one_session
    })
}

/// Fill each session's roster with one query (not one per session).
async fn with_rosters(conn: &Connection, mut list: Vec<Session>) -> AppResult<Vec<Session>> {
    let rows = query_all(
        conn,
        "SELECT session_id, student_id FROM session_students ORDER BY added_at",
        (),
        |r| Ok((r.get::<String>(0)?, r.get::<String>(1)?)),
    )
    .await?;
    let mut by_session: HashMap<String, Vec<String>> = HashMap::new();
    for (sid, stid) in rows {
        by_session.entry(sid).or_default().push(stid);
    }
    for s in &mut list {
        s.student_ids = by_session.remove(&s.id).unwrap_or_default();
    }
    Ok(list)
}

async fn one_session(conn: &Connection, id: &str) -> AppResult<Session> {
    let mut session = query_opt(
        conn,
        &format!("SELECT {COLS} FROM sessions WHERE id=?1"),
        libsql::params![id.to_string()],
        map_session,
    )
    .await?
    .ok_or_else(|| AppError::new("Không tìm thấy buổi học."))?;
    session.student_ids = query_all(
        conn,
        "SELECT student_id FROM session_students WHERE session_id=?1 ORDER BY added_at",
        libsql::params![id.to_string()],
        |r| r.get::<String>(0),
    )
    .await?;
    Ok(session)
}

/// A teacher may only touch their OWN sessions (admin: any). Callers gate the
/// role itself with a capability first.
pub(crate) async fn ensure_session_access(
    conn: &Connection,
    user: &AuthUser,
    session_id: &str,
) -> AppResult<()> {
    let owner: Option<String> = query_opt(
        conn,
        "SELECT teacher_id FROM sessions WHERE id=?1",
        libsql::params![session_id.to_string()],
        |r| r.get::<Option<String>>(0),
    )
    .await?
    .ok_or_else(|| AppError::new("Không tìm thấy buổi học."))?;
    if user.is_teacher() && owner.as_deref() != Some(user.id.as_str()) {
        return Err(AppError::new(
            "Bạn chỉ thao tác được trên buổi học của mình.",
        ));
    }
    Ok(())
}

async fn session_title(conn: &Connection, id: &str) -> String {
    query_opt(
        conn,
        "SELECT title FROM sessions WHERE id=?1",
        libsql::params![id.to_string()],
        |r| r.get::<String>(0),
    )
    .await
    .ok()
    .flatten()
    .unwrap_or_else(|| id.to_string())
}

// ---- Transport-agnostic logic ----

pub async fn list_sessions_impl(
    token: &str,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<Vec<Session>> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::ScheduleView)?;
    let list = if user.is_teacher() {
        query_all(
            &db.conn,
            &format!("SELECT {COLS} FROM sessions WHERE teacher_id = ?1 ORDER BY start_time"),
            libsql::params![user.id.clone()],
            map_session,
        )
        .await?
    } else {
        query_all(
            &db.conn,
            &format!("SELECT {COLS} FROM sessions ORDER BY start_time"),
            (),
            map_session,
        )
        .await?
    };
    with_rosters(&db.conn, list).await
}

pub async fn create_session_impl(
    token: &str,
    input: SessionInput,
    db: &Db,
    sessions: &Sessions,
    gcal: &GCal,
) -> AppResult<Session> {
    let user = current_user(db, sessions, token).await?;
    let teacher_id = match user.role.as_str() {
        "admin" => input.teacher_id.clone(),
        "teacher" => Some(user.id.clone()),
        _ => return Err(AppError::new("Bạn không có quyền tạo buổi học.")),
    };
    let id = new_id();
    let now = now_iso();
    db.conn
        .execute(
            "INSERT INTO sessions (id,google_event_id,title,start_time,end_time,teacher_id,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?7)",
            libsql::params![id.clone(), input.google_event_id.clone(), input.title.clone(), input.start_time.clone(), input.end_time.clone(), teacher_id, now],
        )
        .await?;
    write_audit(
        &db.conn,
        &user.id,
        "schedule.create",
        &format!("Tạo buổi học {}", input.title),
    )
    .await?;
    if let Ok(Some(eid)) = gcal
        .insert_event(&input.title, &input.start_time, &input.end_time)
        .await
    {
        let _ = db
            .conn
            .execute(
                "UPDATE sessions SET google_event_id=?2 WHERE id=?1",
                libsql::params![id.clone(), eid],
            )
            .await;
    }
    one_session(&db.conn, &id).await
}

pub async fn update_session_impl(
    token: &str,
    id: String,
    input: SessionInput,
    db: &Db,
    sessions: &Sessions,
    gcal: &GCal,
) -> AppResult<Session> {
    let user = current_user(db, sessions, token).await?;
    let teacher_id = if user.is_admin() {
        input.teacher_id.clone()
    } else if user.is_teacher() {
        let owner: Option<String> = query_opt(
            &db.conn,
            "SELECT teacher_id FROM sessions WHERE id=?1",
            libsql::params![id.clone()],
            |r| r.get::<Option<String>>(0),
        )
        .await?
        .ok_or_else(|| AppError::new("Không tìm thấy buổi học."))?;
        if owner.as_deref() != Some(user.id.as_str()) {
            return Err(AppError::new("Bạn chỉ sửa được buổi học của mình."));
        }
        Some(user.id.clone())
    } else {
        return Err(AppError::new("Bạn không có quyền sửa buổi học."));
    };
    db.conn
        .execute(
            "UPDATE sessions SET title=?2,start_time=?3,end_time=?4,teacher_id=?5,updated_at=?6 WHERE id=?1",
            libsql::params![id.clone(), input.title.clone(), input.start_time.clone(), input.end_time.clone(), teacher_id, now_iso()],
        )
        .await?;
    write_audit(
        &db.conn,
        &user.id,
        "schedule.edit",
        &format!("Sửa buổi học {id}"),
    )
    .await?;
    match google_event_id(&db.conn, &id).await? {
        Some(eid) => {
            let _ = gcal
                .update_event(&eid, &input.title, &input.start_time, &input.end_time)
                .await;
        }
        None => {
            if let Ok(Some(eid)) = gcal
                .insert_event(&input.title, &input.start_time, &input.end_time)
                .await
            {
                let _ = db
                    .conn
                    .execute(
                        "UPDATE sessions SET google_event_id=?2 WHERE id=?1",
                        libsql::params![id.clone(), eid],
                    )
                    .await;
            }
        }
    }
    one_session(&db.conn, &id).await
}

pub async fn delete_session_impl(
    token: &str,
    id: String,
    db: &Db,
    sessions: &Sessions,
    gcal: &GCal,
) -> AppResult<()> {
    let user = current_user(db, sessions, token).await?;
    if user.is_teacher() {
        let owner: Option<String> = query_opt(
            &db.conn,
            "SELECT teacher_id FROM sessions WHERE id=?1",
            libsql::params![id.clone()],
            |r| r.get::<Option<String>>(0),
        )
        .await?
        .ok_or_else(|| AppError::new("Không tìm thấy buổi học."))?;
        if owner.as_deref() != Some(user.id.as_str()) {
            return Err(AppError::new("Bạn chỉ xóa được buổi học của mình."));
        }
    } else if !user.is_admin() {
        return Err(AppError::new("Bạn không có quyền xóa buổi học."));
    }
    let eid = google_event_id(&db.conn, &id).await?;
    db.conn
        .execute(
            "DELETE FROM session_students WHERE session_id=?1",
            libsql::params![id.clone()],
        )
        .await?;
    db.conn
        .execute(
            "DELETE FROM sessions WHERE id=?1",
            libsql::params![id.clone()],
        )
        .await?;
    write_audit(
        &db.conn,
        &user.id,
        "schedule.delete",
        &format!("Xóa buổi học {id}"),
    )
    .await?;
    if let Some(eid) = eid {
        let _ = gcal.delete_event(&eid).await;
    }
    Ok(())
}

pub async fn upsert_sessions_from_google_impl(
    token: &str,
    incoming: Vec<SessionInput>,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<Vec<Session>> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::ScheduleEdit)?;
    for ev in &incoming {
        let Some(gid) = &ev.google_event_id else {
            continue;
        };
        let existing = query_opt(
            &db.conn,
            "SELECT id FROM sessions WHERE google_event_id=?1",
            libsql::params![gid.clone()],
            |r| r.get::<String>(0),
        )
        .await?;
        if let Some(id) = existing {
            db.conn
                .execute(
                    "UPDATE sessions SET title=?2,start_time=?3,end_time=?4,teacher_id=?5,updated_at=?6 WHERE id=?1",
                    libsql::params![id, ev.title.clone(), ev.start_time.clone(), ev.end_time.clone(), ev.teacher_id.clone(), now_iso()],
                )
                .await?;
        } else {
            let now = now_iso();
            db.conn
                .execute(
                    "INSERT INTO sessions (id,google_event_id,title,start_time,end_time,teacher_id,created_at,updated_at)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?7)",
                    libsql::params![new_id(), gid.clone(), ev.title.clone(), ev.start_time.clone(), ev.end_time.clone(), ev.teacher_id.clone(), now],
                )
                .await?;
        }
    }
    write_audit(
        &db.conn,
        &user.id,
        "schedule.sync",
        &format!("Đồng bộ {} buổi từ Google", incoming.len()),
    )
    .await?;
    let list = query_all(
        &db.conn,
        &format!("SELECT {COLS} FROM sessions ORDER BY start_time"),
        (),
        map_session,
    )
    .await?;
    with_rosters(&db.conn, list).await
}

/// Add students to a session's roster (one, or a list copied from another
/// session). Already-present students are skipped. Admin: any session;
/// teacher: own sessions only.
pub async fn add_session_students_impl(
    token: &str,
    session_id: String,
    student_ids: Vec<String>,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<Session> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::AttendanceMark)?;
    ensure_session_access(&db.conn, &user, &session_id).await?;
    let now = now_iso();
    let mut added = 0u64;
    for student_id in &student_ids {
        let exists = query_opt(
            &db.conn,
            "SELECT 1 FROM students WHERE id=?1 AND deleted_at IS NULL",
            libsql::params![student_id.clone()],
            |r| r.get::<i64>(0),
        )
        .await?
        .is_some();
        if !exists {
            return Err(AppError::new("Không tìm thấy học viên."));
        }
        added += db
            .conn
            .execute(
                "INSERT OR IGNORE INTO session_students (session_id,student_id,added_by,added_at)
                 VALUES (?1,?2,?3,?4)",
                libsql::params![
                    session_id.clone(),
                    student_id.clone(),
                    user.id.clone(),
                    now.clone()
                ],
            )
            .await?;
    }
    if added > 0 {
        let title = session_title(&db.conn, &session_id).await;
        let detail = if let [only] = student_ids.as_slice() {
            let name = query_opt(
                &db.conn,
                "SELECT name FROM students WHERE id=?1",
                libsql::params![only.clone()],
                |r| r.get::<String>(0),
            )
            .await?
            .unwrap_or_else(|| only.clone());
            format!("Thêm {name} vào buổi {title}")
        } else {
            format!("Thêm {added} học viên vào buổi {title}")
        };
        write_audit(&db.conn, &user.id, "roster.add", &detail).await?;
    }
    one_session(&db.conn, &session_id).await
}

/// Remove a student from a session's roster. Refused once the student has an
/// attendance record there — attendance is proof and must stay visible.
pub async fn remove_session_student_impl(
    token: &str,
    session_id: String,
    student_id: String,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<Session> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::AttendanceMark)?;
    ensure_session_access(&db.conn, &user, &session_id).await?;
    let marked = query_opt(
        &db.conn,
        "SELECT 1 FROM attendance WHERE session_id=?1 AND student_id=?2 LIMIT 1",
        libsql::params![session_id.clone(), student_id.clone()],
        |r| r.get::<i64>(0),
    )
    .await?
    .is_some();
    if marked {
        return Err(AppError::new(
            "Học viên đã được điểm danh ở buổi này nên không thể rút khỏi danh sách.",
        ));
    }
    let removed = db
        .conn
        .execute(
            "DELETE FROM session_students WHERE session_id=?1 AND student_id=?2",
            libsql::params![session_id.clone(), student_id.clone()],
        )
        .await?;
    if removed > 0 {
        let title = session_title(&db.conn, &session_id).await;
        let name = query_opt(
            &db.conn,
            "SELECT name FROM students WHERE id=?1",
            libsql::params![student_id.clone()],
            |r| r.get::<String>(0),
        )
        .await?
        .unwrap_or_else(|| student_id.clone());
        write_audit(
            &db.conn,
            &user.id,
            "roster.remove",
            &format!("Rút {name} khỏi buổi {title}"),
        )
        .await?;
    }
    one_session(&db.conn, &session_id).await
}

// ---- Tauri command wrappers ----

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn list_sessions(
    token: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<Vec<Session>> {
    list_sessions_impl(&token, &db.fresh(), &sessions).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn create_session(
    token: String,
    input: SessionInput,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    gcal: State<'_, GCal>,
) -> AppResult<Session> {
    create_session_impl(&token, input, &db.fresh(), &sessions, &gcal).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn update_session(
    token: String,
    id: String,
    input: SessionInput,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    gcal: State<'_, GCal>,
) -> AppResult<Session> {
    update_session_impl(&token, id, input, &db.fresh(), &sessions, &gcal).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn delete_session(
    token: String,
    id: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    gcal: State<'_, GCal>,
) -> AppResult<()> {
    delete_session_impl(&token, id, &db.fresh(), &sessions, &gcal).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn upsert_sessions_from_google(
    token: String,
    incoming: Vec<SessionInput>,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<Vec<Session>> {
    upsert_sessions_from_google_impl(&token, incoming, &db.fresh(), &sessions).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn add_session_students(
    token: String,
    session_id: String,
    student_ids: Vec<String>,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<Session> {
    add_session_students_impl(&token, session_id, student_ids, &db.fresh(), &sessions).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn remove_session_student(
    token: String,
    session_id: String,
    student_id: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<Session> {
    remove_session_student_impl(&token, session_id, student_id, &db.fresh(), &sessions).await
}
