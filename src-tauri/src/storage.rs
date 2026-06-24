// Payment document storage on Cloudflare R2 (S3-compatible object storage).
//
// Files never live in SQLite (CLAUDE.md: store paths, not blobs) and, for the
// multi-machine online setup, must be shared — so they live in R2, not on a
// single machine's disk. The object key is derived deterministically from the
// document id + MIME type; the DB keeps only the original display name.

use crate::error::{AppError, AppResult};
use s3::creds::Credentials;
use s3::{Bucket, Region};

/// 5MB hard cap per document (CLAUDE.md finance spec).
pub const MAX_FILE_SIZE: usize = 5 * 1024 * 1024;

/// Cloudflare R2 bucket handle. Managed Tauri state.
pub struct R2 {
    pub bucket: Box<Bucket>,
}

impl R2 {
    /// Build from env: R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
    pub fn from_env() -> AppResult<Self> {
        let endpoint =
            crate::secret!("R2_ENDPOINT").ok_or_else(|| AppError::new("thiếu R2_ENDPOINT"))?;
        let bucket_name =
            crate::secret!("R2_BUCKET").ok_or_else(|| AppError::new("thiếu R2_BUCKET"))?;
        let key = crate::secret!("R2_ACCESS_KEY_ID")
            .ok_or_else(|| AppError::new("thiếu R2_ACCESS_KEY_ID"))?;
        let secret = crate::secret!("R2_SECRET_ACCESS_KEY")
            .ok_or_else(|| AppError::new("thiếu R2_SECRET_ACCESS_KEY"))?;

        let region = Region::Custom { region: "auto".to_string(), endpoint };
        let creds = Credentials::new(Some(&key), Some(&secret), None, None, None)
            .map_err(|e| AppError::new(format!("Thông tin R2 không hợp lệ: {e}")))?;
        let bucket = Bucket::new(&bucket_name, region, creds)
            .map_err(|e| AppError::new(format!("Không khởi tạo được R2 bucket: {e}")))?
            .with_path_style();
        Ok(R2 { bucket })
    }
}

/// Map an accepted MIME type to a file extension; rejects anything else.
pub fn ext_for_type(file_type: &str) -> AppResult<&'static str> {
    match file_type {
        "image/jpeg" => Ok("jpg"),
        "image/png" => Ok("png"),
        "application/pdf" => Ok("pdf"),
        _ => Err(AppError::new("Định dạng tệp không hợp lệ (chỉ JPEG, PNG, PDF).")),
    }
}

/// Light magic-byte sniff so we never trust the frontend-declared MIME type.
fn sniff_ok(file_type: &str, bytes: &[u8]) -> bool {
    match file_type {
        "image/jpeg" => bytes.starts_with(&[0xFF, 0xD8, 0xFF]),
        "image/png" => bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]),
        "application/pdf" => bytes.starts_with(b"%PDF"),
        _ => false,
    }
}

/// Server-side validation of an uploaded document: type, non-empty, size, and
/// that the bytes actually match the declared type.
pub fn validate_file(file_type: &str, bytes: &[u8]) -> AppResult<()> {
    ext_for_type(file_type)?;
    if bytes.is_empty() {
        return Err(AppError::new("Tệp rỗng."));
    }
    if bytes.len() > MAX_FILE_SIZE {
        return Err(AppError::new("Tệp vượt quá giới hạn 5MB."));
    }
    if !sniff_ok(file_type, bytes) {
        return Err(AppError::new("Nội dung tệp không khớp định dạng khai báo."));
    }
    Ok(())
}

/// Deterministic R2 object key for a payment doc: `payment_docs/<id>.<ext>`.
pub fn object_key(id: &str, file_type: &str) -> AppResult<String> {
    Ok(format!("payment_docs/{id}.{}", ext_for_type(file_type)?))
}

pub async fn put(r2: &R2, key: &str, bytes: &[u8], content_type: &str) -> AppResult<()> {
    r2.bucket
        .put_object_with_content_type(key, bytes, content_type)
        .await
        .map_err(|e| AppError::new(format!("Tải tệp lên R2 thất bại: {e}")))?;
    Ok(())
}

pub async fn get(r2: &R2, key: &str) -> AppResult<Vec<u8>> {
    let resp = r2
        .bucket
        .get_object(key)
        .await
        .map_err(|e| AppError::new(format!("Không tải được tệp từ R2: {e}")))?;
    if resp.status_code() != 200 {
        return Err(AppError::new("Không tìm thấy tệp chứng từ trên R2."));
    }
    Ok(resp.bytes().to_vec())
}

pub async fn delete(r2: &R2, key: &str) -> AppResult<()> {
    r2.bucket
        .delete_object(key)
        .await
        .map_err(|e| AppError::new(format!("Xóa tệp R2 thất bại: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_type() {
        assert!(ext_for_type("application/zip").is_err());
        assert_eq!(ext_for_type("application/pdf").unwrap(), "pdf");
    }

    #[test]
    fn object_key_uses_extension() {
        assert_eq!(object_key("abc", "application/pdf").unwrap(), "payment_docs/abc.pdf");
        assert_eq!(object_key("xyz", "image/png").unwrap(), "payment_docs/xyz.png");
    }

    #[test]
    fn validate_checks_size_and_magic() {
        let png = [0x89, 0x50, 0x4E, 0x47, 1, 2, 3];
        assert!(validate_file("image/png", &png).is_ok());
        // declared png but jpeg magic -> rejected
        assert!(validate_file("image/png", &[0xFF, 0xD8, 0xFF, 0]).is_err());
        // valid pdf header but over the size cap
        let mut big = b"%PDF".to_vec();
        big.resize(MAX_FILE_SIZE + 1, 0);
        assert!(validate_file("application/pdf", &big).is_err());
        // empty
        assert!(validate_file("application/pdf", &[]).is_err());
    }
}
