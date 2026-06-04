use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::util::now_ms;
use parking_lot::Mutex;
use std::collections::HashMap;

pub const MAX_FAILED_ATTEMPTS: u32 = 5;
pub const LOCKOUT_MS: i64 = 5 * 60_000;

/// token -> user_id. In-memory; cleared when the app restarts.
pub struct Sessions(pub Mutex<HashMap<String, String>>);

#[derive(Default, Clone)]
pub struct Attempt {
    pub fails: u32,
    pub locked_until: i64,
}

/// email(lowercased) -> failed-login state, for brute-force lockout.
pub struct LoginGuard(pub Mutex<HashMap<String, Attempt>>);

pub struct AuthUser {
    pub id: String,
    pub role: String,
}

/// Resolve a session token to the current user, **re-reading role and status
/// from the DB** (never trusting anything the frontend passes beyond the token).
pub fn current_user(db: &Db, sessions: &Sessions, token: &str) -> AppResult<AuthUser> {
    let user_id = {
        let map = sessions.0.lock();
        map.get(token)
            .cloned()
            .ok_or_else(|| AppError::new("Chưa đăng nhập hoặc phiên đã hết hạn."))?
    };

    let conn = db.0.lock();
    let (role, status): (String, String) = conn
        .query_row(
            "SELECT role, status FROM users WHERE id = ?1",
            [&user_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| AppError::new("Người dùng không tồn tại."))?;

    if status == "suspended" {
        return Err(AppError::new("Tài khoản đã bị treo."));
    }
    Ok(AuthUser { id: user_id, role })
}

/// Enforce that the current user's role is one of the allowed roles.
pub fn require_role(user: &AuthUser, allowed: &[&str]) -> AppResult<()> {
    if allowed.contains(&user.role.as_str()) {
        Ok(())
    } else {
        Err(AppError::new("Bạn không có quyền thực hiện thao tác này."))
    }
}

/// Insert an audit-log row. Caller already holds the DB lock and passes the
/// connection, so we never double-lock.
pub fn write_audit(
    conn: &rusqlite::Connection,
    user_id: &str,
    action: &str,
    detail: &str,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO audit_logs (id,user_id,action,detail,created_at) VALUES (?1,?2,?3,?4,?5)",
        rusqlite::params![crate::util::new_id(), user_id, action, detail, crate::util::now_iso()],
    )?;
    Ok(())
}

pub fn is_locked(guard: &LoginGuard, email_key: &str) -> Option<i64> {
    let map = guard.0.lock();
    match map.get(email_key) {
        Some(a) if a.locked_until > now_ms() => Some(a.locked_until - now_ms()),
        _ => None,
    }
}

pub fn record_failure(guard: &LoginGuard, email_key: &str) -> bool {
    let mut map = guard.0.lock();
    let entry = map.entry(email_key.to_string()).or_default();
    entry.fails += 1;
    if entry.fails >= MAX_FAILED_ATTEMPTS {
        entry.locked_until = now_ms() + LOCKOUT_MS;
        true
    } else {
        false
    }
}

pub fn clear_failures(guard: &LoginGuard, email_key: &str) {
    guard.0.lock().remove(email_key);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_memory, Db};
    use std::collections::HashMap;

    fn setup() -> (Db, Sessions) {
        (
            Db(Mutex::new(init_memory())),
            Sessions(Mutex::new(HashMap::new())),
        )
    }

    #[test]
    fn current_user_reads_role_from_db() {
        let (db, sessions) = setup();
        sessions.0.lock().insert("tok".into(), "u-admin".into());
        let u = current_user(&db, &sessions, "tok").unwrap();
        assert_eq!(u.role, "admin");
    }

    #[test]
    fn invalid_token_is_rejected() {
        let (db, sessions) = setup();
        assert!(current_user(&db, &sessions, "khong-co").is_err());
    }

    #[test]
    fn suspended_account_is_blocked() {
        let (db, sessions) = setup();
        db.0.lock()
            .execute("UPDATE users SET status='suspended' WHERE id='u-admin'", [])
            .unwrap();
        sessions.0.lock().insert("tok".into(), "u-admin".into());
        assert!(current_user(&db, &sessions, "tok").is_err());
    }

    #[test]
    fn require_role_allows_and_denies() {
        let admin = AuthUser { id: "x".into(), role: "admin".into() };
        let teacher = AuthUser { id: "y".into(), role: "teacher".into() };
        assert!(require_role(&admin, &["admin"]).is_ok());
        assert!(require_role(&teacher, &["admin"]).is_err());
    }

    #[test]
    fn lockout_triggers_after_max_attempts() {
        let guard = LoginGuard(Mutex::new(HashMap::new()));
        for _ in 0..MAX_FAILED_ATTEMPTS - 1 {
            assert!(!record_failure(&guard, "a@b.vn"));
        }
        assert!(record_failure(&guard, "a@b.vn")); // the MAX-th attempt locks
        assert!(is_locked(&guard, "a@b.vn").is_some());
        clear_failures(&guard, "a@b.vn");
        assert!(is_locked(&guard, "a@b.vn").is_none());
    }
}
