//! End-to-end style test: boot the real Axum server over an in-memory database
//! and exercise it over HTTP with a client. Demonstrates integration testing of
//! the running service (health, auth happy path, unauthorised path). Gated on
//! the `db-tests` feature like the other DB-backed tests.
#![cfg(feature = "db-tests")]

use app_lib::testkit::*;

/// Boot the server on an ephemeral port and return its base URL.
async fn boot() -> String {
    let db = open_memory().await.expect("in-memory db");
    seed_if_empty(&db.conn).await.expect("seed");
    let app = test_router(db).await;

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind ephemeral port");
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    format!("http://{addr}")
}

#[tokio::test]
async fn health_login_and_authorisation_paths() {
    let base = boot().await;
    let client = reqwest::Client::new();

    // 1) Health: no DB, no auth required.
    let res = client
        .get(format!("{base}/api/health"))
        .send()
        .await
        .expect("health request");
    assert_eq!(res.status().as_u16(), 200);
    assert_eq!(res.text().await.unwrap(), "ok");

    // 2) Login happy path: seeded admin returns a bearer token.
    let res = client
        .post(format!("{base}/api/login"))
        .json(&serde_json::json!({ "email": "admin@trungtam.vn", "password": "admin123" }))
        .send()
        .await
        .expect("login request");
    assert_eq!(res.status().as_u16(), 200);
    let body: serde_json::Value = res.json().await.unwrap();
    let token = body["token"]
        .as_str()
        .expect("token in response")
        .to_string();
    assert!(!token.is_empty());

    // 3) Authenticated endpoint, happy path: token returns the student list.
    let res = client
        .get(format!("{base}/api/students"))
        .bearer_auth(&token)
        .send()
        .await
        .expect("authed students request");
    assert_eq!(res.status().as_u16(), 200);
    let students: serde_json::Value = res.json().await.unwrap();
    assert!(
        students.as_array().map(|a| !a.is_empty()).unwrap_or(false),
        "seeded students are returned"
    );

    // 4) Unauthorised path: the same endpoint without a token is rejected.
    let res = client
        .get(format!("{base}/api/students"))
        .send()
        .await
        .expect("unauthed students request");
    assert!(
        !res.status().is_success(),
        "missing bearer token must be rejected"
    );
}
