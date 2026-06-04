use crate::auth::{current_user, require_role, write_audit, Sessions};
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::User;
use crate::util::{new_id, now_iso};
use rusqlite::{params, OptionalExtension, Row};
use tauri::State;

const ROLES: [&str; 4] = ["admin", "teacher", "salesperson", "finance_staff"];

fn map_user(r: &Row) -> rusqlite::Result<User> {
    Ok(User {
        id: r.get(0)?,
        name: r.get(1)?,
        email: r.get(2)?,
        role: r.get(3)?,
        status: r.get(4)?,
        created_at: r.get(5)?,
    })
}

#[tauri::command]
pub fn list_users(token: String, db: State<Db>, sessions: State<Sessions>) -> AppResult<Vec<User>> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin"])?;
    let conn = db.0.lock();
    let mut stmt =
        conn.prepare("SELECT id,name,email,role,status,created_at FROM users ORDER BY created_at")?;
    let rows = stmt
        .query_map([], map_user)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn create_staff(
    token: String,
    name: String,
    email: String,
    role: String,
    password: String,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<User> {
    let actor = current_user(&db, &sessions, &token)?;
    require_role(&actor, &["admin"])?;

    if !ROLES.contains(&role.as_str()) {
        return Err(AppError::new("Vai trò không hợp lệ."));
    }
    if password.len() < 8 {
        return Err(AppError::new("Mật khẩu phải có tối thiểu 8 ký tự."));
    }
    let email_key = email.trim().to_lowercase();

    let conn = db.0.lock();
    let exists: Option<String> = conn
        .query_row("SELECT id FROM users WHERE lower(email) = ?1", [&email_key], |r| r.get(0))
        .optional()?;
    if exists.is_some() {
        return Err(AppError::new("Email đã tồn tại."));
    }

    let id = new_id();
    let now = now_iso();
    let hash = bcrypt::hash(&password, 12)?;
    conn.execute(
        "INSERT INTO users (id,name,email,password_hash,role,status,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,'active',?6,?6)",
        params![id, name.trim(), email_key, hash, role, now],
    )?;
    write_audit(&conn, &actor.id, "staff.create", &format!("Tạo tài khoản {name} ({role})"))?;

    conn.query_row(
        "SELECT id,name,email,role,status,created_at FROM users WHERE id = ?1",
        [&id],
        map_user,
    )
    .map_err(Into::into)
}

#[tauri::command]
pub fn set_user_status(
    token: String,
    id: String,
    status: String,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<()> {
    let actor = current_user(&db, &sessions, &token)?;
    require_role(&actor, &["admin"])?;
    if status != "active" && status != "suspended" {
        return Err(AppError::new("Trạng thái không hợp lệ."));
    }
    if id == actor.id {
        return Err(AppError::new("Không thể tự thay đổi trạng thái của chính mình."));
    }
    let conn = db.0.lock();
    conn.execute(
        "UPDATE users SET status=?2, updated_at=?3 WHERE id=?1",
        params![id, status, now_iso()],
    )?;
    let action = if status == "suspended" { "staff.suspend" } else { "staff.activate" };
    write_audit(&conn, &actor.id, action, &format!("Đổi trạng thái tài khoản {id} → {status}"))?;
    Ok(())
}

#[tauri::command]
pub fn update_user_role(
    token: String,
    id: String,
    role: String,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<()> {
    let actor = current_user(&db, &sessions, &token)?;
    require_role(&actor, &["admin"])?;
    if !ROLES.contains(&role.as_str()) {
        return Err(AppError::new("Vai trò không hợp lệ."));
    }
    let conn = db.0.lock();
    conn.execute(
        "UPDATE users SET role=?2, updated_at=?3 WHERE id=?1",
        params![id, role, now_iso()],
    )?;
    write_audit(&conn, &actor.id, "staff.role_change", &format!("Đổi vai trò {id} → {role}"))?;
    Ok(())
}

#[tauri::command]
pub fn reset_user_password(
    token: String,
    id: String,
    password: String,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<()> {
    let actor = current_user(&db, &sessions, &token)?;
    require_role(&actor, &["admin"])?;
    if password.len() < 8 {
        return Err(AppError::new("Mật khẩu phải có tối thiểu 8 ký tự."));
    }
    let hash = bcrypt::hash(&password, 12)?;
    let conn = db.0.lock();
    conn.execute(
        "UPDATE users SET password_hash=?2, updated_at=?3 WHERE id=?1",
        params![id, hash, now_iso()],
    )?;
    write_audit(&conn, &actor.id, "staff.reset_password", &format!("Đặt lại mật khẩu {id}"))?;
    Ok(())
}
