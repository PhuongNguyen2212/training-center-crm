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

/// Official 3-digit province/city codes used as the CCCD prefix (mã tỉnh), one
/// per the 63 provinces. Kept in sync with the frontend list in src/lib/cccd.ts.
const CCCD_PROVINCE_CODES: [&str; 63] = [
    "001", "002", "004", "006", "008", "010", "011", "012", "014", "015", "017", "019", "020",
    "022", "024", "025", "026", "027", "030", "031", "033", "034", "035", "036", "037", "038",
    "040", "042", "044", "045", "046", "048", "049", "051", "052", "054", "056", "058", "060",
    "062", "064", "066", "067", "068", "070", "072", "074", "075", "077", "079", "080", "082",
    "083", "084", "086", "087", "089", "091", "092", "093", "094", "095", "096",
];

/// Vietnamese national ID: exactly 12 ASCII digits whose first 3 digits are a
/// real province code. The province-prefix check is additive on top of the
/// original 12-digit rule, so it stays backward-compatible while rejecting
/// structurally-impossible values like "000000000000" or "123456789012".
pub fn is_valid_cccd(s: &str) -> bool {
    s.len() == 12 && s.chars().all(|c| c.is_ascii_digit()) && CCCD_PROVINCE_CODES.contains(&&s[..3])
}

#[cfg(test)]
mod tests {
    use super::{is_valid_cccd, CCCD_PROVINCE_CODES};

    #[test]
    fn accepts_12_digits_with_valid_province() {
        assert!(is_valid_cccd("012345678901")); // 012 = Lai Châu
        assert!(is_valid_cccd("079123456789")); // 079 = TP HCM
        assert!(is_valid_cccd("001999999999")); // 001 = Hà Nội
    }

    #[test]
    fn rejects_wrong_length_or_non_digits() {
        assert!(!is_valid_cccd("01234567890")); // 11
        assert!(!is_valid_cccd("0123456789012")); // 13
        assert!(!is_valid_cccd("01234567890x")); // has letter
        assert!(!is_valid_cccd("")); // empty
    }

    #[test]
    fn rejects_bogus_province_prefix() {
        // These pass the bare 12-digit check but have no real province code.
        assert!(!is_valid_cccd("000000000000"));
        assert!(!is_valid_cccd("123456789012"));
        assert!(!is_valid_cccd("999999999999"));
    }

    #[test]
    fn province_table_covers_63_provinces() {
        assert_eq!(CCCD_PROVINCE_CODES.len(), 63);
    }
}
