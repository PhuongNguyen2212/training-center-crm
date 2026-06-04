# CRM Trung tâm đào tạo — Prototype

Desktop CRM for a training center (Vietnamese-first UI). A fully clickable
prototype demonstrating every feature area with realistic seed data, the full
role system, a basic security layer, and a real Google Calendar integration.

Built per [CLAUDE.md](./CLAUDE.md): Tauri 2 · React 18 · TypeScript · Tailwind ·
Zustand · React Hook Form + Zod · React Router.

---

## Run it

### Option A — in the browser (instant, no Rust needed)

```bash
npm install
npm run dev          # http://localhost:1420
```

### Option B — as the real desktop app (Tauri)

Requires the Rust toolchain (https://rustup.rs). Then:

```bash
npm run tauri:dev    # desktop window
npm run tauri:build  # .exe installer in src-tauri/target/release
```

### Tests

```bash
npm test             # vitest run — 40 test cases
npm run test:watch
```

---

## Demo accounts

Click any card on the login screen to auto-fill, or use:

| Vai trò                 | Email                  | Mật khẩu     |
|-------------------------|------------------------|--------------|
| Quản trị viên (Admin)   | admin@trungtam.vn      | `admin123`   |
| Giáo viên (Teacher)     | minh.gv@trungtam.vn    | `teacher123` |
| Nhân viên tư vấn (Sales)| bao.tv@trungtam.vn     | `sales123`   |
| Nhân viên tài chính     | linh.tc@trungtam.vn    | `finance123` |

Log in as different roles to see the sidebar, permissions, and KPI views change.

---

## Features

| Mục | Mô tả |
|-----|-------|
| **Tổng quan** | Dashboard: thống kê, buổi học sắp tới, học viên mới, **audit log**. |
| **Học viên** | CRUD + quy tắc **CCCD** (12 số bắt buộc khi *Đã xác nhận*), soft delete, lọc/tìm, salesperson chỉ thấy học viên của mình. |
| **Lớp học** | Quản lý lớp, giáo viên phụ trách, **ghi danh/rút học viên** (sĩ số), trạng thái lớp, danh sách buổi học của lớp. Giáo viên chỉ xem lớp mình. Điểm danh & bài tập lấy **sĩ số theo lớp**. |
| **Lịch học** | Tích hợp **Google Calendar thật** (xem dưới): kết nối, đồng bộ, tạo/sửa/xóa buổi học. Fallback cục bộ khi chưa cấu hình. Giáo viên chỉ xem lịch của mình. |
| **Điểm danh** | Danh sách buổi học kiểu lịch điện thoại; **append-only** — sửa tạo bản ghi override, giữ lịch sử. |
| **Tài chính** | Upload chứng từ (kiểm tra định dạng/≤5MB), salesperson chỉ xem, xóa cần **xác thực lại** mật khẩu admin. |
| **KPI** | Bài tập về nhà theo buổi (giáo viên) + báo cáo bán hàng: tỷ lệ chuyển đổi, doanh thu giới thiệu (sales/admin). |
| **Nhân sự (HR)** | *(admin)* Tạo tài khoản (mật khẩu băm + đo độ mạnh), phân quyền, **treo/kích hoạt**, đặt lại mật khẩu. |
| **Bảo mật** | Băm mật khẩu PBKDF2, khóa chống dò mật khẩu, hết hạn phiên, đổi mật khẩu, audit. Xem [SECURITY.md](./SECURITY.md). |

---

## Google Calendar (web demo)

Màn hình **Lịch học** gọi Google Calendar API thật qua Google Identity Services
(OAuth popup trong trình duyệt). Cấu hình bằng `.env`:

```
VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
VITE_GOOGLE_CALENDAR_ID=primary
```

Hướng dẫn tạo Client ID từng bước: **[docs/google-calendar-setup.md](./docs/google-calendar-setup.md)**.
Khi chưa cấu hình, app tự chạy chế độ cục bộ. Lưu ý token chỉ giữ trong phiên —
refresh trang cần kết nối lại.

---

## Security (basic)

Prototype có lớp bảo vệ cơ bản: **băm mật khẩu (PBKDF2)**, **khóa tài khoản** sau
5 lần sai, **chặn tài khoản bị treo**, **tự đăng xuất** khi không hoạt động 30
phút, **đổi mật khẩu**, **xác thực lại** khi xóa chứng từ, và **audit log**.

> ⚠️ Vì là SPA chạy trong trình duyệt (dữ liệu ở localStorage), đây là rào cản
> cơ bản — **không thay thế** backend kiểm tra phía server. Chi tiết & lộ trình
> production trong [SECURITY.md](./SECURITY.md).

---

## Testing

40 test (Vitest) phủ các quy tắc nghiệp vụ & bảo mật, gồm cả test "bug guard"
chốt lại các lỗi đã sửa:

- `src/lib/permissions.test.ts` — ma trận phân quyền.
- `src/lib/crypto.test.ts` — băm/verify mật khẩu, độ mạnh.
- `src/features/students/student-schema.test.ts` — quy tắc CCCD + validate.
- `src/store/data-store.test.ts` — append-only điểm danh, soft delete, HR, upsert
  Google.
- `src/store/auth-store.test.ts` — đăng nhập, khóa, treo, đổi mật khẩu, hết phiên.

---

## Prototype vs. production

**Bản web demo** dùng **Zustand store + localStorage** (`src/data/seed.ts`,
`src/store/`) để chạy ổn định, không phụ thuộc.

**Tầng production thật (Tauri + SQLite) — đã xây & compile được (Phase 1):**
backend Rust với SQLite (`rusqlite`), **bcrypt**, phiên đăng nhập + **kiểm tra
quyền phía server**, **khóa chống dò mật khẩu**, audit ghi DB. Đã có lệnh cho
auth, học viên (kèm quy tắc CCCD server-side), nhân sự, audit. Chi tiết & lộ
trình Phase 2: **[docs/production-backend.md](./docs/production-backend.md)**.

- [prisma/schema.prisma](./prisma/schema.prisma) — mô hình dữ liệu (có `Class`).
- [src-tauri/migrations/0001_init.sql](./src-tauri/migrations/0001_init.sql) — schema SQLite.
- [src-tauri/src/](./src-tauri/src/) — db, auth, commands.
- [src/lib/backend.ts](./src/lib/backend.ts) — client typed + `isTauri()`.

Chạy backend thật: `npm run tauri:dev` (DB tạo ở app-data dir).
Reset dữ liệu: xóa localStorage (web) hoặc file `crm.db` (desktop).

---

## Project layout

```
src/
  components/   shared UI (AppLayout, Modal, ChangePasswordModal, ui)
  data/         seeded Vietnamese demo data
  features/     students · schedule · attendance · finance · kpi · staff
  hooks/        useSessionTimeout
  lib/          labels (vi), permissions, nav, crypto, google-calendar
  pages/        Login, Dashboard
  store/        auth + data Zustand stores (+ *.test.ts)
  test/         vitest setup
  types/        domain types (mirror Prisma)
src-tauri/      Tauri 2 shell (Rust)
prisma/         production schema
docs/           Google Calendar setup guide
```

---

## Deploy (web demo)

`npm run build` → host thư mục `dist/` trên bất kỳ static host nào (Netlify
drag-drop, Vercel, Cloudflare Pages). App là SPA — cấu hình host fallback về
`index.html`. Đặt biến `VITE_GOOGLE_*` trong Environment Variables của host và
thêm domain vào *Authorized JavaScript origins* của Google.
