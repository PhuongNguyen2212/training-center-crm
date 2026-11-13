use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::util::now_ms;
use libsql::Connection;
use parking_lot::Mutex;
use std::collections::HashMap;

pub const MAX_FAILED_ATTEMPTS: u32 = 5;
pub const LOCKOUT_MS: i64 = 5 * 60_000;

/// A session ends after 60 minutes of inactivity…
pub const SESSION_IDLE_MS: i64 = 60 * 60_000;
/// …or 12 hours after login, whichever comes first (absolute lifetime).
pub const SESSION_ABSOLUTE_MS: i64 = 12 * 3_600_000;

/// Write a session's `last_seen_ms` back to the DB at most this often, so a
/// busy user doesn't cost one extra DB write per request. After a restart the
/// idle window may therefore be up to this much shorter than 60 minutes.
pub const SESSION_PERSIST_EVERY_MS: i64 = 60_000;

/// One logged-in session: who it belongs to and when it was created/last used.
pub struct SessionEntry {
    pub user_id: String,
    pub created_ms: i64,
    pub last_seen_ms: i64,
    /// The `last_seen_ms` value last written to the DB.
    pub persisted_ms: i64,
}

/// token -> session. The map is a cache in front of the `auth_sessions` table,
/// so sessions survive a server restart / redeploy: a token missing from memory
/// is looked up in the DB. Only a SHA-256 of the token is stored, so a DB dump
/// does not hand out live tokens. All access goes through the methods below so
/// expiry is enforced in exactly one place.
pub struct Sessions(pub Mutex<HashMap<String, SessionEntry>>);

/// Outcome of checking a token against the in-memory cache.
enum Cached {
    Live {
        user_id: String,
        persist: Option<i64>,
    },
    Expired,
    Missing,
}

fn is_expired(now: i64, created_ms: i64, last_seen_ms: i64) -> bool {
    now - created_ms > SESSION_ABSOLUTE_MS || now - last_seen_ms > SESSION_IDLE_MS
}

