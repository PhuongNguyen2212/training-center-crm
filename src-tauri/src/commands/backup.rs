// Online mode: the database lives on Turso Cloud, which handles backups and
// point-in-time restore automatically. The old local-file backup/restore is no
// longer applicable; these commands remain (frontend still references them) but
// explain the managed model.

use crate::auth::{current_user, require_capability, Capability, Sessions};
use crate::db::Db;
use crate::error::{AppError, AppResult};
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub modified_at: String,
}

#[tauri::command]
pub async fn backup_database(
    token: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<String> {
    let user = current_user(&db, &sessions, &token).await?;
    require_capability(&user, Capability::DbBackup)?;
    Err(AppError::new(
        "Cơ sở dữ liệu chạy trên Turso Cloud — sao lưu được thực hiện tự động. Không cần sao lưu thủ công.",
    ))
}

#[tauri::command]
pub async fn list_backups(
    token: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<Vec<BackupInfo>> {
    let user = current_user(&db, &sessions, &token).await?;
    require_capability(&user, Capability::DbBackup)?;
    Ok(Vec::new())
}

#[tauri::command]
pub async fn restore_database(
    token: String,
    password: String,
    backup_path: String,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
) -> AppResult<()> {
    let user = current_user(&db, &sessions, &token).await?;
    require_capability(&user, Capability::DbRestore)?;
    let _ = (password, backup_path);
    Err(AppError::new(
        "Khôi phục do Turso Cloud quản lý (point-in-time restore) — thực hiện trên bảng điều khiển Turso.",
    ))
}
