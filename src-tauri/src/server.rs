// HTTP API server (Axum) for web/mobile clients. Reuses the same logic as the
// Tauri commands (the `*_impl` functions) so there is a single source of truth
// for auth, permissions and data access. Holds the secrets server-side, so the
// browser never sees the Turso/R2 keys.

use crate::auth::{LoginGuard, Sessions};
use crate::commands::attendance::{
    list_attendance_impl, list_homework_impl, mark_attendance_impl, set_homework_impl,
};
use crate::commands::audit::{list_audit_impl, list_class_notifications_impl};
use crate::commands::auth::{change_own_password_impl, login_impl, me_impl};
use crate::commands::classes::{
    create_class_impl, delete_class_impl, enroll_student_impl, list_classes_impl,
    set_class_status_impl, unenroll_student_impl, update_class_impl,
};
use crate::commands::payments::{
    create_payment_doc_impl, list_payment_docs_impl, read_payment_doc_impl,
    soft_delete_payment_doc_impl,
};
use crate::commands::sessions::{
    create_session_impl, delete_session_impl, list_sessions_impl, update_session_impl,
};
use crate::commands::staff::{
    create_staff_impl, list_users_impl, reset_user_password_impl, set_user_status_impl,
    update_user_role_impl,
};
use crate::commands::students::{
    create_student_impl, list_students_impl, soft_delete_student_impl, update_student_impl,
};
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::{ClassInput, PaymentDocInput, SessionInput, StudentInput};
use crate::ratelimit::RateLimiter;
use axum::{
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post, put},
    Json, Router,
};
use parking_lot::Mutex;
use serde::Deserialize;
use serde::Serialize;
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone)]
struct AppState {
    db: Arc<Db>,
    sessions: Arc<Sessions>,
    guard: Arc<LoginGuard>,
    r2: Arc<crate::storage::R2>,
    gcal: Arc<crate::gcal::GCal>,
    limiter: Arc<RateLimiter>,
}

/// Per-IP rate limiting for every /api route. Render/Fly sit behind a proxy, so
/// the client address arrives in x-forwarded-for (first hop); fall back to a
/// shared bucket when absent (local dev).
async fn rate_limit_mw(
    State(st): State<AppState>,
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> Response {
    let ip = req
        .headers()
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "local".to_string());
    if !st.limiter.check(&ip) {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({ "message": "Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút." })),
        )
            .into_response();
    }
    next.run(req).await
}

/// Map an AppError to a JSON HTTP error (mirrors how Tauri rejects invoke).
fn err(e: AppError) -> Response {
    (
        StatusCode::BAD_REQUEST,
        Json(json!({ "message": e.message })),
    )
        .into_response()
}

/// Turn an `AppResult<T>` into a JSON response (Ok → body, Err → error JSON).
fn out<T: Serialize>(r: AppResult<T>) -> Response {
    match r {
        Ok(v) => Json(v).into_response(),
        Err(e) => err(e),
    }
}

/// Bearer token from the Authorization header (web sends it after login).
fn bearer(headers: &HeaderMap) -> String {
    headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .unwrap_or("")
        .to_string()
}

async fn health() -> &'static str {
    "ok"
}

#[derive(Deserialize)]
struct LoginBody {
    email: String,
    password: String,
}

async fn login(State(st): State<AppState>, Json(body): Json<LoginBody>) -> Response {
    match login_impl(&body.email, &body.password, &st.db, &st.sessions, &st.guard).await {
        Ok(resp) => Json(resp).into_response(),
        Err(e) => err(e),
    }
}

