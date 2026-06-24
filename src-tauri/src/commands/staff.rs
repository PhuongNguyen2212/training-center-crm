use crate::auth::{current_user, require_capability, write_audit, Capability, Sessions};
use crate::db::{query_all, query_opt, Db};
use crate::error::{AppError, AppResult};
use crate::models::User;
use crate::util::{new_id, now_iso};
use libsql::Row;
#[cfg(feature = "desktop")]
use tauri::State;

const ROLES: [&str; 4] = ["admin", "teacher", "salesperson", "finance_staff"];

fn map_user(r: &Row) -> libsql::Result<User> {
    Ok(User {
        id: r.get(0)?,
        name: r.get(1)?,
        email: r.get(2)?,
        role: r.get(3)?,
        status: r.get(4)?,
        created_at: r.get(5)?,
    })
}

// ---- Transport-agnostic logic ----

pub async fn list_users_impl(token: &str, db: &Db, sessions: &Sessions) -> AppResult<Vec<User>> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::ManageUsers)?;
    query_all(&db.conn, "SELECT id,name,email,role,status,created_at FROM users ORDER BY created_at", (), map_user).await
}

pub async fn create_staff_impl(token: &str, name: String, email: String, role: String, password: String, db: &Db, sessions: &Sessions) -> AppResult<User> {
    let actor = current_user(db, sessions, token).await?;
    require_capability(&actor, Capability::ManageUsers)?;
    if !ROLES.contains(&role.as_str()) {
        return Err(AppError::new("Vai trò không hợp lệ."));
    }
    if password.len() < 8 {
        return Err(AppError::new("Mật khẩu phải có tối thiểu 8 ký tự."));
    }
    let email_key = email.trim().to_lowercase();
    let exists = query_opt(&db.conn, "SELECT id FROM users WHERE lower(email) = ?1", libsql::params![email_key.clone()], |r| r.get::<String>(0)).await?;
    if exists.is_some() {
        return Err(AppError::new("Email đã tồn tại."));
    }
    let id = new_id();
    let now = now_iso();
    let hash = bcrypt::hash(&password, 12)?;
    db.conn
        .execute(
            "INSERT INTO users (id,name,email,password_hash,role,status,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,'active',?6,?6)",
            libsql::params![id.clone(), name.trim().to_string(), email_key, hash, role.clone(), now],
        )
        .await?;
    write_audit(&db.conn, &actor.id, "staff.create", &format!("Tạo tài khoản {name} ({role})")).await?;
    query_opt(&db.conn, "SELECT id,name,email,role,status,created_at FROM users WHERE id = ?1", libsql::params![id.clone()], map_user)
        .await?
        .ok_or_else(|| AppError::new("Không tìm thấy tài khoản vừa tạo."))
}

pub async fn set_user_status_impl(token: &str, id: String, status: String, db: &Db, sessions: &Sessions) -> AppResult<()> {
    let actor = current_user(db, sessions, token).await?;
    require_capability(&actor, Capability::ManageUsers)?;
    if status != "active" && status != "suspended" {
        return Err(AppError::new("Trạng thái không hợp lệ."));
    }
    if id == actor.id {
        return Err(AppError::new("Không thể tự thay đổi trạng thái của chính mình."));
    }
    db.conn.execute("UPDATE users SET status=?2, updated_at=?3 WHERE id=?1", libsql::params![id.clone(), status.clone(), now_iso()]).await?;
    let action = if status == "suspended" { "staff.suspend" } else { "staff.activate" };
    write_audit(&db.conn, &actor.id, action, &format!("Đổi trạng thái tài khoản {id} → {status}")).await?;
    Ok(())
}

pub async fn update_user_role_impl(token: &str, id: String, role: String, db: &Db, sessions: &Sessions) -> AppResult<()> {
    let actor = current_user(db, sessions, token).await?;
    require_capability(&actor, Capability::ManageUsers)?;
    if !ROLES.contains(&role.as_str()) {
        return Err(AppError::new("Vai trò không hợp lệ."));
    }
    db.conn.execute("UPDATE users SET role=?2, updated_at=?3 WHERE id=?1", libsql::params![id.clone(), role.clone(), now_iso()]).await?;
    write_audit(&db.conn, &actor.id, "staff.role_change", &format!("Đổi vai trò {id} → {role}")).await?;
    Ok(())
}

pub async fn reset_user_password_impl(token: &str, id: String, password: String, db: &Db, sessions: &Sessions) -> AppResult<()> {
    let actor = current_user(db, sessions, token).await?;
    require_capability(&actor, Capability::ManageUsers)?;
    if password.len() < 8 {
        return Err(AppError::new("Mật khẩu phải có tối thiểu 8 ký tự."));
    }
    let hash = bcrypt::hash(&password, 12)?;
    db.conn.execute("UPDATE users SET password_hash=?2, updated_at=?3 WHERE id=?1", libsql::params![id.clone(), hash, now_iso()]).await?;
    write_audit(&db.conn, &actor.id, "staff.reset_password", &format!("Đặt lại mật khẩu {id}")).await?;
    Ok(())
}

// ---- Tauri command wrappers ----

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn list_users(token: String, db: State<'_, Db>, sessions: State<'_, Sessions>) -> AppResult<Vec<User>> {
    list_users_impl(&token, &db, &sessions).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn create_staff(token: String, name: String, email: String, role: String, password: String, db: State<'_, Db>, sessions: State<'_, Sessions>) -> AppResult<User> {
    create_staff_impl(&token, name, email, role, password, &db, &sessions).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn set_user_status(token: String, id: String, status: String, db: State<'_, Db>, sessions: State<'_, Sessions>) -> AppResult<()> {
    set_user_status_impl(&token, id, status, &db, &sessions).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn update_user_role(token: String, id: String, role: String, db: State<'_, Db>, sessions: State<'_, Sessions>) -> AppResult<()> {
    update_user_role_impl(&token, id, role, &db, &sessions).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn reset_user_password(token: String, id: String, password: String, db: State<'_, Db>, sessions: State<'_, Sessions>) -> AppResult<()> {
    reset_user_password_impl(&token, id, password, &db, &sessions).await
}
