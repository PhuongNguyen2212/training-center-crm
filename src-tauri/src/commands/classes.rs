use crate::auth::{current_user, require_capability, write_audit, Capability, Sessions};
use crate::db::{query_all, query_opt, Db};
use crate::error::{AppError, AppResult};
use crate::models::{Class, ClassInput};
use crate::util::{new_id, now_iso};
use libsql::{Connection, Row};
#[cfg(feature = "desktop")]
use tauri::State;

type ClassRow = (
    String,
    String,
    String,
    Option<String>,
    String,
    String,
    String,
);

fn map_class_row(r: &Row) -> libsql::Result<ClassRow> {
    Ok((
        r.get(0)?,
        r.get(1)?,
        r.get(2)?,
        r.get(3)?,
        r.get(4)?,
        r.get(5)?,
        r.get(6)?,
    ))
}

async fn student_ids(conn: &Connection, class_id: &str) -> AppResult<Vec<String>> {
    query_all(
        conn,
        "SELECT student_id FROM class_students WHERE class_id = ?1 ORDER BY enrolled_at",
        libsql::params![class_id.to_string()],
        |r| r.get::<String>(0),
    )
    .await
}

async fn build_class(conn: &Connection, row: ClassRow) -> AppResult<Class> {
    let (id, name, course_name, teacher_id, status, created_at, updated_at) = row;
    let student_ids = student_ids(conn, &id).await?;
    Ok(Class {
        id,
        name,
        course_name,
        teacher_id,
        student_ids,
        status,
        created_at,
        updated_at,
    })
}

async fn one_class(conn: &Connection, id: &str) -> AppResult<Class> {
    let row = query_opt(
        conn,
        "SELECT id,name,course_name,teacher_id,status,created_at,updated_at FROM classes WHERE id = ?1",
        libsql::params![id.to_string()],
        map_class_row,
    )
    .await?
    .ok_or_else(|| AppError::new("Không tìm thấy lớp."))?;
    build_class(conn, row).await
}

/// Look up a row's `name` by id (for readable audit/notifications); falls back
/// to the id. `table` is a fixed literal, never user input.
async fn name_of(conn: &Connection, table: &str, id: &str) -> String {
    let sql = format!("SELECT name FROM {table} WHERE id=?1");
    query_opt(conn, &sql, libsql::params![id.to_string()], |r| {
        r.get::<String>(0)
    })
    .await
    .ok()
    .flatten()
    .unwrap_or_else(|| id.to_string())
}

// ---- Transport-agnostic logic (shared by Tauri commands + HTTP API) ----

pub async fn list_classes_impl(token: &str, db: &Db, sessions: &Sessions) -> AppResult<Vec<Class>> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::ScheduleView)?;
    let base = "SELECT id,name,course_name,teacher_id,status,created_at,updated_at FROM classes";

    // Teacher sees only their own classes (server-side scoping).
    let rows = if user.role == "teacher" {
        query_all(
            &db.conn,
            &format!("{base} WHERE teacher_id = ?1"),
            libsql::params![user.id.clone()],
            map_class_row,
        )
        .await?
    } else {
        query_all(&db.conn, base, (), map_class_row).await?
    };

    let mut classes = Vec::with_capacity(rows.len());
    for row in rows {
        classes.push(build_class(&db.conn, row).await?);
    }
    Ok(classes)
}

pub async fn create_class_impl(
    token: &str,
    input: ClassInput,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<Class> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::ScheduleEdit)?;
    let id = new_id();
    let now = now_iso();
    db.conn
        .execute(
            "INSERT INTO classes (id,name,course_name,teacher_id,status,created_at,updated_at)
             VALUES (?1,?2,?3,?4,'active',?5,?5)",
            libsql::params![
                id.clone(),
                input.name.trim().to_string(),
                input.course_name.trim().to_string(),
                input.teacher_id.clone(),
                now
            ],
        )
        .await?;
    write_audit(
        &db.conn,
        &user.id,
        "class.create",
        &format!("Tạo lớp {}", input.name),
    )
    .await?;
    one_class(&db.conn, &id).await
}

