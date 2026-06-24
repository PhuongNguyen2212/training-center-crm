use crate::auth::{current_user, require_capability, write_audit, Capability, Sessions};
use crate::db::{query_all, query_opt, Db};
use crate::error::{AppError, AppResult};
use crate::gcal::GCal;
use crate::models::{Session, SessionInput};
use crate::util::{new_id, now_iso};
use libsql::{Connection, Row};
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

const COLS: &str = "id,google_event_id,title,start_time,end_time,teacher_id,class_id";

fn map_session(r: &Row) -> libsql::Result<Session> {
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

async fn one_session(conn: &Connection, id: &str) -> AppResult<Session> {
    query_opt(
        conn,
        &format!("SELECT {COLS} FROM sessions WHERE id=?1"),
        libsql::params![id.to_string()],
        map_session,
    )
    .await?
    .ok_or_else(|| AppError::new("Không tìm thấy buổi học."))
}

// ---- Transport-agnostic logic ----

pub async fn list_sessions_impl(token: &str, db: &Db, sessions: &Sessions) -> AppResult<Vec<Session>> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::ScheduleView)?;
    if user.role == "teacher" {
        query_all(
            &db.conn,
            &format!("SELECT {COLS} FROM sessions WHERE teacher_id = ?1 ORDER BY start_time"),
            libsql::params![user.id.clone()],
            map_session,
        )
        .await
    } else {
        query_all(&db.conn, &format!("SELECT {COLS} FROM sessions ORDER BY start_time"), (), map_session).await
    }
}

pub async fn create_session_impl(token: &str, input: SessionInput, db: &Db, sessions: &Sessions, gcal: &GCal) -> AppResult<Session> {
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
            "INSERT INTO sessions (id,google_event_id,title,start_time,end_time,teacher_id,class_id,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)",
            libsql::params![id.clone(), input.google_event_id.clone(), input.title.clone(), input.start_time.clone(), input.end_time.clone(), teacher_id, input.class_id.clone(), now],
        )
        .await?;
    write_audit(&db.conn, &user.id, "schedule.create", &format!("Tạo buổi học {}", input.title)).await?;
    if let Ok(Some(eid)) = gcal.insert_event(&input.title, &input.start_time, &input.end_time).await {
        let _ = db.conn.execute("UPDATE sessions SET google_event_id=?2 WHERE id=?1", libsql::params![id.clone(), eid]).await;
    }
    one_session(&db.conn, &id).await
}

pub async fn update_session_impl(token: &str, id: String, input: SessionInput, db: &Db, sessions: &Sessions, gcal: &GCal) -> AppResult<Session> {
    let user = current_user(db, sessions, token).await?;
    let teacher_id = if user.role == "admin" {
        input.teacher_id.clone()
    } else if user.role == "teacher" {
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
            "UPDATE sessions SET title=?2,start_time=?3,end_time=?4,teacher_id=?5,class_id=?6,updated_at=?7 WHERE id=?1",
            libsql::params![id.clone(), input.title.clone(), input.start_time.clone(), input.end_time.clone(), teacher_id, input.class_id.clone(), now_iso()],
        )
        .await?;
    write_audit(&db.conn, &user.id, "schedule.edit", &format!("Sửa buổi học {id}")).await?;
    match google_event_id(&db.conn, &id).await? {
        Some(eid) => {
            let _ = gcal.update_event(&eid, &input.title, &input.start_time, &input.end_time).await;
        }
        None => {
            if let Ok(Some(eid)) = gcal.insert_event(&input.title, &input.start_time, &input.end_time).await {
                let _ = db.conn.execute("UPDATE sessions SET google_event_id=?2 WHERE id=?1", libsql::params![id.clone(), eid]).await;
            }
        }
    }
    one_session(&db.conn, &id).await
}

pub async fn delete_session_impl(token: &str, id: String, db: &Db, sessions: &Sessions, gcal: &GCal) -> AppResult<()> {
    let user = current_user(db, sessions, token).await?;
    if user.role == "teacher" {
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
    } else if user.role != "admin" {
        return Err(AppError::new("Bạn không có quyền xóa buổi học."));
    }
    let eid = google_event_id(&db.conn, &id).await?;
    db.conn.execute("DELETE FROM sessions WHERE id=?1", libsql::params![id.clone()]).await?;
    write_audit(&db.conn, &user.id, "schedule.delete", &format!("Xóa buổi học {id}")).await?;
    if let Some(eid) = eid {
        let _ = gcal.delete_event(&eid).await;
    }
    Ok(())
}

pub async fn upsert_sessions_from_google_impl(token: &str, incoming: Vec<SessionInput>, db: &Db, sessions: &Sessions) -> AppResult<Vec<Session>> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::ScheduleEdit)?;
    for ev in &incoming {
        let Some(gid) = &ev.google_event_id else { continue };
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
                    "UPDATE sessions SET title=?2,start_time=?3,end_time=?4,teacher_id=?5,class_id=?6,updated_at=?7 WHERE id=?1",
                    libsql::params![id, ev.title.clone(), ev.start_time.clone(), ev.end_time.clone(), ev.teacher_id.clone(), ev.class_id.clone(), now_iso()],
                )
                .await?;
        } else {
            let now = now_iso();
            db.conn
                .execute(
                    "INSERT INTO sessions (id,google_event_id,title,start_time,end_time,teacher_id,class_id,created_at,updated_at)
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)",
                    libsql::params![new_id(), gid.clone(), ev.title.clone(), ev.start_time.clone(), ev.end_time.clone(), ev.teacher_id.clone(), ev.class_id.clone(), now],
                )
                .await?;
        }
    }
    write_audit(&db.conn, &user.id, "schedule.sync", &format!("Đồng bộ {} buổi từ Google", incoming.len())).await?;
    query_all(&db.conn, &format!("SELECT {COLS} FROM sessions ORDER BY start_time"), (), map_session).await
}

// ---- Tauri command wrappers ----

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn list_sessions(token: String, db: State<'_, Db>, sessions: State<'_, Sessions>) -> AppResult<Vec<Session>> {
    list_sessions_impl(&token, &db, &sessions).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn create_session(token: String, input: SessionInput, db: State<'_, Db>, sessions: State<'_, Sessions>, gcal: State<'_, GCal>) -> AppResult<Session> {
    create_session_impl(&token, input, &db, &sessions, &gcal).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn update_session(token: String, id: String, input: SessionInput, db: State<'_, Db>, sessions: State<'_, Sessions>, gcal: State<'_, GCal>) -> AppResult<Session> {
    update_session_impl(&token, id, input, &db, &sessions, &gcal).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn delete_session(token: String, id: String, db: State<'_, Db>, sessions: State<'_, Sessions>, gcal: State<'_, GCal>) -> AppResult<()> {
    delete_session_impl(&token, id, &db, &sessions, &gcal).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn upsert_sessions_from_google(token: String, incoming: Vec<SessionInput>, db: State<'_, Db>, sessions: State<'_, Sessions>) -> AppResult<Vec<Session>> {
    upsert_sessions_from_google_impl(&token, incoming, &db, &sessions).await
}
