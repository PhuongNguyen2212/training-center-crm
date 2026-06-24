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
pub async fn current_user(db: &Db, sessions: &Sessions, token: &str) -> AppResult<AuthUser> {
    let user_id = {
        let map = sessions.0.lock();
        map.get(token)
            .cloned()
            .ok_or_else(|| AppError::new("Chưa đăng nhập hoặc phiên đã hết hạn."))?
    };

    let row = crate::db::query_opt(
        &db.conn,
        "SELECT role, status FROM users WHERE id = ?1",
        libsql::params![user_id.clone()],
        |r| Ok((r.get::<String>(0)?, r.get::<String>(1)?)),
    )
    .await?;
    let (role, status) =
        row.ok_or_else(|| AppError::new("Người dùng không tồn tại."))?;

    if status == "suspended" {
        return Err(AppError::new("Tài khoản đã bị treo."));
    }
    Ok(AuthUser { id: user_id, role })
}

/// Enforce that the current user's role is one of the allowed roles.
/// Internal building block for [`require_capability`].
pub fn require_role(user: &AuthUser, allowed: &[&str]) -> AppResult<()> {
    if allowed.contains(&user.role.as_str()) {
        Ok(())
    } else {
        Err(AppError::new("Bạn không có quyền thực hiện thao tác này."))
    }
}

/// A discrete action from the role permission matrix (CLAUDE.md). Commands ask
/// for a capability instead of hard-coding role lists, so the matrix lives in
/// exactly one place.
#[derive(Clone, Copy)]
pub enum Capability {
    ScheduleView,
    ScheduleEdit,
    StudentView,
    StudentEdit,
    StudentDelete,
    AttendanceView,
    AttendanceMark,
    HomeworkView,
    HomeworkRecord,
    PaymentView,
    PaymentUpload,
    PaymentDelete,
    ManageUsers,
    DbBackup,
    DbRestore,
}

impl Capability {
    /// Roles allowed to perform this action. **Deny-by-default**: a role not
    /// listed here cannot perform the capability. Per-record "own" scoping
    /// (teacher's own classes, salesperson's own referrals) is enforced
    /// separately in each query — this is only the coarse gate.
    fn allowed_roles(self) -> &'static [&'static str] {
        use Capability::*;
        match self {
            ScheduleView => &["admin", "teacher"],
            ScheduleEdit => &["admin"],
            StudentView => &["admin", "teacher", "salesperson", "finance_staff"],
            StudentEdit => &["admin", "salesperson"],
            StudentDelete => &["admin"],
            AttendanceView | AttendanceMark => &["admin", "teacher"],
            HomeworkView | HomeworkRecord => &["admin", "teacher"],
            PaymentView => &["admin", "salesperson", "finance_staff"],
            PaymentUpload => &["admin", "finance_staff"],
            PaymentDelete => &["admin"],
            ManageUsers => &["admin"],
            DbBackup | DbRestore => &["admin"],
        }
    }
}

/// Enforce that the current user's role grants `cap` (mirrors the matrix).
pub fn require_capability(user: &AuthUser, cap: Capability) -> AppResult<()> {
    require_role(user, cap.allowed_roles())
}

/// Insert an audit-log row using the shared libSQL connection.
pub async fn write_audit(
    conn: &libsql::Connection,
    user_id: &str,
    action: &str,
    detail: &str,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO audit_logs (id,user_id,action,detail,created_at) VALUES (?1,?2,?3,?4,?5)",
        libsql::params![
            crate::util::new_id(),
            user_id.to_string(),
            action.to_string(),
            detail.to_string(),
            crate::util::now_iso()
        ],
    )
    .await?;
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
    use std::collections::HashMap;

    // DB-backed tests (current_user/suspended) now require a live Turso
    // connection and live in integration tests, not here.

    #[test]
    fn require_role_allows_and_denies() {
        let admin = AuthUser { id: "x".into(), role: "admin".into() };
        let teacher = AuthUser { id: "y".into(), role: "teacher".into() };
        assert!(require_role(&admin, &["admin"]).is_ok());
        assert!(require_role(&teacher, &["admin"]).is_err());
    }

    #[test]
    fn capability_mirrors_matrix_deny_by_default() {
        let teacher = AuthUser { id: "t".into(), role: "teacher".into() };
        let sales = AuthUser { id: "s".into(), role: "salesperson".into() };
        let finance = AuthUser { id: "f".into(), role: "finance_staff".into() };
        // Teacher can mark attendance but not manage users or upload payments.
        assert!(require_capability(&teacher, Capability::AttendanceMark).is_ok());
        assert!(require_capability(&teacher, Capability::ManageUsers).is_err());
        assert!(require_capability(&teacher, Capability::PaymentUpload).is_err());
        // Salesperson views payments (read-only) but cannot upload/delete or mark attendance.
        assert!(require_capability(&sales, Capability::PaymentView).is_ok());
        assert!(require_capability(&sales, Capability::PaymentUpload).is_err());
        assert!(require_capability(&sales, Capability::AttendanceMark).is_err());
        // Finance uploads payments but has no attendance/schedule access.
        assert!(require_capability(&finance, Capability::PaymentUpload).is_ok());
        assert!(require_capability(&finance, Capability::ScheduleView).is_err());
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
