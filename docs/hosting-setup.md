# Dựng hạ tầng production: Turso + Cloudflare R2

Hướng dẫn tạo và lấy đúng các giá trị cần điền vào `.env` (sao chép từ
`.env.example`). **Không commit `.env` thật.** Mỗi giá trị tương ứng một biến môi
trường backend dùng cho hướng [nhiều máy + offline](./topology.md).

> Sau khi điền xong, gửi Claude các giá trị (hoặc tự đặt vào `.env`) để bắt đầu
> P1 — đổi tầng kết nối sang libSQL.

---

## A. Turso (database chính + replica local)

### 1. Cài CLI & đăng nhập
```bash
# Windows (PowerShell) — cài qua winget hoặc scoop, hoặc tải từ turso.tech
turso auth signup        # hoặc: turso auth login
```

### 2. Tạo database
```bash
turso db create crm-trungtam        # đặt tên tùy ý
```

### 3. Lấy Database URL → `TURSO_DATABASE_URL`
```bash
turso db show crm-trungtam --url
# Kết quả dạng: libsql://crm-trungtam-<org>.turso.io
```

### 4. Tạo auth token → `TURSO_AUTH_TOKEN`
```bash
turso db tokens create crm-trungtam
# Chuỗi dài bắt đầu bằng "ey..." — đây là token, giữ bí mật.
```

### 5. (Tùy chọn) nạp schema lên primary
Schema hiện ở `src-tauri/migrations/0001_init.sql`. Có thể để app tự tạo lần
đầu, hoặc nạp tay:
```bash
turso db shell crm-trungtam < src-tauri/migrations/0001_init.sql
```

→ Điền: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. Để `TURSO_REPLICA_FILE=crm.db`.

---

## B. Cloudflare R2 (lưu file chứng từ dùng chung)

### 1. Bật R2
Cloudflare Dashboard → **R2** → bật (cần thêm thẻ, có hạn mức miễn phí; **không
tính phí egress**).

### 2. Tạo bucket → `R2_BUCKET`
**R2 → Create bucket** → đặt tên, ví dụ `crm-payment-docs`. Chọn vùng gần (APAC).

### 3. Tạo API token → `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
**R2 → Manage R2 API Tokens → Create API Token**:
- Quyền: **Object Read & Write**, giới hạn vào bucket vừa tạo.
- Tạo xong sẽ hiện **Access Key ID** và **Secret Access Key** — copy ngay
  (secret chỉ hiện một lần).

### 4. Lấy Account ID → `R2_ACCOUNT_ID` và endpoint → `R2_ENDPOINT`
- **Account ID**: ở trang tổng quan R2 (hoặc URL dashboard).
- **Endpoint** dạng: `https://<account-id>.r2.cloudflarestorage.com`

→ Điền: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET`, `R2_ENDPOINT`.

---

## C. Bảo mật

- `.env` thật **đã được `.gitignore` bỏ qua** — không commit.
- Khi đóng gói production, các giá trị này sẽ được chuyển vào **OS keychain**
  (Windows Credential Manager) thay vì đọc từ `.env` (làm ở P4).
- Token Turso và secret R2 cấp quyền ghi dữ liệu — coi như mật khẩu.

---

## D. Sau khi điền xong

Báo Claude. Lộ trình code:
1. **P1** — `db.rs` mở libSQL với replica local + URL + token; spike kiểm chứng
   ghi-khi-offline.
2. **P2** — auto-sync + `updated_at` cho last-write-wins.
3. **P3** — `storage.rs` đẩy/đọc file qua R2 + cache local.
4. **P4** — đưa secret vào keychain + rà quyền cho bối cảnh nhiều máy.
5. **P5** — test + cập nhật tài liệu + build.
