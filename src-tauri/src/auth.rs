use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::util::now_ms;
use parking_lot::Mutex;
use std::collections::HashMap;

pub const MAX_FAILED_ATTEMPTS: u32 = 5;
pub const LOCKOUT_MS: i64 = 5 * 60_000;

/// A session ends after 60 minutes of inactivity…
pub const SESSION_IDLE_MS: i64 = 60 * 60_000;
/// …or 12 hours after login, whichever comes first (absolute lifetime).
pub const SESSION_ABSOLUTE_MS: i64 = 12 * 3_600_000;

/// One logged-in session: who it belongs to and when it was created/last used.
pub struct SessionEntry {
    pub user_id: String,
    pub created_ms: i64,
    pub last_seen_ms: i64,
}

/// token -> session. In-memory; cleared when the app restarts. All access goes
/// through the methods below so expiry is enforced in exactly one place.
pub struct Sessions(pub Mutex<HashMap<String, SessionEntry>>);

impl Sessions {
    /// Register a fresh session for `user_id` under `token`.
    pub fn insert(&self, token: &str, user_id: &str) {
        let now = now_ms();
        self.0.lock().insert(
            token.to_string(),
            SessionEntry {
                user_id: user_id.to_string(),
                created_ms: now,
                last_seen_ms: now,
            },
        );
    }

    /// Drop a session (logout).
    pub fn remove(&self, token: &str) {
        self.0.lock().remove(token);
    }

    /// Resolve a token to its user id, enforcing idle + absolute expiry.
    /// A live session has its `last_seen_ms` refreshed (sliding idle window);
    /// an expired one is evicted and `None` is returned.
    pub fn resolve(&self, token: &str) -> Option<String> {
        let now = now_ms();
        let mut map = self.0.lock();
        let expired = match map.get(token) {
            None => return None,
            Some(e) => {
                now - e.created_ms > SESSION_ABSOLUTE_MS || now - e.last_seen_ms > SESSION_IDLE_MS
            }
        };
        if expired {
            map.remove(token);
            return None;
        }
        let e = map.get_mut(token).expect("checked above");
        e.last_seen_ms = now;
        Some(e.user_id.clone())
    }
}

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
    let user_id = sessions
        .resolve(token)
        .ok_or_else(|| AppError::new("Chưa đăng nhập hoặc phiên đã hết hạn."))?;

    let row = crate::db::query_opt(
        &db.conn,
        "SELECT role, status FROM users WHERE id = ?1",
        libsql::params![user_id.clone()],
        |r| Ok((r.get::<String>(0)?, r.get::<String>(1)?)),
    )
    .await?;
    let (role, status) = row.ok_or_else(|| AppError::new("Người dùng không tồn tại."))?;

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
        let admin = AuthUser {
            id: "x".into(),
            role: "admin".into(),
        };
        let teacher = AuthUser {
            id: "y".into(),
            role: "teacher".into(),
        };
        assert!(require_role(&admin, &["admin"]).is_ok());
        assert!(require_role(&teacher, &["admin"]).is_err());
    }

    #[test]
    fn capability_mirrors_matrix_deny_by_default() {
        let teacher = AuthUser {
            id: "t".into(),
            role: "teacher".into(),
        };
        let sales = AuthUser {
            id: "s".into(),
            role: "salesperson".into(),
        };
        let finance = AuthUser {
            id: "f".into(),
            role: "finance_staff".into(),
        };
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
    fn admin_is_allowed_every_capability() {
        use Capability::*;
        let admin = AuthUser {
            id: "a".into(),
            role: "admin".into(),
        };
        for cap in [
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
        ] {
            assert!(require_capability(&admin, cap).is_ok());
        }
    }

    #[test]
    fn unknown_role_is_denied_by_default() {
        use Capability::*;
        let stranger = AuthUser {
            id: "z".into(),
            role: "intern".into(), // not in the matrix
        };
        for cap in [
            StudentView,
            ScheduleView,
            PaymentView,
            AttendanceMark,
            ManageUsers,
        ] {
            assert!(require_capability(&stranger, cap).is_err());
        }
    }

    #[test]
    fn salesperson_edits_students_but_not_schedule_or_attendance() {
        let sales = AuthUser {
            id: "s".into(),
            role: "salesperson".into(),
        };
        assert!(require_capability(&sales, Capability::StudentEdit).is_ok());
        assert!(require_capability(&sales, Capability::ScheduleView).is_err());
        assert!(require_capability(&sales, Capability::AttendanceView).is_err());
    }

    #[test]
    fn session_resolves_and_refreshes_idle_window() {
        let sessions = Sessions(Mutex::new(HashMap::new()));
        assert!(sessions.resolve("missing").is_none());

        sessions.insert("tok", "u-1");
        let seen_before = sessions.0.lock().get("tok").unwrap().last_seen_ms;
        // Backdate activity a bit (still inside the idle window)…
        sessions.0.lock().get_mut("tok").unwrap().last_seen_ms -= 10_000;
        assert_eq!(sessions.resolve("tok").as_deref(), Some("u-1"));
        // …and a successful resolve slides the window forward again.
        assert!(sessions.0.lock().get("tok").unwrap().last_seen_ms >= seen_before - 1_000);
    }

    #[test]
    fn session_expires_after_idle_timeout() {
        let sessions = Sessions(Mutex::new(HashMap::new()));
        sessions.insert("tok", "u-1");
        sessions.0.lock().get_mut("tok").unwrap().last_seen_ms -= SESSION_IDLE_MS + 60_000;
        assert!(
            sessions.resolve("tok").is_none(),
            "idle-expired session rejected"
        );
        assert!(
            sessions.0.lock().get("tok").is_none(),
            "expired session evicted"
        );
    }

    #[test]
    fn session_expires_after_absolute_lifetime_despite_activity() {
        let sessions = Sessions(Mutex::new(HashMap::new()));
        sessions.insert("tok", "u-1");
        // Recently active, but created beyond the absolute lifetime.
        sessions.0.lock().get_mut("tok").unwrap().created_ms -= SESSION_ABSOLUTE_MS + 60_000;
        assert!(
            sessions.resolve("tok").is_none(),
            "absolute-expired session rejected"
        );
    }

    #[test]
    fn logout_removes_session() {
        let sessions = Sessions(Mutex::new(HashMap::new()));
        sessions.insert("tok", "u-1");
        sessions.remove("tok");
        assert!(sessions.resolve("tok").is_none());
    }

    #[test]
    fn below_threshold_does_not_lock_and_clear_resets() {
        let guard = LoginGuard(Mutex::new(HashMap::new()));
        // One short of the limit: not locked yet.
        for _ in 0..MAX_FAILED_ATTEMPTS - 1 {
            assert!(!record_failure(&guard, "x@b.vn"));
        }
        assert!(is_locked(&guard, "x@b.vn").is_none());
        // A successful login clears the counter, so the next failure starts fresh.
        clear_failures(&guard, "x@b.vn");
        assert!(!record_failure(&guard, "x@b.vn"));
        assert!(is_locked(&guard, "x@b.vn").is_none());
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
