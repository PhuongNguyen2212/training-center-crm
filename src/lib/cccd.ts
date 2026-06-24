// Vietnamese national ID (CCCD) validation — single source of truth for the
// frontend. Mirrors the backend rule in src-tauri/src/util.rs so the UI never
// accepts a value the server would reject.
//
// A CCCD is exactly 12 digits. The first 3 digits are an official province /
// city code (mã tỉnh). We validate the structure (12 digits) AND that the
// prefix is a real province code, which rejects obviously bogus values like
// "000000000000" or "123456789012" that the bare 12-digit check would pass.

/** Official 3-digit province/city codes used as the CCCD prefix (63 provinces). */
export const CCCD_PROVINCE_CODES = new Set([
  "001", "002", "004", "006", "008", "010", "011", "012", "014", "015",
  "017", "019", "020", "022", "024", "025", "026", "027", "030", "031",
  "033", "034", "035", "036", "037", "038", "040", "042", "044", "045",
  "046", "048", "049", "051", "052", "054", "056", "058", "060", "062",
  "064", "066", "067", "068", "070", "072", "074", "075", "077", "079",
  "080", "082", "083", "084", "086", "087", "089", "091", "092", "093",
  "094", "095", "096",
]);

/** True when `s` is exactly 12 digits AND begins with a valid province code. */
export const isValidCccd = (s: string): boolean =>
  /^[0-9]{12}$/.test(s) && CCCD_PROVINCE_CODES.has(s.slice(0, 3));
