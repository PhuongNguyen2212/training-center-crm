# Tầng dữ liệu production (Tauri + SQLite)

Tài liệu kiến trúc tầng backend thật — thay cho store localStorage của bản
prototype web.

## Kiến trúc

```
React (frontend)                 Rust (Tauri backend)              SQLite
─────────────────                ────────────────────              ──────
src/lib/backend.ts  ── invoke ──▶ src-tauri/src/commands/* ──────▶ crm.db
  (typed client)      (IPC)         - kiểm tra session token         (app data dir)
                                     - đọc lại role từ DB
                                     - require_role(...)
                                     - ghi audit_logs
```

- **Prisma** (`prisma/schema.prisma`) là nguồn mô tả dữ liệu chính thức.
- **SQLite** truy cập bằng `rusqlite` (feature `bundled` — tự biên dịch SQLite,
  không cần cài ngoài).
- **Mật khẩu**: `bcrypt` cost 12, băm & verify trong Rust. Không bao giờ lưu
  plaintext, không gửi hash ra frontend.
- **Phiên đăng nhập**: `login` trả `token` (UUID) + thông tin user. Token lưu ở
  frontend, gửi kèm mọi lệnh. Backend **đọc lại role/status từ DB theo token**,
  không tin role do frontend gửi (CLAUDE.md).
- **Khóa chống dò mật khẩu**: 5 lần sai → khóa 5 phút (theo email), trong bộ nhớ
  backend.
- **Audit log** ghi thẳng vào bảng `audit_logs` trong cùng lệnh.

## Cấu trúc Rust (`src-tauri/src/`)

| File | Vai trò |
|------|---------|
| `lib.rs` | Khởi tạo DB ở app-data dir, chạy migration, seed, đăng ký command |
| `db.rs` | Mở kết nối SQLite + áp dụng `migrations/0001_init.sql` |
| `seed.rs` | Seed 5 tài khoản (băm bcrypt) + học viên + lớp khi DB rỗng |
| `auth.rs` | Session, lockout, `current_user`, `require_role`, `write_audit` |
| `models.rs` | Struct serde (camelCase) cho input/output |
| `error.rs` | `AppError` serialize về frontend |
| `commands/auth.rs` | `login`, `logout`, `me` |
| `commands/students.rs` | `list/create/update/soft_delete_student` (+ quy tắc CCCD server-side) |
| `commands/staff.rs` | `list_users`, `create_staff`, `set_user_status`, `update_user_role`, `reset_user_password` |
| `commands/audit.rs` | `list_audit` |

## Bảng dữ liệu (`migrations/0001_init.sql`)

`users`, `students`, `classes`, `class_students`, `sessions`, `attendance`,
`payment_docs`, `homework`, `audit_logs` — UUID khóa chính, timestamp ISO-8601,
soft delete cho students/payment_docs, `attendance` append-only (`is_override`),
`sessions.google_event_id` UNIQUE để chống trùng khi đồng bộ.

## Chạy

```bash
npm install
npm run tauri:dev     # mở app desktop; DB tạo tự động ở app-data dir
npm run tauri:build   # đóng gói .exe
```

DB nằm tại (Windows): `%APPDATA%\vn.trungtam.crm\crm.db`. Xóa file này để seed
lại từ đầu.

### Tài khoản seed (đăng nhập backend thật)

Giống bản demo: `admin@trungtam.vn / admin123`, `minh.gv@trungtam.vn /
teacher123`, `bao.tv@trungtam.vn / sales123`, `linh.tc@trungtam.vn /
finance123`. Mật khẩu được băm bcrypt ngay khi seed.

## Trạng thái & bước kế tiếp

**Đã xong (Phase 1)** — backend compile được, lõi bảo mật + nghiệp vụ trọng yếu:
auth (bcrypt/session/lockout), students (CRUD + CCCD + scoping salesperson),
staff/users (CRUD + treo/đổi quyền/đặt lại mật khẩu), audit. Client typed
`src/lib/backend.ts` + `isTauri()`.

**Phase 2 — toàn bộ domain đã nối frontend ↔ backend SQLite:**
- `src/lib/backend.ts` + `isTauri()` định tuyến: desktop → backend SQLite,
  trình duyệt → store localStorage (web demo vẫn chạy).
- Đã nối: **auth, học viên, nhân sự, audit, lớp học (+ ghi danh), buổi học
  (+ upsert Google), điểm danh (append-only), bài tập, chứng từ thanh toán**.
  KPI/báo cáo tự suy ra từ dữ liệu đã hydrate.
- `auth-store`: đăng nhập/đăng xuất qua backend, giữ `token`; `AppLayout`
  revalidate token + `hydrateFromBackend` (nạp toàn bộ slice) khi mở app.
- Mọi lệnh ghi đều kiểm tra quyền server-side + ghi audit vào DB.
- Test: 6 test Rust (`cargo test`) + 48 test frontend đều PASS; `cargo build`
  & `npm run build` sạch.

**Phase 2 — còn lại (hạ tầng, không phải CRUD):**
1. Lưu file chứng từ thật qua Tauri `fs` (hiện chỉ lưu tên file vào `file_path`).
2. OAuth Google chạy phía backend; refresh token lưu trong OS keychain (hiện
   Google Calendar chỉ hoạt động ở bản web qua GIS).
3. Sao lưu/khôi phục file `.db`.
4. Test Rust cho các command CRUD mới (hiện test phủ auth/lockout/CCCD).
