# Kết nối Google Calendar (bản web demo)

Màn hình **Lịch học** có thể gọi Google Calendar API thật: kết nối tài khoản
Google bằng popup OAuth, rồi tạo/sửa/xóa và đồng bộ buổi học trực tiếp trên một
lịch Google. Khi chưa cấu hình, ứng dụng tự chạy ở chế độ cục bộ (dữ liệu lưu
trong trình duyệt).

Làm theo 5 bước dưới đây (~10 phút).

---

## 1. Tạo project trên Google Cloud

1. Vào https://console.cloud.google.com → đăng nhập.
2. Trên thanh trên cùng, bấm chọn project → **New Project** → đặt tên (vd
   `CRM Trung tam`) → **Create**.

## 2. Bật Google Calendar API

1. Menu trái → **APIs & Services → Library**.
2. Tìm **Google Calendar API** → **Enable**.

## 3. Cấu hình màn hình đồng ý (OAuth consent screen)

1. **APIs & Services → OAuth consent screen**.
2. Chọn **User type = External** → **Create**.
3. Điền: App name, User support email, Developer email → **Save and Continue**.
4. **Scopes**: bấm **Add or Remove Scopes**, thêm
   `https://www.googleapis.com/auth/calendar.events` → **Update** → **Save**.
5. **Test users**: thêm địa chỉ Gmail bạn sẽ dùng để demo (khi app đang ở chế độ
   *Testing*, chỉ các tài khoản này đăng nhập được) → **Save**.

## 4. Tạo OAuth Client ID (loại Web)

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. **Application type = Web application**.
3. **Authorized JavaScript origins** — thêm đúng origin nơi bạn chạy app:
   - `http://localhost:1420` (khi chạy `npm run dev`)
   - URL demo đã host, vd `https://crm-demo.netlify.app` (KHÔNG kèm dấu `/` cuối)
4. **Authorized redirect URIs**: với luồng token của Google Identity Services,
   thường KHÔNG cần. Cứ để trống.
5. **Create** → copy **Client ID** (dạng `xxxx.apps.googleusercontent.com`).

> Lưu ý: luồng web này KHÔNG dùng client secret — đừng đưa secret vào frontend.

## 5. Lấy Calendar ID & điền .env

1. Mở https://calendar.google.com → bánh răng **Settings**.
2. Chọn lịch ở cột trái → **Integrate calendar** → copy **Calendar ID**.
   - Dùng lịch chính thì để `primary`.
   - Lịch phụ có dạng `...@group.calendar.google.com`.
   - Muốn ghi vào lịch của người khác: chia sẻ lịch đó cho tài khoản demo với
     quyền **“Make changes to events”**.
3. Trong thư mục dự án, copy `.env.example` thành `.env` và điền:

   ```
   VITE_GOOGLE_CLIENT_ID=123456789-abcdef.apps.googleusercontent.com
   VITE_GOOGLE_CALENDAR_ID=primary
   ```

4. Khởi động lại dev server (`npm run dev`) — Vite chỉ đọc `.env` khi khởi động.

---

## Dùng thử

1. Vào trang **Lịch học**, đăng nhập vai trò **Quản trị viên**.
2. Bấm **Kết nối Google** → chọn tài khoản → đồng ý quyền.
   - Lần đầu có thể hiện cảnh báo “app chưa được Google xác minh” → **Advanced →
     Go to … (unsafe)**. Bình thường ở giai đoạn Testing.
3. Bấm **Tạo buổi học** → buổi học được tạo trên Google Calendar; mở
   calendar.google.com để kiểm chứng.
4. **Đồng bộ** kéo các sự kiện từ Google về (gộp theo `google_event_id`).

## Khi host lên web

- Thêm domain demo vào **Authorized JavaScript origins** (bước 4.3).
- Đặt biến môi trường `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CALENDAR_ID` trong
  cấu hình build của nhà cung cấp (Netlify/Vercel → Environment Variables) rồi
  build lại — biến `VITE_` được nhúng vào bundle lúc build.

## Sự cố thường gặp

| Lỗi | Nguyên nhân / cách xử lý |
|-----|--------------------------|
| `redirect_uri_mismatch` / `origin` không hợp lệ | Origin chưa khớp **Authorized JavaScript origins**. Thêm đúng `http(s)://host:port`, không kèm `/`. |
| `access_denied` | Tài khoản chưa nằm trong **Test users**, hoặc đã từ chối quyền. |
| `403` / `insufficientPermissions` | Tài khoản không có quyền sửa lịch đó. Chia sẻ lịch với quyền chỉnh sửa, hoặc dùng `primary`. |
| Popup bị chặn | Cho phép popup cho trang demo. |
| Đổi `.env` nhưng không ăn | Restart `npm run dev` (Vite đọc env lúc khởi động). |
