use crate::auth::{current_user, require_role, write_audit, Sessions};
use crate::db::Db;
use crate::error::AppResult;
use crate::models::{PaymentDoc, PaymentDocInput};
use crate::util::{new_id, now_iso};
use rusqlite::{params, Row};
use tauri::State;

// file_path stores the file name for now (real file storage via Tauri fs is a
// later Phase 2 task); exposed to the frontend as `fileName`.
const COLS: &str =
    "id,student_id,amount,payment_date,file_path,file_type,note,uploaded_by,uploaded_at,deleted_at";

fn map_doc(r: &Row) -> rusqlite::Result<PaymentDoc> {
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

#[tauri::command]
pub fn list_payment_docs(
    token: String,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<Vec<PaymentDoc>> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin", "finance_staff", "salesperson"])?;
    let conn = db.0.lock();
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLS} FROM payment_docs WHERE deleted_at IS NULL ORDER BY uploaded_at DESC"
    ))?;
    let rows = stmt.query_map([], map_doc)?.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn create_payment_doc(
    token: String,
    input: PaymentDocInput,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<PaymentDoc> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin", "finance_staff"])?;
    let id = new_id();
    let now = now_iso();
    let conn = db.0.lock();
    conn.execute(
        "INSERT INTO payment_docs
         (id,student_id,amount,payment_date,file_path,file_type,note,uploaded_by,uploaded_at,deleted_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,NULL)",
        params![id, input.student_id, input.amount, input.payment_date, input.file_name, input.file_type, input.note, user.id, now],
    )?;
    write_audit(&conn, &user.id, "payment_doc.upload", &format!("Tải lên chứng từ {}", input.file_name))?;
    conn.query_row(&format!("SELECT {COLS} FROM payment_docs WHERE id=?1"), [&id], map_doc)
        .map_err(Into::into)
}

#[tauri::command]
pub fn soft_delete_payment_doc(
    token: String,
    id: String,
    db: State<Db>,
    sessions: State<Sessions>,
) -> AppResult<()> {
    let user = current_user(&db, &sessions, &token)?;
    require_role(&user, &["admin"])?; // only admin can delete
    let conn = db.0.lock();
    conn.execute(
        "UPDATE payment_docs SET deleted_at=?2 WHERE id=?1 AND deleted_at IS NULL",
        params![id, now_iso()],
    )?;
    write_audit(&conn, &user.id, "payment_doc.delete", &format!("Xóa chứng từ {id}"))?;
    Ok(())
}
