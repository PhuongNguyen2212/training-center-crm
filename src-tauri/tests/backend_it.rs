//! DB-backed tests for the security-critical `*_impl` command functions, run
//! against an in-memory libSQL database. Gated on the `db-tests` feature
//! (`cargo test --features db-tests`) because the in-memory backend needs the
//! C/`core` build available in CI. The whole file compiles to nothing without it.
#![cfg(feature = "db-tests")]

use app_lib::testkit::*;

/// Build a seeded in-memory DB plus empty session/guard state.
async fn setup() -> (Db, Sessions, LoginGuard) {
    let db = open_memory().await.expect("open in-memory db");
    seed_if_empty(&db.conn).await.expect("seed");
    (db, empty_sessions(), empty_guard())
}

/// Log in a seeded account and return its bearer token.
async fn login(db: &Db, sessions: &Sessions, guard: &LoginGuard, email: &str, pw: &str) -> String {
    login_impl(email, pw, db, sessions, guard)
        .await
        .expect("login should succeed")
        .token
}

#[tokio::test]
async fn soft_delete_hides_student_and_is_idempotent_guarded() {
    let (db, sessions, guard) = setup().await;
    let token = login(&db, &sessions, &guard, "admin@trungtam.vn", "admin123").await;

    let before = list_students_impl(&token, &db, &sessions).await.unwrap();
    assert!(before.iter().any(|s| s.id == "s-1"), "s-1 seeded");

    soft_delete_student_impl(&token, "s-1", &db, &sessions)
        .await
        .expect("admin can soft-delete");

    let after = list_students_impl(&token, &db, &sessions).await.unwrap();
    assert!(
        !after.iter().any(|s| s.id == "s-1"),
        "soft-deleted student is excluded from the list"
    );
    assert_eq!(after.len(), before.len() - 1);

    // Deleting again finds nothing (the row is already hidden).
    assert!(
        soft_delete_student_impl(&token, "s-1", &db, &sessions)
            .await
            .is_err(),
        "second delete reports not found"
    );
}

#[tokio::test]
async fn teacher_cannot_delete_students_role_revalidated() {
    let (db, sessions, guard) = setup().await;
    let token = login(&db, &sessions, &guard, "minh.gv@trungtam.vn", "teacher123").await;
    // StudentDelete is admin-only; the role is re-read from the DB, not trusted
    // from the caller.
    assert!(soft_delete_student_impl(&token, "s-1", &db, &sessions)
        .await
        .is_err());
}

#[tokio::test]
async fn suspended_user_is_rejected_after_status_change() {
    let (db, sessions, guard) = setup().await;
    let token = login(&db, &sessions, &guard, "admin@trungtam.vn", "admin123").await;

    // Token still valid right now.
    assert!(current_user(&db, &sessions, &token).await.is_ok());

    // Suspend the account in the DB; current_user must reject on the next call
    // because role/status are re-read every time.
    db.conn
        .execute("UPDATE users SET status='suspended' WHERE id='u-admin'", ())
        .await
        .unwrap();

    assert!(current_user(&db, &sessions, &token).await.is_err());
}

#[tokio::test]
async fn default_admin_is_forced_to_change_password_and_flag_clears() {
    let (db, sessions, guard) = setup().await;

    // The seeded admin carries the published default password → flagged.
    let resp = login_impl("admin@trungtam.vn", "admin123", &db, &sessions, &guard)
        .await
        .expect("admin logs in");
    assert!(
        resp.user.must_change_password,
        "seeded admin must be told to change the default password"
    );

    // Demo staff accounts are not flagged (friction-free demos).
    let teacher = login_impl("minh.gv@trungtam.vn", "teacher123", &db, &sessions, &guard)
        .await
        .expect("teacher logs in");
    assert!(!teacher.user.must_change_password);

    // Changing the password clears the flag…
    change_own_password_impl(&resp.token, "admin123", "Bao-mat-2026!", &db, &sessions)
        .await
        .expect("password change succeeds");
    let me = me_impl(&resp.token, &db, &sessions).await.unwrap();
    assert!(!me.must_change_password, "flag cleared after the change");

    // …the old password stops working, and the new one logs in unflagged.
    assert!(
        login_impl("admin@trungtam.vn", "admin123", &db, &sessions, &guard)
            .await
            .is_err(),
        "old default password rejected"
    );
    let again = login_impl("admin@trungtam.vn", "Bao-mat-2026!", &db, &sessions, &guard)
        .await
        .expect("new password accepted");
    assert!(!again.user.must_change_password);
}

