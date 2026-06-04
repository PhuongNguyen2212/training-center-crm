use crate::auth::{current_user, require_role, write_audit, Sessions};
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::{Class, ClassInput};
use crate::util::{new_id, now_iso};
use rusqlite::params;
use tauri::State;

fn student_ids(conn: &rusqlite::Connection, class_id: &str) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn
        .prepare("SELECT student_id FROM class_students WHERE class_id = ?1 ORDER BY enrolled_at")?;
    let ids = stmt
        .query_map([class_id], |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(ids)
}

#[tauri::command]
pub fn list_classes(
    token: String,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<Vec<Class>> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin", "teacher"])?;
    let conn = db.0.lock();

    // Teacher sees only their own classes (server-side scoping).
    let base = "SELECT id,name,course_name,teacher_id,status,created_at,updated_at FROM classes";
    let mut classes = Vec::new();
    if user.role == "teacher" {
        let mut stmt = conn.prepare(&format!("{base} WHERE teacher_id = ?1"))?;
        let rows = stmt.query_map([&user.id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, String>(6)?,
            ))
        })?;
        for row in rows {
            let (id, name, course_name, teacher_id, status, created_at, updated_at) = row?;
            let student_ids = student_ids(&conn, &id)?;
            classes.push(Class { id, name, course_name, teacher_id, student_ids, status, created_at, updated_at });
        }
    } else {
        let mut stmt = conn.prepare(base)?;
        let rows = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, String>(6)?,
            ))
        })?;
        for row in rows {
            let (id, name, course_name, teacher_id, status, created_at, updated_at) = row?;
            let student_ids = student_ids(&conn, &id)?;
            classes.push(Class { id, name, course_name, teacher_id, student_ids, status, created_at, updated_at });
        }
    }
    Ok(classes)
}

fn one_class(conn: &rusqlite::Connection, id: &str) -> AppResult<Class> {
    let (name, course_name, teacher_id, status, created_at, updated_at) = conn.query_row(
        "SELECT name,course_name,teacher_id,status,created_at,updated_at FROM classes WHERE id = ?1",
        [id],
        |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
            ))
        },
    )?;
    Ok(Class {
        id: id.to_string(),
        name,
        course_name,
        teacher_id,
        student_ids: student_ids(conn, id)?,
        status,
        created_at,
        updated_at,
    })
}

#[tauri::command]
pub fn create_class(
    token: String,
    input: ClassInput,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<Class> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin"])?;
    let id = new_id();
    let now = now_iso();
    let conn = db.0.lock();
    conn.execute(
        "INSERT INTO classes (id,name,course_name,teacher_id,status,created_at,updated_at)
         VALUES (?1,?2,?3,?4,'active',?5,?5)",
        params![id, input.name.trim(), input.course_name.trim(), input.teacher_id, now],
    )?;
    write_audit(&conn, &user.id, "class.create", &format!("Tạo lớp {}", input.name))?;
    one_class(&conn, &id)
}

#[tauri::command]
pub fn update_class(
    token: String,
    id: String,
    input: ClassInput,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<Class> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin"])?;
    let conn = db.0.lock();
    conn.execute(
        "UPDATE classes SET name=?2,course_name=?3,teacher_id=?4,updated_at=?5 WHERE id=?1",
        params![id, input.name.trim(), input.course_name.trim(), input.teacher_id, now_iso()],
    )?;
    write_audit(&conn, &user.id, "class.update", &format!("Cập nhật lớp {}", input.name))?;
    one_class(&conn, &id)
}

#[tauri::command]
pub fn set_class_status(
    token: String,
    id: String,
    status: String,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<()> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin"])?;
    if !["active", "completed", "archived"].contains(&status.as_str()) {
        return Err(AppError::new("Trạng thái lớp không hợp lệ."));
    }
    let conn = db.0.lock();
    conn.execute(
        "UPDATE classes SET status=?2,updated_at=?3 WHERE id=?1",
        params![id, status, now_iso()],
    )?;
    write_audit(&conn, &user.id, "class.status_change", &format!("Lớp {id} → {status}"))?;
    Ok(())
}

#[tauri::command]
pub fn enroll_student(
    token: String,
    class_id: String,
    student_id: String,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<()> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin"])?;
    let conn = db.0.lock();
    // INSERT OR IGNORE avoids duplicate enrollment (PK is class+student).
    conn.execute(
        "INSERT OR IGNORE INTO class_students (class_id,student_id,enrolled_at) VALUES (?1,?2,?3)",
        params![class_id, student_id, now_iso()],
    )?;
    write_audit(&conn, &user.id, "class.enroll", &format!("Ghi danh {student_id} vào {class_id}"))?;
    Ok(())
}

#[tauri::command]
pub fn unenroll_student(
    token: String,
    class_id: String,
    student_id: String,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<()> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin"])?;
    let conn = db.0.lock();
    conn.execute(
        "DELETE FROM class_students WHERE class_id=?1 AND student_id=?2",
        params![class_id, student_id],
    )?;
    write_audit(&conn, &user.id, "class.unenroll", &format!("Rút {student_id} khỏi {class_id}"))?;
    Ok(())
}
