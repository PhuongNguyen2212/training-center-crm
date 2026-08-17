use crate::auth::{current_user, require_capability, write_audit, AuthUser, Capability, Sessions};
use crate::db::{query_all, query_opt, Db};
use crate::error::{AppError, AppResult};
use crate::models::{Attendance, Homework};
use crate::util::{new_id, now_iso};
use libsql::{Connection, Row};
#[cfg(feature = "desktop")]
use tauri::State;

fn map_attendance(r: &Row) -> libsql::Result<Attendance> {
    Ok(Attendance {
        id: r.get(0)?,
        student_id: r.get(1)?,
        session_id: r.get(2)?,
        status: r.get(3)?,
        marked_by: r.get(4)?,
        marked_at: r.get(5)?,
        is_override: r.get::<i64>(6)? != 0,
    })
}

fn map_homework(r: &Row) -> libsql::Result<Homework> {
    Ok(Homework {
        id: r.get(0)?,
        student_id: r.get(1)?,
        session_id: r.get(2)?,
        status: r.get(3)?,
        recorded_by: r.get(4)?,
    })
}

/// A teacher may only touch sessions of their own classes (admin: any).
async fn ensure_session_access(
    conn: &Connection,
    user: &AuthUser,
    session_id: &str,
) -> AppResult<()> {
    if !user.is_teacher() {
        return Ok(());
    }
    let owns = query_opt(
        conn,
        "SELECT id FROM sessions WHERE id=?1 AND teacher_id=?2",
        libsql::params![session_id.to_string(), user.id.clone()],
        |r| r.get::<String>(0),
    )
    .await?;
    if owns.is_none() {
        return Err(AppError::new(
            "Bạn chỉ thao tác được trên buổi học của lớp mình.",
        ));
    }
    Ok(())
}

// ---- Transport-agnostic logic ----

pub async fn list_attendance_impl(
    token: &str,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<Vec<Attendance>> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::AttendanceView)?;
    if user.is_teacher() {
        query_all(
            &db.conn,
            "SELECT a.id,a.student_id,a.session_id,a.status,a.marked_by,a.marked_at,a.is_override
             FROM attendance a JOIN sessions s ON s.id = a.session_id
             WHERE s.teacher_id = ?1 ORDER BY a.marked_at",
            libsql::params![user.id.clone()],
            map_attendance,
        )
        .await
    } else {
        query_all(
            &db.conn,
            "SELECT id,student_id,session_id,status,marked_by,marked_at,is_override FROM attendance ORDER BY marked_at",
            (),
            map_attendance,
        )
        .await
    }
}

/// Append-only: a repeat mark inserts a new override row (attendance = legal proof).
pub async fn mark_attendance_impl(
    token: &str,
    student_id: String,
    session_id: String,
    status: String,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<Attendance> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::AttendanceMark)?;
    ensure_session_access(&db.conn, &user, &session_id).await?;

    let existing = query_opt(
        &db.conn,
        "SELECT id FROM attendance WHERE student_id=?1 AND session_id=?2 LIMIT 1",
        libsql::params![student_id.clone(), session_id.clone()],
        |r| r.get::<String>(0),
    )
    .await?;
    let is_override = existing.is_some();

    let id = new_id();
    let now = now_iso();
    db.conn
        .execute(
            "INSERT INTO attendance (id,student_id,session_id,status,marked_by,marked_at,is_override,created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?6)",
            libsql::params![id.clone(), student_id.clone(), session_id.clone(), status.clone(), user.id.clone(), now.clone(), is_override as i64],
        )
        .await?;
    write_audit(
        &db.conn,
        &user.id,
        if is_override {
            "attendance.override"
        } else {
            "attendance.mark"
        },
        &format!(
            "Điểm danh {status}{}",
            if is_override { " (ghi đè)" } else { "" }
        ),
    )
    .await?;
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

pub async fn list_homework_impl(
    token: &str,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<Vec<Homework>> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::HomeworkView)?;
    if user.is_teacher() {
        query_all(
            &db.conn,
            "SELECT h.id,h.student_id,h.session_id,h.status,h.recorded_by FROM homework h
             JOIN sessions s ON s.id = h.session_id WHERE s.teacher_id = ?1",
            libsql::params![user.id.clone()],
            map_homework,
        )
        .await
    } else {
        query_all(
            &db.conn,
            "SELECT id,student_id,session_id,status,recorded_by FROM homework",
            (),
            map_homework,
        )
        .await
    }
}

pub async fn set_homework_impl(
    token: &str,
    student_id: String,
    session_id: String,
    status: String,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<Homework> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::HomeworkRecord)?;
    ensure_session_access(&db.conn, &user, &session_id).await?;
    let now = now_iso();
    db.conn
        .execute(
            "INSERT INTO homework (id,student_id,session_id,status,recorded_by,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?6)
             ON CONFLICT(student_id,session_id)
             DO UPDATE SET status=excluded.status, recorded_by=excluded.recorded_by, updated_at=excluded.updated_at",
            libsql::params![new_id(), student_id.clone(), session_id.clone(), status.clone(), user.id.clone(), now],
        )
        .await?;
    let (id, recorded_by): (String, String) = query_opt(
        &db.conn,
        "SELECT id,recorded_by FROM homework WHERE student_id=?1 AND session_id=?2",
        libsql::params![student_id.clone(), session_id.clone()],
        |r| Ok((r.get::<String>(0)?, r.get::<String>(1)?)),
    )
    .await?
    .ok_or_else(|| AppError::new("Không lưu được bài tập."))?;
    Ok(Homework {
        id,
        student_id,
        session_id,
        status,
        recorded_by,
    })
}

// ---- Tauri command wrappers ----

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn list_attendance(
    token: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<Vec<Attendance>> {
    list_attendance_impl(&token, &db.fresh(), &sessions).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn mark_attendance(
    token: String,
    student_id: String,
    session_id: String,
    status: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<Attendance> {
    mark_attendance_impl(
        &token,
        student_id,
        session_id,
        status,
        &db.fresh(),
        &sessions,
    )
    .await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn list_homework(
    token: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<Vec<Homework>> {
    list_homework_impl(&token, &db.fresh(), &sessions).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn set_homework(
    token: String,
    student_id: String,
    session_id: String,
    status: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<Homework> {
    set_homework_impl(
        &token,
        student_id,
        session_id,
        status,
        &db.fresh(),
        &sessions,
    )
    .await
}
