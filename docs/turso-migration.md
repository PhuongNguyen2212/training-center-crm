# Lộ trình chuyển sang Turso (nhiều máy + offline)

> **Trạng thái: ĐÃ LÊN KẾ HOẠCH — đang chặn ở môi trường build.** Quyết định kiến
> trúc đã chốt (xem dưới). Việc viết code chưa bắt đầu vì thư viện lõi `libsql`
> **không biên dịch được trên máy hiện tại** (thiếu LLVM). Hạ tầng (Turso DB + R2
> bucket) đã do người dùng tạo; secret nằm trong `.env` (gitignored).

## Quyết định kiến trúc (đã chốt)
- **DB:** Turso Cloud (libSQL managed) làm primary + **embedded replica** (file
  SQLite local) trên mỗi máy → đọc/chạy offline, ghi sync về primary.
- **File chứng từ:** đẩy lên **Cloudflare R2** (object storage) + cache local; DB
  chỉ lưu key. (Vì rows sync giữa các máy nhưng file local thì không.)
- **Xung đột:** **last-write-wins** theo `updated_at` (đủ cho CRM; `attendance`
  vốn append-only nên miễn nhiễm).
- **Mã hóa:** dùng mã hóa-khi-nghỉ của Turso + TLS → **thay thế SQLCipher (#5)**.

## ⛔ Điểm chặn hiện tại (cần xử lý trước khi code)
Spike P1 (`cargo build` với `libsql 0.6`) thất bại:
1. **Thiếu LLVM/libclang** — `libsql` dùng `bindgen` để sinh binding cho lõi C
   của libSQL; `bindgen` cần `libclang.dll`. Máy hiện **chưa cài LLVM**.
2. **Crash khi biên dịch `prost-derive`** (`STATUS_STACK_BUFFER_OVbERRUN
   0xc0000409`) — chuỗi gRPC (`prost`/`tonic`) mà libSQL kéo theo; có thể liên
   quan tới đĩa C: gần đầy / phần mềm diệt virus / cần thử lại sau khi có LLVM.
3. **Đĩa C: ~99% đầy** — build nặng (libSQL + gRPC + bindgen) cần thêm dung lượng.

### Điều kiện để gỡ chặn
```powershell
# 1) Cài LLVM (cung cấp libclang cho bindgen)
winget install LLVM.LLVM
#   rồi đặt biến môi trường nếu cần:
#   setx LIBCLANG_PATH "C:\Program Files\LLVM\bin"

# 2) Giải phóng C: ít nhất ~5–10GB (dọn dữ liệu cá nhân / chuyển sang D:)

# 3) Thử lại spike (xem mã ở mục cuối)
```
Sau khi 3 điều trên xong, chạy lại spike để xác nhận `libsql` build + kết nối
Turso + tạo replica + ghi-khi-offline, **rồi mới** tiến hành migrate.

## Hệ quả lớn cần biết: toàn bộ command sẽ thành `async`
`rusqlite` hiện tại là **đồng bộ**; `libsql` là **async**. Khi migrate, mọi hàm
trong `commands/*` chuyển sang `async fn` (Tauri hỗ trợ), thay
`conn.execute(...)` → `conn.execute(...).await`, đổi cách lấy params/rows. Thay
đổi nhiều nhưng máy móc, không đổi logic nghiệp vụ/SQL.

## Kế hoạch theo phase
1. **P1** — `db.rs`: mở `Builder::new_remote_replica(replica_path, url, token)`;
   spike xác nhận ghi-khi-offline (queue local, replay khi có mạng).
2. **P2** — bật `db.sync()` định kỳ + lúc mở app; đảm bảo mọi UPDATE set
   `updated_at` để LWW nhất quán.
3. **P3** — `storage.rs`: đẩy/đọc file qua R2 (S3 API) + cache local
   `payment_docs/`; DB lưu object key.
4. **P4** — chuyển secret (`TURSO_*`, `R2_*`) vào OS keychain (Windows Credential
   Manager) thay cho `.env`; rà lại enforcement quyền cho bối cảnh nhiều máy.
5. **P5** — cập nhật test (mock/integration), tài liệu topology, build + đóng gói.

## Biến môi trường (đã có trong `.env`, mẫu ở `.env.example`)
`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `TURSO_REPLICA_FILE`,
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`,
`R2_ENDPOINT`.

## Mã spike để chạy lại (sau khi cài LLVM)
Đặt `Cargo.toml` `[dev-dependencies]`: `libsql = "0.6"`,
`tokio = { version = "1", features = ["macros","rt-multi-thread"] }`, rồi
`src-tauri/examples/turso_spike.rs`:

```rust
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let url = std::env::var("TURSO_DATABASE_URL")?;
    let token = std::env::var("TURSO_AUTH_TOKEN")?;
    let replica = std::env::temp_dir().join("crm-spike-replica.db");
    let db = libsql::Builder::new_remote_replica(replica, url, token).build().await?;
    let conn = db.connect()?;
    db.sync().await?;                                  // kéo từ primary
    conn.execute("CREATE TABLE IF NOT EXISTS spike(id INTEGER PRIMARY KEY, note TEXT)", ()).await?;
    conn.execute("INSERT INTO spike(note) VALUES (?1)", libsql::params!["hello"]).await?;
    db.sync().await?;                                  // đẩy lên primary
    let mut rows = conn.query("SELECT COUNT(*) FROM spike", ()).await?;
    if let Some(r) = rows.next().await? { println!("rows = {}", r.get::<i64>(0)?); }
    Ok(())
}
```
Chạy: `export $(grep '^TURSO_' ../.env | xargs); cargo run --example turso_spike`.