pub async fn update_class_impl(
    token: &str,
    id: String,
    input: ClassInput,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<Class> {
    let user = current_user(db, sessions, token).await?;
    // Admin edits any class; a teacher edits only their OWN class and cannot
    // reassign it to someone else (teacher_id forced to stay themselves).
    let teacher_id = if user.role == "admin" {
        input.teacher_id.clone()
    } else if user.role == "teacher" {
        let owner: Option<String> = query_opt(
            &db.conn,
            "SELECT teacher_id FROM classes WHERE id=?1",
            libsql::params![id.clone()],
            |r| r.get::<Option<String>>(0),
        )
        .await?
        .ok_or_else(|| AppError::new("Không tìm thấy lớp."))?;
        if owner.as_deref() != Some(user.id.as_str()) {
            return Err(AppError::new("Bạn chỉ sửa được lớp của mình."));
        }
        Some(user.id.clone())
    } else {
        return Err(AppError::new("Bạn không có quyền sửa lớp học."));
    };
    db.conn
        .execute(
            "UPDATE classes SET name=?2,course_name=?3,teacher_id=?4,updated_at=?5 WHERE id=?1",
            libsql::params![
                id.clone(),
                input.name.trim().to_string(),
                input.course_name.trim().to_string(),
                teacher_id,
                now_iso()
            ],
        )
        .await?;
    write_audit(
        &db.conn,
        &user.id,
        "class.update",
        &format!("Cập nhật lớp {}", input.name),
    )
    .await?;
    one_class(&db.conn, &id).await
}

pub async fn set_class_status_impl(
    token: &str,
    id: String,
    status: String,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<()> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::ScheduleEdit)?;
    if !["active", "completed", "archived"].contains(&status.as_str()) {
        return Err(AppError::new("Trạng thái lớp không hợp lệ."));
    }
    db.conn
        .execute(
            "UPDATE classes SET status=?2,updated_at=?3 WHERE id=?1",
            libsql::params![id.clone(), status.clone(), now_iso()],
        )
        .await?;
    write_audit(
        &db.conn,
        &user.id,
        "class.status_change",
        &format!("Lớp {id} → {status}"),
    )
    .await?;
    Ok(())
}

pub async fn enroll_student_impl(
    token: &str,
    class_id: String,
    student_id: String,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<()> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::ScheduleEdit)?;
    db.conn
        .execute(
            "INSERT OR IGNORE INTO class_students (class_id,student_id,enrolled_at) VALUES (?1,?2,?3)",
            libsql::params![class_id.clone(), student_id.clone(), now_iso()],
        )
        .await?;
    let sname = name_of(&db.conn, "students", &student_id).await;
    let cname = name_of(&db.conn, "classes", &class_id).await;
    write_audit(
        &db.conn,
        &user.id,
        "class.enroll",
        &format!("Ghi danh {sname} vào lớp {cname}"),
    )
    .await?;
    Ok(())
}

pub async fn unenroll_student_impl(
    token: &str,
    class_id: String,
    student_id: String,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<()> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::ScheduleEdit)?;
    db.conn
        .execute(
            "DELETE FROM class_students WHERE class_id=?1 AND student_id=?2",
            libsql::params![class_id.clone(), student_id.clone()],
        )
        .await?;
    let sname = name_of(&db.conn, "students", &student_id).await;
    let cname = name_of(&db.conn, "classes", &class_id).await;
    write_audit(
        &db.conn,
        &user.id,
        "class.unenroll",
        &format!("Hủy ghi danh {sname} khỏi lớp {cname}"),
    )
    .await?;
    Ok(())
}

/// Hard-delete a class (admin only): remove its enrollments, unlink its sessions
/// (keep them but clear class_id), then delete the class.
pub async fn delete_class_impl(
    token: &str,
    id: String,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<()> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::ScheduleEdit)?; // admin
    let cname = name_of(&db.conn, "classes", &id).await;
    db.conn
        .execute(
            "DELETE FROM class_students WHERE class_id=?1",
            libsql::params![id.clone()],
        )
        .await?;
    db.conn
        .execute(
            "UPDATE sessions SET class_id=NULL WHERE class_id=?1",
            libsql::params![id.clone()],
        )
        .await?;
    db.conn
        .execute(
            "DELETE FROM classes WHERE id=?1",
            libsql::params![id.clone()],
        )
        .await?;
    write_audit(
        &db.conn,
        &user.id,
        "class.delete",
        &format!("Xóa lớp {cname}"),
    )
    .await?;
    Ok(())
}

// ---- Tauri command wrappers ----

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn list_classes(
    token: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<Vec<Class>> {
    list_classes_impl(&token, &db, &sessions).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn create_class(
    token: String,
    input: ClassInput,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<Class> {
    create_class_impl(&token, input, &db, &sessions).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn update_class(
    token: String,
    id: String,
    input: ClassInput,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<Class> {
    update_class_impl(&token, id, input, &db, &sessions).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn set_class_status(
    token: String,
    id: String,
    status: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<()> {
    set_class_status_impl(&token, id, status, &db, &sessions).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn enroll_student(
    token: String,
    class_id: String,
    student_id: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<()> {
    enroll_student_impl(&token, class_id, student_id, &db, &sessions).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn unenroll_student(
    token: String,
    class_id: String,
    student_id: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<()> {
    unenroll_student_impl(&token, class_id, student_id, &db, &sessions).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn delete_class(
    token: String,
    id: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<()> {
    delete_class_impl(&token, id, &db, &sessions).await
}
