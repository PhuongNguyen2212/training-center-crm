# Topology & luồng dữ liệu hệ thống

Tài liệu mô tả **kiến trúc tổng thể** của Training Center CRM: các thành phần,
luồng dữ liệu, ranh giới tin cậy và bố cục trên đĩa. Bổ sung cho
[deploy.md](./deploy.md) (triển khai server + web) và
[google-calendar-service-account.md](./google-calendar-service-account.md)
(tích hợp lịch).

---

## 1. Sơ đồ thành phần

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Tiến trình Tauri (1 cửa sổ ứng dụng desktop)                              │
│                                                                            │
│  ┌─────────────────────────────┐         ┌──────────────────────────────┐ │
│  │  Frontend (WebView)         │         │  Backend (Rust)              │ │
│  │  React 18 + TS + Tailwind   │         │  src-tauri/src/              │ │
│  │                             │         │                              │ │
│  │  features/*  pages/*        │         │  commands/*  ← lớp lệnh      │ │
│  │  store/ (Zustand)           │         │  auth.rs   (session/quyền)   │ │
│  │  lib/backend.ts ───────────────invoke()──▶ require_capability(...)   │ │
│  │     (typed client)          │   IPC   │  db.rs / rusqlite            │ │
│  │  lib/google-calendar.ts     │         │  storage.rs (file)           │ │
│  └─────────────┬───────────────┘         └───────┬───────────┬──────────┘ │
│                │                                  │           │            │
└────────────────┼──────────────────────────────────┼───────────┼───────────┘
                 │ HTTPS (GIS/OAuth)                 │           │
                 ▼                                   ▼           ▼
        ┌─────────────────┐              ┌────────────────┐  ┌──────────────┐
        │ Google Calendar │              │  SQLite crm.db │  │  Hệ tệp local │
        │     API v3      │              │ (app-data dir) │  │ payment_docs/ │
        └─────────────────┘              └────────────────┘  │ backups/      │
                                                             └──────────────┘
```

- **Một tiến trình, hai tầng**: WebView (UI) và Rust (dữ liệu) trong cùng app
  Tauri, nói chuyện qua **IPC `invoke()`** — không có HTTP server nội bộ.
- **Offline-first**: mọi tính năng chạy ngoại tuyến trừ **Lịch học** (gọi Google
  Calendar). Mất mạng → lịch về chế độ chỉ-đọc từ bản đồng bộ gần nhất.

---

## 2. Ranh giới tin cậy (trust boundary)

Ranh giới nằm ở **biên IPC**: mọi thứ phía WebView là **không tin cậy**.

| Frontend gửi | Backend xử lý |
|--------------|---------------|
| `token` (UUID phiên) | Tra `token → user_id`, **đọc lại `role`/`status` từ DB** |
| `role`, `userId` (nếu có) | **Bỏ qua** — không bao giờ tin |
| Tham số nghiệp vụ | Validate lại trong Rust trước khi ghi (CCCD, type/size file…) |

- **Phân quyền**: mỗi lệnh gọi `require_capability(user, Capability::X)`. Ma trận
  quyền gom **một chỗ duy nhất** trong [`auth.rs`](../src-tauri/src/auth.rs)
  (`Capability::allowed_roles`), **deny-by-default**.
- **Scoping "của tôi"**: lọc theo chủ sở hữu ngay trong câu SQL — giáo viên chỉ
  thấy lớp/buổi/điểm danh/bài tập của mình; nhân viên tư vấn chỉ học viên do mình
  phụ trách.
- **Audit**: mọi thao tác có ý nghĩa ghi một dòng `audit_logs` trong cùng lệnh.

---

## 3. Luồng dữ liệu tiêu biểu

### 3.1 Đăng nhập
```
LoginPage → backend.login(email, pw)
  → Rust: tra user theo email → bcrypt.verify → kiểm lockout (5 sai/5 phút)
  → sinh token (UUID) lưu in-memory: token → user_id
  → trả { token, user }; frontend giữ token trong auth-store
```

### 3.2 Đọc danh sách có scoping
```
backend.listStudents(token)
  → current_user(token): đọc role/status từ DB
  → require_capability(StudentView)
  → salesperson? → WHERE salesperson_id = <user.id>   (lọc trong SQL)
  → trả mảng đã lọc
```

### 3.3 Tải lên chứng từ (bytes ra đĩa)
```
FinancePage: File → base64 (FileReader)
  → backend.createPaymentDoc(token, { ..., fileBase64 })
  → Rust: require_capability(PaymentUpload)
         decode base64 → validate type + size ≤ 5MB + magic byte
         ghi bytes → <app-data>/payment_docs/<id>.<ext>   (KHÔNG vào SQLite)
         INSERT payment_docs (file_path = tên hiển thị, đường dẫn suy từ id)
         nếu INSERT lỗi → xóa file vừa ghi (rollback)
Xem lại: backend.readPaymentDoc(token, id) → base64 → Blob → window.open
```

### 3.4 Sao lưu / khôi phục CSDL
```
Sao lưu:  backup_database(token) → require_capability(DbBackup)
          → VACUUM INTO <app-data>/backups/crm-backup-<stamp>.db
Khôi phục: restore_database(token, password, path)
          → require_capability(DbRestore) + bcrypt.verify(password)
          → kiểm file là SQLite có bảng users/students/payment_docs
          → Backup API copy file → kết nối đang mở (in-place, giữ state sống)
          → frontend hydrateFromBackend() nạp lại toàn bộ slice
```

### 3.5 Đồng bộ Google Calendar
```
SchedulePage → lib/google-calendar.ts (GIS OAuth, HTTPS trực tiếp)
  → kéo event → backend.upsertSessionsFromGoogle(token, incoming)
  → Rust: upsert theo google_event_id (UNIQUE) — không tạo trùng
```

---

## 4. Bố cục trên đĩa (Windows)

App-data dir: `%APPDATA%\vn.trungtam.crm\`

```
%APPDATA%\vn.trungtam.crm\
├── crm.db                       # toàn bộ CSDL (1 tệp, backup bằng USB được)
├── crm.db-wal / crm.db-shm      # WAL của SQLite
├── payment_docs/                # file chứng từ thật (ảnh/PDF), KHÔNG vào DB
│   └── <uuid>.{jpg,png,pdf}
└── backups/                     # snapshot tạo bởi "Sao lưu ngay"
    └── crm-backup-<YYYYMMDD-HHMMSS>.db
```

- **Không lưu blob trong SQLite** — chỉ đường dẫn/metadata; nội dung file ở
  `payment_docs/`.
- **DB nằm ở app-data dir**, không nằm cạnh file cài đặt → an toàn khi cập nhật app.

---

## 5. Bí mật & khóa nằm ở đâu

| Bí mật | Nơi lưu | Ghi chú |
|--------|---------|---------|
| Mật khẩu người dùng | `users.password_hash` (bcrypt cost 12) | Không bao giờ ra frontend |
| Token phiên | RAM backend (`Sessions`) | Mất khi tắt app |
| OAuth Google | (kế hoạch) OS keychain qua tauri-plugin-store | Không để plaintext trong `.env`/SQLite |
| Biến `GOOGLE_*` | `.env` khi dev; OS keychain khi production | Không commit |

> **Ghi chú:** dữ liệu giờ nằm trên Turso Cloud (mã hóa phía nhà cung cấp);
> kế hoạch SQLCipher cho file local đã không còn cần thiết. Lộ trình bảo mật
> hiện tại: xem [roadmap.md](./roadmap.md).

---

## 6. Hai chế độ chạy (cùng một frontend)

`lib/backend.ts` dùng `isTauri()` để định tuyến:

- **Desktop (Tauri)** → `invoke()` tới backend Rust/SQLite (đường đi production).
- **Trình duyệt (web demo)** → store localStorage (`store/data-store.ts`) để
  demo nhanh, không cần cài đặt. Các tính năng cần đĩa thật (xem/khôi phục file,
  sao lưu) chỉ bật ở chế độ desktop.
