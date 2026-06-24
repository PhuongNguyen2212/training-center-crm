use crate::auth::{current_user, require_capability, write_audit, Capability, Sessions};
use crate::db::{query_all, query_opt, Db};
use crate::error::{AppError, AppResult};
use crate::models::{PaymentDoc, PaymentDocFile, PaymentDocInput};
use crate::storage::{self, R2};
use crate::util::{new_id, now_iso};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use libsql::Row;
#[cfg(feature = "desktop")]
use tauri::State;

const COLS: &str =
    "id,student_id,amount,payment_date,file_path,file_type,note,uploaded_by,uploaded_at,deleted_at";

fn map_doc(r: &Row) -> libsql::Result<PaymentDoc> {
    Ok(PaymentDoc {
        id: r.get(0)?,
        student_id: r.get(1)?,
        amount: r.get(2)?,
        payment_date: r.get(3)?,
        file_name: r.get(4)?,
        file_type: r.get(5)?,
        note: r.get(6)?,
        uploaded_by: r.get(7)?,
        uploaded_at: r.get(8)?,
        deleted_at: r.get(9)?,
    })
}

// ---- Transport-agnostic logic ----

pub async fn list_payment_docs_impl(
    token: &str,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<Vec<PaymentDoc>> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::PaymentView)?;
    query_all(
        &db.conn,
        &format!(
            "SELECT {COLS} FROM payment_docs WHERE deleted_at IS NULL ORDER BY uploaded_at DESC"
        ),
        (),
        map_doc,
    )
    .await
}

pub async fn create_payment_doc_impl(
    token: &str,
    input: PaymentDocInput,
    db: &Db,
    sessions: &Sessions,
    r2: &R2,
) -> AppResult<PaymentDoc> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::PaymentUpload)?;

    let bytes = STANDARD
        .decode(input.file_base64.trim())
        .map_err(|_| AppError::new("Dữ liệu tệp không hợp lệ."))?;
    storage::validate_file(&input.file_type, &bytes)?;

    let id = new_id();
    let now = now_iso();
    let key = storage::object_key(&id, &input.file_type)?;
    storage::put(r2, &key, &bytes, &input.file_type).await?;

    let inserted = db
        .conn
        .execute(
            "INSERT INTO payment_docs
             (id,student_id,amount,payment_date,file_path,file_type,note,uploaded_by,uploaded_at,deleted_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,NULL)",
            libsql::params![id.clone(), input.student_id.clone(), input.amount, input.payment_date.clone(), input.file_name.clone(), input.file_type.clone(), input.note.clone(), user.id.clone(), now],
        )
        .await;
    if let Err(e) = inserted {
        let _ = storage::delete(r2, &key).await; // roll back the orphaned object
        return Err(e.into());
    }
    write_audit(
        &db.conn,
        &user.id,
        "payment_doc.upload",
        &format!("Tải lên chứng từ {}", input.file_name),
    )
    .await?;
    query_opt(
        &db.conn,
        &format!("SELECT {COLS} FROM payment_docs WHERE id=?1"),
        libsql::params![id.clone()],
        map_doc,
    )
    .await?
    .ok_or_else(|| AppError::new("Không tìm thấy chứng từ vừa tạo."))
}

pub async fn read_payment_doc_impl(
    token: &str,
    id: String,
    db: &Db,
    sessions: &Sessions,
    r2: &R2,
) -> AppResult<PaymentDocFile> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::PaymentView)?;

    let (file_name, file_type): (String, String) = query_opt(
        &db.conn,
        "SELECT file_path,file_type FROM payment_docs WHERE id=?1 AND deleted_at IS NULL",
        libsql::params![id.clone()],
        |r| Ok((r.get::<String>(0)?, r.get::<String>(1)?)),
    )
    .await?
    .ok_or_else(|| AppError::new("Không tìm thấy chứng từ."))?;

    let key = storage::object_key(&id, &file_type)?;
    let bytes = storage::get(r2, &key).await?;
    Ok(PaymentDocFile {
        file_name,
        file_type,
        base64: STANDARD.encode(bytes),
    })
}

pub async fn soft_delete_payment_doc_impl(
    token: &str,
    id: String,
    db: &Db,
    sessions: &Sessions,
) -> AppResult<()> {
    let user = current_user(db, sessions, token).await?;
    require_capability(&user, Capability::PaymentDelete)?;
    db.conn
        .execute(
            "UPDATE payment_docs SET deleted_at=?2 WHERE id=?1 AND deleted_at IS NULL",
            libsql::params![id.clone(), now_iso()],
        )
        .await?;
    write_audit(
        &db.conn,
        &user.id,
        "payment_doc.delete",
        &format!("Xóa chứng từ {id}"),
    )
    .await?;
    Ok(())
}

// ---- Tauri command wrappers ----

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn list_payment_docs(
    token: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<Vec<PaymentDoc>> {
    list_payment_docs_impl(&token, &db, &sessions).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn create_payment_doc(
    token: String,
    input: PaymentDocInput,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    r2: State<'_, R2>,
) -> AppResult<PaymentDoc> {
    create_payment_doc_impl(&token, input, &db, &sessions, &r2).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn read_payment_doc(
    token: String,
    id: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    r2: State<'_, R2>,
) -> AppResult<PaymentDocFile> {
    read_payment_doc_impl(&token, id, &db, &sessions, &r2).await
}

#[cfg(feature = "desktop")]
#[tauri::command]
pub async fn soft_delete_payment_doc(
    token: String,
    id: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<()> {
    soft_delete_payment_doc_impl(&token, id, &db, &sessions).await
}
