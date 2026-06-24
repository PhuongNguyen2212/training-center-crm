# Đưa lên mạng (Deploy): Server + Web

Mục tiêu: mọi người vào app bằng **link** trên máy tính/điện thoại.

```
Trình duyệt (web/mobile)  ─►  Web (Vercel)  ─►  Server API (Fly.io)  ─►  Turso + R2
```

- **Server** giữ khóa bí mật, phục vụ dữ liệu (đã tách khỏi Tauri → ảnh nhẹ).
- **Web** là giao diện tĩnh, gọi server qua HTTP.

---

## Phần A — Deploy Server lên Fly.io

### 1. Cài Fly CLI + đăng nhập
```bash
# Windows (PowerShell):
iwr https://fly.io/install.ps1 -useb | iex
fly auth signup     # hoặc: fly auth login
```

### 2. Tạo app (chưa deploy vội)
Ở thư mục gốc dự án (có sẵn `Dockerfile` + `fly.toml`):
```bash
fly launch --no-deploy --copy-config --name crm-trungtam-server
```
(đổi tên nếu trùng; nó dùng `fly.toml` + `Dockerfile` có sẵn)

### 3. Nạp secrets (khóa bí mật — KHÔNG nằm trong ảnh Docker)
```bash
fly secrets set \
  TURSO_DATABASE_URL="libsql://...turso.io" \
  TURSO_AUTH_TOKEN="ey..." \
  R2_ACCOUNT_ID="..." \
  R2_ACCESS_KEY_ID="..." \
  R2_SECRET_ACCESS_KEY="..." \
  R2_BUCKET="crm" \
  R2_ENDPOINT="https://<account>.r2.cloudflarestorage.com"
```
*(Lấy đúng giá trị trong file `.env` của bạn.)*

(Tùy chọn — bật đẩy Google Calendar trên server: `fly secrets set GOOGLE_CALENDAR_ID="...@group.calendar.google.com" GOOGLE_SERVICE_ACCOUNT_B64="$(base64 -w0 mercurial-...json)"`)

### 4. Deploy
```bash
fly deploy
```
Xong nó cho một URL, ví dụ **`https://crm-trungtam-server.fly.dev`**. Thử:
```bash
curl https://crm-trungtam-server.fly.dev/api/health   # → ok
```

> Railway tương tự: tạo project từ repo, nó tự nhận `Dockerfile`, đặt biến môi trường y như trên, expose cổng 8080.

---

## Phần B — Deploy Web lên Vercel

### 1. Đẩy code lên GitHub (nếu chưa)
```bash
git add . && git commit -m "deploy" && git push
```

### 2. Import vào Vercel
- Vào <https://vercel.com> → **Add New → Project** → chọn repo.
- **Framework Preset:** Vite. **Build Command:** `npm run build`. **Output:** `dist`.

### 3. Đặt biến môi trường trên Vercel
Project → **Settings → Environment Variables**, thêm:
```
VITE_API_URL = https://crm-trungtam-server.fly.dev
```
(URL server ở Phần A). Tùy chọn thêm `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CALENDAR_ID` nếu cần lịch ở bản web.

### 4. Deploy
Bấm **Deploy**. Vercel cho một link, ví dụ `https://crm-trungtam.vercel.app`.

→ Mở link đó trên **máy tính hoặc điện thoại** → đăng nhập `admin@trungtam.vn / admin123` → dữ liệu thật, chung với app desktop.

---

## Lưu ý
- **CORS (quan trọng khi production):** sau khi có link web ở Phần B, khóa server chỉ nhận đúng domain đó:
  ```bash
  fly secrets set ALLOWED_ORIGINS="https://crm-trungtam.vercel.app"
  ```
  (nhiều domain thì ngăn cách bằng dấu phẩy). Không đặt = mở cho mọi nguồn (chỉ nên để khi dev local).
- **Phiên đăng nhập** lưu trong RAM server: nếu server khởi động lại, người dùng đăng nhập lại. Đủ cho MVP; sau này có thể chuyển sang JWT.
- **Chi phí:** Fly.io + Vercel đều có gói **miễn phí** đủ cho một trung tâm nhỏ. Server đặt `min_machines_running = 0` (tự ngủ khi không dùng, tự dậy khi có request — tiết kiệm).
- App **desktop** (.exe) vẫn build riêng (`npm run tauri build`) khi nào ổ C: có chỗ; nó dùng chung Turso/R2 nên **chung dữ liệu** với web.
