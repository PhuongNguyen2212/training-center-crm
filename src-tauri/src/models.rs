use serde::{Deserialize, Serialize};

// Output structs use camelCase to match the TypeScript domain types.
// password_hash is never serialized out.

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub name: String,
    pub email: String,
    pub role: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Student {
    pub id: String,
    pub name: String,
    pub age: Option<i64>,
    pub phone: Option<String>,
    pub job_title: Option<String>,
    pub goal: Option<String>,
    pub enrollment_status: String,
    pub cccd_number: Option<String>,
    pub salesperson_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditLog {
    pub id: String,
    pub user_id: String,
    pub action: String,
    pub detail: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResponse {
    pub token: String,
    pub user: User,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Class {
    pub id: String,
    pub name: String,
    pub course_name: String,
    pub teacher_id: Option<String>,
    pub student_ids: Vec<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub google_event_id: Option<String>,
    pub title: String,
    pub start_time: String,
    pub end_time: String,
    pub teacher_id: Option<String>,
    pub class_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Attendance {
    pub id: String,
    pub student_id: String,
    pub session_id: String,
    pub status: String,
    pub marked_by: String,
    pub marked_at: String,
    pub is_override: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Homework {
    pub id: String,
    pub student_id: String,
    pub session_id: String,
    pub status: String,
    pub recorded_by: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentDoc {
    pub id: String,
    pub student_id: String,
    pub amount: i64,
    pub payment_date: String,
    pub file_name: String,
    pub file_type: String,
    pub note: Option<String>,
    pub uploaded_by: String,
    pub uploaded_at: String,
    pub deleted_at: Option<String>,
}

// ---- Inputs from the frontend ----------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudentInput {
    pub name: String,
    pub age: Option<i64>,
    pub phone: Option<String>,
    pub job_title: Option<String>,
    pub goal: Option<String>,
    pub enrollment_status: String,
    pub cccd_number: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassInput {
    pub name: String,
    pub course_name: String,
    pub teacher_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInput {
    pub google_event_id: Option<String>,
    pub title: String,
    pub start_time: String,
    pub end_time: String,
    pub teacher_id: Option<String>,
    pub class_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentDocInput {
    pub student_id: String,
    pub amount: i64,
    pub payment_date: String,
    pub file_name: String,
    pub file_type: String,
    /// Base64-encoded file content; decoded and written to disk server-side.
    pub file_base64: String,
    pub note: Option<String>,
}

/// File content returned for viewing a payment document.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentDocFile {
    pub file_name: String,
    pub file_type: String,
    pub base64: String,
}
