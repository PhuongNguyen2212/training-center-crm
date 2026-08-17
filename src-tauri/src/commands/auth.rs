use crate::auth::{
    clear_failures, current_user, is_locked, record_failure, write_audit, LoginGuard, Sessions,
};
use crate::db::{query_opt, Db};
use crate::error::{AppError, AppResult};
use crate::models::{LoginResponse, User};
use crate::util::new_id;
#[cfg(feature = "desktop")]
use tauri::State;

type UserRow = (String, String, String, String, String, String, i64, String);

// ---- Transport-agnostic logic (shared by Tauri commands and the HTTP API) ----

pub async fn login_impl(
    email: &str,
    password: &str,
    db: &Db,
    sessions: &Sessions,
    guard: &LoginGuard,
) -> AppResult<LoginResponse> {
    let key = email.trim().to_lowercase();

    if let Some(ms) = is_locked(guard, &key) {
        let mins = (ms / 60_000) + 1;
        return Err(AppError::new(format!(
            "Tài khoản tạm khóa do nhập sai nhiều lần. Thử lại sau ~{mins} phút."
        )));
    }

    let row: Option<UserRow> = query_opt(
        &db.conn,
        "SELECT id,name,email,role,status,password_hash,must_change_password,created_at
         FROM users WHERE lower(email) = ?1",
        libsql::params![key.clone()],
        |r| {
            Ok((
                r.get::<String>(0)?,
                r.get::<String>(1)?,
                r.get::<String>(2)?,
                r.get::<String>(3)?,
                r.get::<String>(4)?,
                r.get::<String>(5)?,
                r.get::<i64>(6)?,
                r.get::<String>(7)?,
            ))
        },
    )
    .await?;

    let (id, name, email_db, role, status, hash, must_change, created_at) = match row {
        Some(t) => t,
        None => {
            record_failure(guard, &key);
            return Err(AppError::new("Email hoặc mật khẩu không đúng."));
        }
    };

    if !bcrypt::verify(password, &hash).unwrap_or(false) {
        let locked = record_failure(guard, &key);
        let _ = write_audit(&db.conn, &id, "login.failed", "Đăng nhập sai").await;
        return Err(AppError::new(if locked {
            "Sai quá số lần cho phép. Tài khoản bị khóa 5 phút."
        } else {
            "Email hoặc mật khẩu không đúng."
        }));
    }

    if status == "suspended" {
        let _ = write_audit(&db.conn, &id, "login.blocked", "Tài khoản bị treo").await;
        return Err(AppError::new(
            "Tài khoản đã bị treo. Liên hệ quản trị viên.",
        ));
    }

    clear_failures(guard, &key);
    let token = new_id();
    sessions.insert(&token, &id);
    let _ = write_audit(&db.conn, &id, "login", "Đăng nhập hệ thống").await;

    Ok(LoginResponse {
        token,
        user: User {
            id,
            name,
            email: email_db,
            role,
            status,
            must_change_password: must_change != 0,
            created_at,
        },
    })
}

pub async fn me_impl(token: &str, db: &Db, sessions: &Sessions) -> AppResult<User> {
    let user = current_user(db, sessions, token).await?;
    query_opt(
        &db.conn,
        "SELECT id,name,email,role,status,must_change_password,created_at FROM users WHERE id = ?1",
        libsql::params![user.id.clone()],
        |r| {
            Ok(User {
                id: r.get(0)?,
                name: r.get(1)?,
                email: r.get(2)?,
                role: r.get(3)?,
                status: r.get(4)?,
                must_change_password: r.get::<i64>(5)? != 0,
                created_at: r.get(6)?,
            })
        },
    )
    .await?
    .ok_or_else(|| AppError::new("Người dùng không tồn tại."))
}

pub async fn change_own_password_impl(
    token: &str,
    current_password: &str,
    new_password: &str,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<()> {
    let user = current_user(db, sessions, token).await?;
    if new_password.len() < 8 {
        return Err(AppError::new("Mật khẩu mới phải có tối thiểu 8 ký tự."));
    }
    let hash = query_opt(
        &db.conn,
        "SELECT password_hash FROM users WHERE id = ?1",
        libsql::params![user.id.clone()],
        |r| r.get::<String>(0),
    )
    .await?
    .ok_or_else(|| AppError::new("Người dùng không tồn tại."))?;
    if !bcrypt::verify(current_password, &hash).unwrap_or(false) {
        return Err(AppError::new("Mật khẩu hiện tại không đúng."));
    }
    let new_hash = bcrypt::hash(new_password, 12)?;
    db.conn
        .execute(
            // Setting a password of one's own choosing clears the change-me flag.
            "UPDATE users SET password_hash = ?2, must_change_password = 0, updated_at = ?3
             WHERE id = ?1",
            libsql::params![user.id.clone(), new_hash, crate::util::now_iso()],
        )
        .await?;
    write_audit(
        &db.conn,
        &user.id,
        "account.change_password",
        "Tự đổi mật khẩu",
    )
    .await?;
    Ok(())
}

// ---- Tauri command wrappers ----

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn login(
    email: String,
    password: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    guard: State<'_, LoginGuard>,
) -> AppResult<LoginResponse> {
    login_impl(&email, &password, &db.fresh(), &sessions, &guard).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub fn logout(token: String, sessions: State<Sessions>) -> AppResult<()> {
    sessions.remove(&token);
    Ok(())
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn change_own_password(
    token: String,
    current_password: String,
    new_password: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<()> {
    change_own_password_impl(
        &token,
        &current_password,
        &new_password,
        &db.fresh(),
        &sessions,
    )
    .await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn me(
    token: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<User> {
    me_impl(&token, &db.fresh(), &sessions).await
}
