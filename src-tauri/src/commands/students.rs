use crate::auth::{current_user, require_capability, write_audit, Capability, Sessions};
use crate::db::{query_all, query_opt, Db};
use crate::error::{AppError, AppResult};
use crate::models::{Student, StudentInput};
use crate::util::{is_valid_cccd, new_id, now_iso};
use libsql::{Connection, Row};
#[cfg(feature = "desktop")]
use tauri::State;

const COLS: &str = "id,name,age,phone,job_title,goal,enrollment_status,cccd_number,salesperson_id,created_at,updated_at,deleted_at";

fn map_student(r: &Row) -> libsql::Result<Student> {
    Ok(Student {
        id: r.get(0)?,
        name: r.get(1)?,
        age: r.get(2)?,
        phone: r.get(3)?,
        job_title: r.get(4)?,
        goal: r.get(5)?,
        enrollment_status: r.get(6)?,
        cccd_number: r.get(7)?,
        salesperson_id: r.get(8)?,
        created_at: r.get(9)?,
        updated_at: r.get(10)?,
        deleted_at: r.get(11)?,
    })
}

async fn one_student(conn: &Connection, id: &str) -> AppResult<Student> {
    query_opt(
        conn,
        &format!("SELECT {COLS} FROM students WHERE id = ?1"),
        libsql::params![id.to_string()],
        map_student,
    )
    .await?
    .ok_or_else(|| AppError::new("Không tìm thấy học viên."))
}

/// Server-side enforcement of the CCCD business rule.
fn validate(input: &StudentInput) -> AppResult<()> {
    if input.name.trim().len() < 2 {
        return Err(AppError::new("Họ và tên không hợp lệ."));
    }
    if input.enrollment_status == "confirmed" {
        match &input.cccd_number {
            Some(c) if is_valid_cccd(c) => {}
            _ => {
                return Err(AppError::new(
                    "Học viên đã xác nhận phải có số CCCD gồm đúng 12 chữ số.",
                ))
            }
        }
    }
    Ok(())
}

// ---- Transport-agnostic logic (shared by Tauri commands + HTTP API) ----

pub async fn list_students_impl(
    token: &str,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<Vec<Student>> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::StudentView)?;
    if user.role == "salesperson" {
        query_all(
            &db.conn,
            &format!("SELECT {COLS} FROM students WHERE deleted_at IS NULL AND salesperson_id = ?1 ORDER BY created_at DESC"),
            libsql::params![user.id.clone()],
            map_student,
        )
        .await
    } else {
        query_all(
            &db.conn,
            &format!("SELECT {COLS} FROM students WHERE deleted_at IS NULL ORDER BY created_at DESC"),
            (),
            map_student,
        )
        .await
    }
}

pub async fn create_student_impl(
    token: &str,
    input: StudentInput,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<Student> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::StudentEdit)?;
    validate(&input)?;

    let id = new_id();
    let now = now_iso();
    let salesperson_id = if user.role == "salesperson" {
        Some(user.id.clone())
    } else {
        None
    };

    db.conn
        .execute(
            "INSERT INTO students
             (id,name,age,phone,job_title,goal,enrollment_status,cccd_number,salesperson_id,created_at,updated_at,deleted_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10,NULL)",
            libsql::params![
                id.clone(), input.name.trim().to_string(), input.age, input.phone.clone(),
                input.job_title.clone(), input.goal.clone(), input.enrollment_status.clone(),
                input.cccd_number.clone(), salesperson_id, now.clone()
            ],
        )
        .await?;
    write_audit(&db.conn, &user.id, "student.create", &format!("Thêm học viên {}", input.name)).await?;
    one_student(&db.conn, &id).await
}

pub async fn update_student_impl(
    token: &str,
    id: &str,
    input: StudentInput,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<Student> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::StudentEdit)?;
    validate(&input)?;

    let (prev_status, owner): (String, Option<String>) = query_opt(
        &db.conn,
        "SELECT enrollment_status, salesperson_id FROM students WHERE id = ?1 AND deleted_at IS NULL",
        libsql::params![id.to_string()],
        |r| Ok((r.get::<String>(0)?, r.get::<Option<String>>(1)?)),
    )
    .await?
    .ok_or_else(|| AppError::new("Không tìm thấy học viên."))?;

    if user.role == "salesperson" && owner.as_deref() != Some(user.id.as_str()) {
        return Err(AppError::new("Bạn chỉ được sửa học viên do mình phụ trách."));
    }

    db.conn
        .execute(
            "UPDATE students SET name=?2,age=?3,phone=?4,job_title=?5,goal=?6,
             enrollment_status=?7,cccd_number=?8,updated_at=?9 WHERE id=?1",
            libsql::params![
                id.to_string(), input.name.trim().to_string(), input.age, input.phone.clone(),
                input.job_title.clone(), input.goal.clone(), input.enrollment_status.clone(),
                input.cccd_number.clone(), now_iso()
            ],
        )
        .await?;

    if prev_status != input.enrollment_status {
        write_audit(
            &db.conn,
            &user.id,
            "student.status_change",
            &format!("{}: {} → {}", input.name, prev_status, input.enrollment_status),
        )
        .await?;
    } else {
        write_audit(&db.conn, &user.id, "student.update", &format!("Cập nhật {}", input.name)).await?;
    }

    one_student(&db.conn, id).await
}

pub async fn soft_delete_student_impl(
    token: &str,
    id: &str,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<()> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::StudentDelete)?;
    let affected = db
        .conn
        .execute(
            "UPDATE students SET deleted_at=?2 WHERE id=?1 AND deleted_at IS NULL",
            libsql::params![id.to_string(), now_iso()],
        )
        .await?;
    if affected == 0 {
        return Err(AppError::new("Không tìm thấy học viên."));
    }
    write_audit(&db.conn, &user.id, "student.soft_delete", &format!("Ẩn học viên {id}")).await?;
    Ok(())
}

// ---- Tauri command wrappers ----

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn list_students(token: String, db: State<'_, Db>, sessions: State<'_, Sessions>) -> AppResult<Vec<Student>> {
    list_students_impl(&token, &db, &sessions).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn create_student(token: String, input: StudentInput, db: State<'_, Db>, sessions: State<'_, Sessions>) -> AppResult<Student> {
    create_student_impl(&token, input, &db, &sessions).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn update_student(token: String, id: String, input: StudentInput, db: State<'_, Db>, sessions: State<'_, Sessions>) -> AppResult<Student> {
    update_student_impl(&token, &id, input, &db, &sessions).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn soft_delete_student(token: String, id: String, db: State<'_, Db>, sessions: State<'_, Sessions>) -> AppResult<()> {
    soft_delete_student_impl(&token, &id, &db, &sessions).await
}