async fn me(State(st): State<AppState>, headers: HeaderMap) -> Response {
    out(me_impl(&bearer(&headers), &st.db, &st.sessions).await)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChangePwBody {
    current_password: String,
    new_password: String,
}
async fn change_password(
    State(st): State<AppState>,
    headers: HeaderMap,
    Json(b): Json<ChangePwBody>,
) -> Response {
    out(change_own_password_impl(
        &bearer(&headers),
        &b.current_password,
        &b.new_password,
        &st.db,
        &st.sessions,
    )
    .await)
}

// ---- Students ----
async fn students_list(State(st): State<AppState>, headers: HeaderMap) -> Response {
    out(list_students_impl(&bearer(&headers), &st.db, &st.sessions).await)
}
async fn students_create(
    State(st): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<StudentInput>,
) -> Response {
    out(create_student_impl(&bearer(&headers), body, &st.db, &st.sessions).await)
}
async fn students_update(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(body): Json<StudentInput>,
) -> Response {
    out(update_student_impl(&bearer(&headers), &id, body, &st.db, &st.sessions).await)
}
async fn students_delete(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    out(soft_delete_student_impl(&bearer(&headers), &id, &st.db, &st.sessions).await)
}

// ---- Classes ----
async fn classes_list(State(st): State<AppState>, headers: HeaderMap) -> Response {
    out(list_classes_impl(&bearer(&headers), &st.db, &st.sessions).await)
}
async fn classes_create(
    State(st): State<AppState>,
    headers: HeaderMap,
    Json(b): Json<ClassInput>,
) -> Response {
    out(create_class_impl(&bearer(&headers), b, &st.db, &st.sessions).await)
}
async fn classes_update(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(b): Json<ClassInput>,
) -> Response {
    out(update_class_impl(&bearer(&headers), id, b, &st.db, &st.sessions).await)
}
async fn classes_delete(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    out(delete_class_impl(&bearer(&headers), id, &st.db, &st.sessions).await)
}

#[derive(serde::Deserialize)]
struct StatusBody {
    status: String,
}
async fn classes_status(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(b): Json<StatusBody>,
) -> Response {
    out(set_class_status_impl(&bearer(&headers), id, b.status, &st.db, &st.sessions).await)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct EnrollBody {
    student_id: String,
}
async fn classes_enroll(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(b): Json<EnrollBody>,
) -> Response {
    out(enroll_student_impl(&bearer(&headers), id, b.student_id, &st.db, &st.sessions).await)
}
async fn classes_unenroll(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(b): Json<EnrollBody>,
) -> Response {
    out(unenroll_student_impl(&bearer(&headers), id, b.student_id, &st.db, &st.sessions).await)
}

// ---- Audit + notifications ----
async fn audit_list(State(st): State<AppState>, headers: HeaderMap) -> Response {
    out(list_audit_impl(&bearer(&headers), &st.db, &st.sessions).await)
}
async fn notifications_list(State(st): State<AppState>, headers: HeaderMap) -> Response {
    out(list_class_notifications_impl(&bearer(&headers), &st.db, &st.sessions).await)
}

// ---- Sessions (buổi học) ----
async fn sessions_list(State(st): State<AppState>, headers: HeaderMap) -> Response {
    out(list_sessions_impl(&bearer(&headers), &st.db, &st.sessions).await)
}
async fn sessions_create(
    State(st): State<AppState>,
    headers: HeaderMap,
    Json(b): Json<SessionInput>,
) -> Response {
    out(create_session_impl(&bearer(&headers), b, &st.db, &st.sessions, &st.gcal).await)
}
async fn sessions_update(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(b): Json<SessionInput>,
) -> Response {
    out(update_session_impl(&bearer(&headers), id, b, &st.db, &st.sessions, &st.gcal).await)
}
async fn sessions_delete(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    out(delete_session_impl(&bearer(&headers), id, &st.db, &st.sessions, &st.gcal).await)
}

// ---- Attendance + homework ----
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkBody {
    student_id: String,
    session_id: String,
    status: String,
}
async fn attendance_list(State(st): State<AppState>, headers: HeaderMap) -> Response {
    out(list_attendance_impl(&bearer(&headers), &st.db, &st.sessions).await)
}
async fn attendance_mark(
    State(st): State<AppState>,
    headers: HeaderMap,
    Json(b): Json<MarkBody>,
) -> Response {
    out(mark_attendance_impl(
        &bearer(&headers),
        b.student_id,
        b.session_id,
        b.status,
        &st.db,
        &st.sessions,
    )
    .await)
}
async fn homework_list(State(st): State<AppState>, headers: HeaderMap) -> Response {
    out(list_homework_impl(&bearer(&headers), &st.db, &st.sessions).await)
}
async fn homework_set(
    State(st): State<AppState>,
    headers: HeaderMap,
    Json(b): Json<MarkBody>,
) -> Response {
    out(set_homework_impl(
        &bearer(&headers),
        b.student_id,
        b.session_id,
        b.status,
        &st.db,
        &st.sessions,
    )
    .await)
}

// ---- Payments (chứng từ) ----
async fn payments_list(State(st): State<AppState>, headers: HeaderMap) -> Response {
    out(list_payment_docs_impl(&bearer(&headers), &st.db, &st.sessions).await)
}
async fn payments_create(
    State(st): State<AppState>,
    headers: HeaderMap,
    Json(b): Json<PaymentDocInput>,
) -> Response {
    out(create_payment_doc_impl(&bearer(&headers), b, &st.db, &st.sessions, &st.r2).await)
}
async fn payments_read(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    out(read_payment_doc_impl(&bearer(&headers), id, &st.db, &st.sessions, &st.r2).await)
}
async fn payments_delete(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    out(soft_delete_payment_doc_impl(&bearer(&headers), id, &st.db, &st.sessions).await)
}

// ---- Staff / users ----
#[derive(serde::Deserialize)]
struct CreateStaffBody {
    name: String,
    email: String,
    role: String,
    password: String,
}
async fn users_list(State(st): State<AppState>, headers: HeaderMap) -> Response {
    out(list_users_impl(&bearer(&headers), &st.db, &st.sessions).await)
}
async fn users_create(
    State(st): State<AppState>,
    headers: HeaderMap,
    Json(b): Json<CreateStaffBody>,
) -> Response {
    out(create_staff_impl(
        &bearer(&headers),
        b.name,
        b.email,
        b.role,
        b.password,
        &st.db,
        &st.sessions,
    )
    .await)
}
async fn users_status(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(b): Json<StatusBody>,
) -> Response {
    out(set_user_status_impl(&bearer(&headers), id, b.status, &st.db, &st.sessions).await)
}
#[derive(serde::Deserialize)]
struct RoleBody {
    role: String,
}
async fn users_role(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(b): Json<RoleBody>,
) -> Response {
    out(update_user_role_impl(&bearer(&headers), id, b.role, &st.db, &st.sessions).await)
}
#[derive(serde::Deserialize)]
struct PasswordBody {
    password: String,
}
async fn users_password(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(b): Json<PasswordBody>,
) -> Response {
    out(reset_user_password_impl(&bearer(&headers), id, b.password, &st.db, &st.sessions).await)
}

/// Build the CORS layer. In production set ALLOWED_ORIGINS to a comma-separated
/// allow-list of exact web origins (e.g. "https://crm-trungtam.vercel.app").
/// When unset we fall back to permissive `Any` for local dev. Auth is via a
/// Bearer token in the Authorization header (not cookies), so we never enable
/// allow_credentials.
fn cors_layer() -> CorsLayer {
    match std::env::var("ALLOWED_ORIGINS")
        .ok()
        .filter(|s| !s.trim().is_empty())
    {
        Some(list) => {
            let origins: Vec<HeaderValue> = list
                .split(',')
                .filter_map(|o| o.trim().parse().ok())
                .collect();
            if origins.is_empty() {
                panic!("ALLOWED_ORIGINS set but no valid origin parsed");
            }
            eprintln!("CORS giới hạn cho: {list}");
            CorsLayer::new()
                .allow_origin(origins)
                .allow_methods(Any)
                .allow_headers(Any)
        }
        None => {
            eprintln!("CORS mở cho mọi nguồn (dev) — đặt ALLOWED_ORIGINS để siết khi production.");
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any)
        }
    }
}

/// Assemble the full Axum router (routes + CORS) from an [`AppState`]. Kept
/// separate from [`serve`] so tests can build the same router over an in-memory
/// database without binding a socket.
fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/login", post(login))
        .route("/api/me", get(me))
        .route("/api/account/password", post(change_password))
        .route("/api/students", get(students_list).post(students_create))
        .route(
            "/api/students/:id",
            put(students_update).delete(students_delete),
        )
        .route("/api/classes", get(classes_list).post(classes_create))
        .route(
            "/api/classes/:id",
            put(classes_update).delete(classes_delete),
        )
        .route("/api/classes/:id/status", post(classes_status))
        .route("/api/classes/:id/enroll", post(classes_enroll))
        .route("/api/classes/:id/unenroll", post(classes_unenroll))
        .route("/api/audit", get(audit_list))
        .route("/api/notifications", get(notifications_list))
        .route("/api/sessions", get(sessions_list).post(sessions_create))
        .route(
            "/api/sessions/:id",
            put(sessions_update).delete(sessions_delete),
        )
        .route(
            "/api/attendance",
            get(attendance_list).post(attendance_mark),
        )
        .route("/api/homework", get(homework_list).post(homework_set))
        .route("/api/payments", get(payments_list).post(payments_create))
        .route("/api/payments/:id", axum::routing::delete(payments_delete))
        .route("/api/payments/:id/file", get(payments_read))
        .route("/api/users", get(users_list).post(users_create))
        .route("/api/users/:id/status", post(users_status))
        .route("/api/users/:id/role", post(users_role))
        .route("/api/users/:id/password", post(users_password))
        .layer(cors_layer())
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            rate_limit_mw,
        ))
        .with_state(state)
}

