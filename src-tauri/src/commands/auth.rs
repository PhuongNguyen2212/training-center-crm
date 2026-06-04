use crate::auth::{
    clear_failures, current_user, is_locked, record_failure, write_audit, LoginGuard, Sessions,
};
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::{LoginResponse, User};
use crate::util::new_id;
use rusqlite::OptionalExtension;
use tauri::State;

type UserRow = (String, String, String, String, String, String, String);

#[tauri::command]
pub fn login(
    email: String,
    password: String,
    db: State<Db>,
    sessions: State<Sessions>,
    guard: State<LoginGuard>,
) -> AppResult<LoginResponse> {
    let key = email.trim().to_lowercase();

    if let Some(ms) = is_locked(&guard, &key) {
        let mins = (ms / 60_000) + 1;
        return Err(AppError::new(format!(
            "Tài khoản tạm khóa do nhập sai nhiều lần. Thử lại sau ~{mins} phút."
        )));
    }

    let row: Option<UserRow> = {
        let conn = db.0.lock();
        conn.query_row(
            "SELECT id,name,email,role,status,password_hash,created_at
             FROM users WHERE lower(email) = ?1",
            [&key],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                ))
            },
        )
        .optional()?
    };

    let (id, name, email_db, role, status, hash, created_at) = match row {
        Some(t) => t,
        None => {
            record_failure(&guard, &key);
            return Err(AppError::new("Email hoặc mật khẩu không đúng."));
        }
    };

    if !bcrypt::verify(&password, &hash).unwrap_or(false) {
        let locked = record_failure(&guard, &key);
        {
            let conn = db.0.lock();
            let _ = write_audit(&conn, &id, "login.failed", "Đăng nhập sai");
        }
        return Err(AppError::new(if locked {
            "Sai quá số lần cho phép. Tài khoản bị khóa 5 phút."
        } else {
            "Email hoặc mật khẩu không đúng."
        }));
    }

    if status == "suspended" {
        let conn = db.0.lock();
        let _ = write_audit(&conn, &id, "login.blocked", "Tài khoản bị treo");
        return Err(AppError::new("Tài khoản đã bị treo. Liên hệ quản trị viên."));
    }

    clear_failures(&guard, &key);
    let token = new_id();
    sessions.0.lock().insert(token.clone(), id.clone());
    {
        let conn = db.0.lock();
        let _ = write_audit(&conn, &id, "login", "Đăng nhập hệ thống");
    }

    Ok(LoginResponse {
        token,
        user: User {
            id,
            name,
            email: email_db,
            role,
            status,
            created_at,
        },
    })
}

#[tauri::command]
pub fn logout(token: String, sessions: State<Sessions>) -> AppResult<()> {
    sessions.0.lock().remove(&token);
    Ok(())
}

#[tauri::command]
pub fn change_own_password(
    token: String,
    current_password: String,
    new_password: String,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<()> {
    let user = current_user(&db, &sessions, &token)?;
    if new_password.len() < 8 {
        return Err(AppError::new("Mật khẩu mới phải có tối thiểu 8 ký tự."));
    }
    let conn = db.0.lock();
    let hash: String =
        conn.query_row("SELECT password_hash FROM users WHERE id = ?1", [&user.id], |r| r.get(0))?;
    if !bcrypt::verify(&current_password, &hash).unwrap_or(false) {
        return Err(AppError::new("Mật khẩu hiện tại không đúng."));
    }
    let new_hash = bcrypt::hash(&new_password, 12)?;
    conn.execute(
        "UPDATE users SET password_hash = ?2, updated_at = ?3 WHERE id = ?1",
        rusqlite::params![user.id, new_hash, crate::util::now_iso()],
    )?;
    write_audit(&conn, &user.id, "account.change_password", "Tự đổi mật khẩu")?;
    Ok(())
}

#[tauri::command]
pub fn me(token: String, db: State<Db>, sessions: State<Sessions>) -> AppResult<User> {
    let user = current_user(&db, &sessions, &token)?;
    let conn = db.0.lock();
    let u = conn.query_row(
        "SELECT id,name,email,role,status,created_at FROM users WHERE id = ?1",
        [&user.id],
        |r| {
            Ok(User {
                id: r.get(0)?,
                name: r.get(1)?,
                email: r.get(2)?,
                role: r.get(3)?,
                status: r.get(4)?,
                created_at: r.get(5)?,
            })
        },
    )?;
    Ok(u)
}
