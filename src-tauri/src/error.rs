use serde::Serialize;

/// Error type returned to the frontend. Serializes to `{ "message": "..." }`,
/// so `invoke(...)` rejects with a readable message.
#[derive(Debug, Serialize)]
pub struct AppError {
    pub message: String,
}

impl AppError {
    pub fn new(msg: impl Into<String>) -> Self {
        Self {
            message: msg.into(),
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl From<libsql::Error> for AppError {
    fn from(e: libsql::Error) -> Self {
        AppError::new(format!("Lỗi cơ sở dữ liệu: {e}"))
    }
}

impl From<bcrypt::BcryptError> for AppError {
    fn from(e: bcrypt::BcryptError) -> Self {
        AppError::new(format!("Lỗi mã hóa mật khẩu: {e}"))
    }
}

pub type AppResult<T> = Result<T, AppError>;