/// Hex SHA-256 of a token — the DB key, never the raw token.
pub fn token_hash(token: &str) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(token.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

impl Sessions {
    /// Register a fresh session for `user_id` under `token`, in memory and DB.
    /// Also prunes expired rows so the table doesn't grow without bound.
    pub async fn insert(&self, conn: &Connection, token: &str, user_id: &str) -> AppResult<()> {
        let now = now_ms();
        conn.execute(
            "INSERT INTO auth_sessions (token_hash,user_id,created_ms,last_seen_ms)
             VALUES (?1,?2,?3,?3)",
            libsql::params![token_hash(token), user_id.to_string(), now],
        )
        .await?;
        conn.execute(
            "DELETE FROM auth_sessions WHERE created_ms < ?1 OR last_seen_ms < ?2",
            libsql::params![now - SESSION_ABSOLUTE_MS, now - SESSION_IDLE_MS],
        )
        .await?;
        self.insert_local(token, user_id, now, now);
        Ok(())
    }

    fn insert_local(&self, token: &str, user_id: &str, created_ms: i64, last_seen_ms: i64) {
        self.0.lock().insert(
            token.to_string(),
            SessionEntry {
                user_id: user_id.to_string(),
                created_ms,
                last_seen_ms,
                persisted_ms: last_seen_ms,
            },
        );
    }

    /// Drop a session (logout), in memory and DB.
    pub async fn remove(&self, conn: &Connection, token: &str) -> AppResult<()> {
        self.0.lock().remove(token);
        conn.execute(
            "DELETE FROM auth_sessions WHERE token_hash = ?1",
            libsql::params![token_hash(token)],
        )
        .await?;
        Ok(())
    }

    /// Check the in-memory cache, sliding the idle window of a live session.
    fn resolve_cached(&self, token: &str, now: i64) -> Cached {
        let mut map = self.0.lock();
        let Some(e) = map.get_mut(token) else {
            return Cached::Missing;
        };
        if is_expired(now, e.created_ms, e.last_seen_ms) {
            map.remove(token);
            return Cached::Expired;
        }
        e.last_seen_ms = now;
        let persist = (now - e.persisted_ms >= SESSION_PERSIST_EVERY_MS).then(|| {
            e.persisted_ms = now;
            now
        });
        Cached::Live {
            user_id: e.user_id.clone(),
            persist,
        }
    }

    /// Resolve a token to its user id, enforcing idle + absolute expiry.
    /// A live session has its last-seen time refreshed (sliding idle window);
    /// an expired one is evicted and `None` is returned.
    pub async fn resolve(&self, conn: &Connection, token: &str) -> AppResult<Option<String>> {
        if token.is_empty() {
            return Ok(None);
        }
        let now = now_ms();
        match self.resolve_cached(token, now) {
            Cached::Live { user_id, persist } => {
                if let Some(ts) = persist {
                    conn.execute(
                        "UPDATE auth_sessions SET last_seen_ms = ?2 WHERE token_hash = ?1",
                        libsql::params![token_hash(token), ts],
                    )
                    .await?;
                }
                Ok(Some(user_id))
            }
            Cached::Expired => {
                self.remove(conn, token).await?;
                Ok(None)
            }
            Cached::Missing => {
                // Not in memory: the server may have restarted since login.
                let row = crate::db::query_opt(
                    conn,
                    "SELECT user_id,created_ms,last_seen_ms FROM auth_sessions
                     WHERE token_hash = ?1",
                    libsql::params![token_hash(token)],
                    |r| Ok((r.get::<String>(0)?, r.get::<i64>(1)?, r.get::<i64>(2)?)),
                )
                .await?;
                let Some((user_id, created_ms, last_seen_ms)) = row else {
                    return Ok(None);
                };
                if is_expired(now, created_ms, last_seen_ms) {
                    self.remove(conn, token).await?;
                    return Ok(None);
                }
                self.insert_local(token, &user_id, created_ms, last_seen_ms);
                // Slide the window (and persist, since last_seen is stale).
                Box::pin(self.resolve(conn, token)).await
            }
        }
    }

    /// End every session of one user (e.g. after a password change or reset).
    pub async fn remove_user(&self, conn: &Connection, user_id: &str) -> AppResult<()> {
        self.0.lock().retain(|_, e| e.user_id != user_id);
        conn.execute(
            "DELETE FROM auth_sessions WHERE user_id = ?1",
            libsql::params![user_id.to_string()],
        )
        .await?;
        Ok(())
    }
}

#[derive(Default, Clone)]
pub struct Attempt {
    pub fails: u32,
    pub locked_until: i64,
}

/// email(lowercased) -> failed-login state, for brute-force lockout.
pub struct LoginGuard(pub Mutex<HashMap<String, Attempt>>);

/// Role names as stored in `users.role`. Compare against these constants, not
/// string literals — a typo in a literal silently mis-grants permissions,
/// while a typo here fails to compile.
pub mod role {
    pub const ADMIN: &str = "admin";
    pub const TEACHER: &str = "teacher";
    pub const SALESPERSON: &str = "salesperson";
    pub const FINANCE: &str = "finance_staff";
}

pub struct AuthUser {
    pub id: String,
    pub role: String,
}

impl AuthUser {
    pub fn is_admin(&self) -> bool {
        self.role == role::ADMIN
    }
    pub fn is_teacher(&self) -> bool {
        self.role == role::TEACHER
    }
    pub fn is_salesperson(&self) -> bool {
        self.role == role::SALESPERSON
    }
}

/// Resolve a session token to the current user, **re-reading role and status
/// from the DB** (never trusting anything the frontend passes beyond the token).
pub async fn current_user(db: &Db, sessions: &Sessions, token: &str) -> AppResult<AuthUser> {
    let user_id = sessions
        .resolve(&db.conn, token)
        .await?
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
    StudentCreate,
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
}

impl Capability {
    /// Roles allowed to perform this action. **Deny-by-default**: a role not
    /// listed here cannot perform the capability. Per-record "own" scoping
    /// (teacher's own classes, salesperson's own referrals) is enforced
    /// separately in each query — this is only the coarse gate.
    fn allowed_roles(self) -> &'static [&'static str] {
        use role::{ADMIN, FINANCE, SALESPERSON, TEACHER};
        use Capability::*;
        match self {
            ScheduleView => &[ADMIN, TEACHER],
            ScheduleEdit => &[ADMIN],
            StudentView => &[ADMIN, TEACHER, SALESPERSON, FINANCE],
            // Teachers may add new students (e.g. a walk-in at their session)
            // but not edit or delete existing ones.
            StudentCreate => &[ADMIN, SALESPERSON, TEACHER],
            StudentEdit => &[ADMIN, SALESPERSON],
            StudentDelete => &[ADMIN],
            AttendanceView | AttendanceMark => &[ADMIN, TEACHER],
            HomeworkView | HomeworkRecord => &[ADMIN, TEACHER],
            PaymentView => &[ADMIN, SALESPERSON, FINANCE],
            PaymentUpload => &[ADMIN, FINANCE],
            PaymentDelete => &[ADMIN],
            ManageUsers => &[ADMIN],
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
            StudentCreate,
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
    fn teacher_creates_students_but_cannot_edit_or_delete_them() {
        let teacher = AuthUser {
            id: "t".into(),
            role: "teacher".into(),
        };
        assert!(require_capability(&teacher, Capability::StudentCreate).is_ok());
        assert!(require_capability(&teacher, Capability::StudentEdit).is_err());
        assert!(require_capability(&teacher, Capability::StudentDelete).is_err());
    }

    fn live_user(c: Cached) -> Option<String> {
        match c {
            Cached::Live { user_id, .. } => Some(user_id),
            _ => None,
        }
    }

    fn sessions_with(token: &str, user_id: &str) -> Sessions {
        let s = Sessions(Mutex::new(HashMap::new()));
        let now = now_ms();
        s.insert_local(token, user_id, now, now);
        s
    }

    #[test]
    fn session_resolves_and_refreshes_idle_window() {
        let sessions = sessions_with("tok", "u-1");
        assert!(matches!(
            sessions.resolve_cached("missing", now_ms()),
            Cached::Missing
        ));

        let seen_before = sessions.0.lock().get("tok").unwrap().last_seen_ms;
        // Backdate activity a bit (still inside the idle window)…
        sessions.0.lock().get_mut("tok").unwrap().last_seen_ms -= 10_000;
        let got = sessions.resolve_cached("tok", now_ms());
        assert_eq!(live_user(got).as_deref(), Some("u-1"));
        // …and a successful resolve slides the window forward again.
        assert!(sessions.0.lock().get("tok").unwrap().last_seen_ms >= seen_before);
    }

    #[test]
    fn session_persists_last_seen_at_most_once_per_interval() {
        let sessions = sessions_with("tok", "u-1");
        let now = now_ms();
        // Just written at login → no DB write needed yet.
        assert!(matches!(
            sessions.resolve_cached("tok", now),
            Cached::Live { persist: None, .. }
        ));
        // A minute later → write back once…
        let later = now + SESSION_PERSIST_EVERY_MS;
        assert!(matches!(
            sessions.resolve_cached("tok", later),
            Cached::Live { persist: Some(t), .. } if t == later
        ));
        // …and not again on the very next request.
        assert!(matches!(
            sessions.resolve_cached("tok", later + 1),
            Cached::Live { persist: None, .. }
        ));
    }

    #[test]
    fn session_expires_after_idle_timeout() {
        let sessions = sessions_with("tok", "u-1");
        sessions.0.lock().get_mut("tok").unwrap().last_seen_ms -= SESSION_IDLE_MS + 60_000;
        assert!(
            matches!(sessions.resolve_cached("tok", now_ms()), Cached::Expired),
            "idle-expired session rejected"
        );
        assert!(
            sessions.0.lock().get("tok").is_none(),
            "expired session evicted"
        );
    }

    #[test]
    fn session_expires_after_absolute_lifetime_despite_activity() {
        let sessions = sessions_with("tok", "u-1");
        // Recently active, but created beyond the absolute lifetime.
        sessions.0.lock().get_mut("tok").unwrap().created_ms -= SESSION_ABSOLUTE_MS + 60_000;
        assert!(
            matches!(sessions.resolve_cached("tok", now_ms()), Cached::Expired),
            "absolute-expired session rejected"
        );
    }

    #[test]
    fn token_hash_is_stable_hex_and_hides_the_token() {
        let h = token_hash("abc");
        assert_eq!(
            h,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert!(!h.contains("abc"));
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