#[tokio::test]
async fn attendance_is_append_only_with_override_on_recorrection() {
    let (db, sessions, guard) = setup().await;
    let token = login(&db, &sessions, &guard, "admin@trungtam.vn", "admin123").await;

    // A session is required (FK). Seed has no sessions, so insert one owned by a
    // seeded teacher, with no class.
    db.conn
        .execute(
            "INSERT INTO sessions (id,google_event_id,title,start_time,end_time,teacher_id,class_id,created_at,updated_at)
             VALUES ('sess-1',NULL,'Lớp A - Buổi 1','2026-01-01T09:00:00Z','2026-01-01T11:00:00Z','u-teacher-1',NULL,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            (),
        )
        .await
        .unwrap();
    // Attendance is only accepted for students on the session roster.
    add_session_students_impl(&token, "sess-1".into(), vec!["s-1".into()], &db, &sessions)
        .await
        .unwrap();

    // First mark: not an override.
    let first = mark_attendance_impl(
        &token,
        "s-1".into(),
        "sess-1".into(),
        "present".into(),
        &db,
        &sessions,
    )
    .await
    .unwrap();
    assert!(!first.is_override);

    // Correction: a second mark must insert a NEW override row, not edit the first.
    let second = mark_attendance_impl(
        &token,
        "s-1".into(),
        "sess-1".into(),
        "absent".into(),
        &db,
        &sessions,
    )
    .await
    .unwrap();
    assert!(second.is_override);
    assert_ne!(first.id, second.id, "override is a distinct row");

    // Both rows persist (the original is never overwritten — legal proof trail).
    let rows = list_attendance_impl(&token, &db, &sessions).await.unwrap();
    let for_pair = rows
        .iter()
        .filter(|a| a.student_id == "s-1" && a.session_id == "sess-1")
        .count();
    assert_eq!(for_pair, 2, "append-only keeps the history");
}

#[tokio::test]
async fn session_with_attendance_cannot_be_deleted_and_roster_is_backfilled() {
    let (db, sessions, guard) = setup().await;
    let token = login(&db, &sessions, &guard, "admin@trungtam.vn", "admin123").await;

    // Pre-roster data: attendance exists but the student is not on the roster.
    db.conn
        .execute(
            "INSERT INTO sessions (id,google_event_id,title,start_time,end_time,teacher_id,class_id,created_at,updated_at)
             VALUES ('sess-old',NULL,'Buổi cũ','2026-01-01T09:00:00Z','2026-01-01T11:00:00Z','u-teacher-1',NULL,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')",
            (),
        )
        .await
        .unwrap();
    db.conn
        .execute(
            "INSERT INTO attendance (id,student_id,session_id,status,marked_by,marked_at,is_override,created_at)
             VALUES ('att-old','s-1','sess-old','absent','u-admin','2026-01-01T09:05:00Z',0,'2026-01-01T09:05:00Z')",
            (),
        )
        .await
        .unwrap();

    // Deleting is refused with a readable error (not a raw FK failure).
    let gcal = GCal::from_env(); // no env -> disabled
    let err = delete_session_impl(&token, "sess-old".into(), &db, &sessions, &gcal)
        .await
        .unwrap_err();
    assert!(err.to_string().contains("không thể xóa"), "got: {err}");

    // Backfill puts the marked student back on the roster (and is idempotent).
    backfill_rosters(&db.conn).await.unwrap();
    backfill_rosters(&db.conn).await.unwrap();
    let list = list_sessions_impl(&token, &db, &sessions).await.unwrap();
    let old = list.iter().find(|s| s.id == "sess-old").unwrap();
    assert_eq!(old.student_ids, vec!["s-1".to_string()]);
}

#[tokio::test]
async fn session_survives_server_restart() {
    let (db, sessions, guard) = setup().await;
    let token = login(&db, &sessions, &guard, "admin@trungtam.vn", "admin123").await;

    // A restart loses the in-memory map; the DB row must bring the session back.
    let after_restart = empty_sessions();
    let user = current_user(&db, &after_restart, &token)
        .await
        .expect("session restored from DB");
    assert_eq!(user.id, "u-admin");

    // The raw token is never stored, only its hash.
    let raw_hits: i64 = {
        let mut rows = db
            .conn
            .query(
                "SELECT COUNT(*) FROM auth_sessions WHERE token_hash = ?1",
                libsql::params![token.clone()],
            )
            .await
            .unwrap();
        rows.next().await.unwrap().unwrap().get(0).unwrap()
    };
    assert_eq!(raw_hits, 0);
}

#[tokio::test]
async fn expired_session_is_not_restored_after_restart() {
    let (db, sessions, guard) = setup().await;
    let token = login(&db, &sessions, &guard, "admin@trungtam.vn", "admin123").await;
    // Last activity two hours ago → past the 60-minute idle window.
    db.conn
        .execute(
            "UPDATE auth_sessions SET last_seen_ms = last_seen_ms - 7200000",
            (),
        )
        .await
        .unwrap();
    assert!(current_user(&db, &empty_sessions(), &token).await.is_err());
}

#[tokio::test]
async fn logout_ends_session_even_after_restart() {
    let (db, sessions, guard) = setup().await;
    let token = login(&db, &sessions, &guard, "admin@trungtam.vn", "admin123").await;
    logout_impl(&token, &db, &sessions).await.unwrap();
    assert!(current_user(&db, &sessions, &token).await.is_err());
    assert!(current_user(&db, &empty_sessions(), &token).await.is_err());
}

#[tokio::test]
async fn admin_password_reset_and_suspend_revoke_sessions() {
    let (db, sessions, guard) = setup().await;
    let admin = login(&db, &sessions, &guard, "admin@trungtam.vn", "admin123").await;
    let teacher = login(&db, &sessions, &guard, "minh.gv@trungtam.vn", "teacher123").await;
    let teacher_id = current_user(&db, &sessions, &teacher).await.unwrap().id;

    reset_user_password_impl(
        &admin,
        teacher_id.clone(),
        "newpass123".into(),
        &db,
        &sessions,
    )
    .await
    .unwrap();
    assert!(current_user(&db, &sessions, &teacher).await.is_err());
    assert!(current_user(&db, &empty_sessions(), &teacher)
        .await
        .is_err());
    // The admin's own session is untouched.
    assert!(current_user(&db, &sessions, &admin).await.is_ok());

    let again = login(&db, &sessions, &guard, "minh.gv@trungtam.vn", "newpass123").await;
    set_user_status_impl(&admin, teacher_id, "suspended".into(), &db, &sessions)
        .await
        .unwrap();
    // Gone from the DB too, not merely blocked by the status check.
    let rows: i64 = {
        let mut r = db
            .conn
            .query(
                "SELECT COUNT(*) FROM auth_sessions WHERE user_id != 'u-admin'",
                (),
            )
            .await
            .unwrap();
        r.next().await.unwrap().unwrap().get(0).unwrap()
    };
    assert_eq!(rows, 0);
    assert!(current_user(&db, &sessions, &again).await.is_err());
}