/// Test-only: build the router over a caller-provided (in-memory) database.
/// R2/GCal are stubbed since the tested endpoints don't touch them. Gated on
/// `db-tests` so it never ships in production builds.
#[cfg(feature = "db-tests")]
pub async fn test_router(db: Db) -> Router {
    // The payment endpoints aren't exercised in tests; build a non-connecting R2
    // stub from fixed values so AppState can be constructed.
    std::env::set_var("R2_ENDPOINT", "http://localhost");
    std::env::set_var("R2_BUCKET", "test");
    std::env::set_var("R2_ACCESS_KEY_ID", "test");
    std::env::set_var("R2_SECRET_ACCESS_KEY", "test");
    let r2 = crate::storage::R2::from_env().expect("stub R2");
    let gcal = crate::gcal::GCal::from_env(); // no env -> disabled

    let state = AppState {
        db: Arc::new(db),
        sessions: Arc::new(Sessions(Mutex::new(HashMap::new()))),
        guard: Arc::new(LoginGuard(Mutex::new(HashMap::new()))),
        r2: Arc::new(r2),
        gcal: Arc::new(gcal),
        limiter: Arc::new(RateLimiter::default()),
    };
    build_router(state)
}

/// Build app state (connect Turso, seed) and run the HTTP server.
pub async fn serve() {
    dotenvy::dotenv().ok();
    let url = crate::secret!("TURSO_DATABASE_URL").expect("thiếu TURSO_DATABASE_URL");
    let token = crate::secret!("TURSO_AUTH_TOKEN").expect("thiếu TURSO_AUTH_TOKEN");

    let db = crate::db::open(&url, &token)
        .await
        .expect("kết nối Turso thất bại");
    crate::seed::seed_if_empty(&db.conn)
        .await
        .expect("seed thất bại");

    let r2 = crate::storage::R2::from_env().expect("khởi tạo R2 thất bại");
    let gcal = crate::gcal::GCal::from_env();

    let state = AppState {
        db: Arc::new(db),
        sessions: Arc::new(Sessions(Mutex::new(HashMap::new()))),
        guard: Arc::new(LoginGuard(Mutex::new(HashMap::new()))),
        r2: Arc::new(r2),
        gcal: Arc::new(gcal),
        limiter: Arc::new(RateLimiter::default()),
    };

    let app = build_router(state);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8787);
    let addr = format!("0.0.0.0:{port}");
    println!("CRM API server đang chạy tại http://{addr}");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("bind cổng thất bại");
    axum::serve(listener, app).await.expect("server lỗi");
}
