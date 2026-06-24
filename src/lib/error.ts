// Extract a human-readable message from any thrown/rejected value.
//
// Tauri `invoke(...)` rejects with our serialized AppError — a plain object
// `{ message: string }`, which is NOT an `Error` instance. So the common
// `e instanceof Error ? e.message : String(e)` falls through to `String(e)`,
// rendering the dreaded "[object Object]". This helper handles that case.
export function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "Đã xảy ra lỗi không xác định.";
}
