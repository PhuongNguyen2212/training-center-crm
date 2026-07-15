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
