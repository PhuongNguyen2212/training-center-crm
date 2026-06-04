use chrono::Utc;
use uuid::Uuid;

pub fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

pub fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

pub fn new_id() -> String {
    Uuid::new_v4().to_string()
}

/// Vietnamese national ID: exactly 12 ASCII digits.
pub fn is_valid_cccd(s: &str) -> bool {
    s.len() == 12 && s.chars().all(|c| c.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::is_valid_cccd;

    #[test]
    fn cccd_must_be_12_digits() {
        assert!(is_valid_cccd("012345678901"));
        assert!(!is_valid_cccd("01234567890")); // 11
        assert!(!is_valid_cccd("0123456789012")); // 13
        assert!(!is_valid_cccd("01234567890x")); // has letter
        assert!(!is_valid_cccd(""));
    }
}
