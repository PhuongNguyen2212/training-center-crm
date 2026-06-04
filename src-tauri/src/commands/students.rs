use crate::auth::{current_user, require_role, write_audit, Sessions};
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::{Student, StudentInput};
use crate::util::{is_valid_cccd, new_id, now_iso};
use rusqlite::{params, Row};
use tauri::State;

const COLS: &str = "id,name,age,phone,job_title,goal,enrollment_status,cccd_number,salesperson_id,created_at,updated_at,deleted_at";

fn map_student(r: &Row) -> rusqlite::Result<Student> {
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

#[tauri::command]
pub fn list_students(
    token: String,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<Vec<Student>> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(
        &user,
        &["admin", "teacher", "salesperson", "finance_staff"],
    )?;
    let conn = db.0.lock();

    // Salesperson sees only their own referrals ("own" scoping, server-side).
    let (sql, scoped) = if user.role == "salesperson" {
        (
            format!("SELECT {COLS} FROM students WHERE deleted_at IS NULL AND salesperson_id = ?1 ORDER BY created_at DESC"),
            true,
        )
    } else {
        (
            format!("SELECT {COLS} FROM students WHERE deleted_at IS NULL ORDER BY created_at DESC"),
            false,
        )
    };

    let mut stmt = conn.prepare(&sql)?;
    let rows = if scoped {
        stmt.query_map([&user.id], map_student)?
            .collect::<rusqlite::Result<Vec<_>>>()?
    } else {
        stmt.query_map([], map_student)?
            .collect::<rusqlite::Result<Vec<_>>>()?
    };
    Ok(rows)
}

#[tauri::command]
pub fn create_student(
    token: String,
    input: StudentInput,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<Student> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin", "salesperson"])?;
    validate(&input)?;

    let id = new_id();
    let now = now_iso();
    // Only attribute the referral when the creator is a salesperson.
    let salesperson_id = if user.role == "salesperson" {
        Some(user.id.clone())
    } else {
        None
    };

    let conn = db.0.lock();
    conn.execute(
        "INSERT INTO students
         (id,name,age,phone,job_title,goal,enrollment_status,cccd_number,salesperson_id,created_at,updated_at,deleted_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10,NULL)",
        params![
            id, input.name.trim(), input.age, input.phone, input.job_title, input.goal,
            input.enrollment_status, input.cccd_number, salesperson_id, now
        ],
    )?;
    write_audit(&conn, &user.id, "student.create", &format!("Thêm học viên {}", input.name))?;

    conn.query_row(&format!("SELECT {COLS} FROM students WHERE id = ?1"), [&id], map_student)
        .map_err(Into::into)
}

#[tauri::command]
pub fn update_student(
    token: String,
    id: String,
    input: StudentInput,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<Student> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin", "salesperson"])?;
    validate(&input)?;

    let conn = db.0.lock();
    let prev_status: String = conn
        .query_row("SELECT enrollment_status FROM students WHERE id = ?1", [&id], |r| r.get(0))
        .map_err(|_| AppError::new("Không tìm thấy học viên."))?;

    conn.execute(
        "UPDATE students SET name=?2,age=?3,phone=?4,job_title=?5,goal=?6,
         enrollment_status=?7,cccd_number=?8,updated_at=?9 WHERE id=?1",
        params![
            id, input.name.trim(), input.age, input.phone, input.job_title, input.goal,
            input.enrollment_status, input.cccd_number, now_iso()
        ],
    )?;

    if prev_status != input.enrollment_status {
        write_audit(
            &conn,
            &user.id,
            "student.status_change",
            &format!("{}: {} → {}", input.name, prev_status, input.enrollment_status),
        )?;
    } else {
        write_audit(&conn, &user.id, "student.update", &format!("Cập nhật {}", input.name))?;
    }

    conn.query_row(&format!("SELECT {COLS} FROM students WHERE id = ?1"), [&id], map_student)
        .map_err(Into::into)
}

#[tauri::command]
pub fn soft_delete_student(
    token: String,
    id: String,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<()> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin"])?; // only admin can remove students
    let conn = db.0.lock();
    let affected = conn.execute(
        "UPDATE students SET deleted_at=?2 WHERE id=?1 AND deleted_at IS NULL",
        params![id, now_iso()],
    )?;
    if affected == 0 {
        return Err(AppError::new("Không tìm thấy học viên."));
    }
    write_audit(&conn, &user.id, "student.soft_delete", &format!("Ẩn học viên {id}"))?;
    Ok(())
}
