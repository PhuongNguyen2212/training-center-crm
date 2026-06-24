# Bảo mật hạ tầng — Checklist

Tóm tắt những gì đang bảo vệ hệ thống + việc **bạn phải tự làm** để không bị hack.

## ✅ Đã có trong code
- **Mật khẩu**: băm bằng bcrypt cost 12 (không bao giờ lưu mật khẩu thật).
- **Chống dò mật khẩu**: khóa đăng nhập tạm thời sau nhiều lần sai (`LoginGuard`).
- **Chống SQL injection**: mọi giá trị người dùng đi qua tham số `?1` (không nối chuỗi).
- **Phân quyền chặt**: mọi lệnh đọc lại role từ DB, không tin frontend; ma trận quyền deny-by-default.
- **Audit log**: ghi lại đăng nhập, đổi trạng thái học viên, thao tác chứng từ.
- **Xóa mềm**: học viên & chứng từ không bị xóa cứng.
- **Bí mật KHÔNG vào git**: `.env`, key service-account, khóa ký đều đã gitignore (đã kiểm tra cả lịch sử — sạch).
- **CORS cấu hình được**: đặt `ALLOWED_ORIGINS` để chỉ cho đúng web gọi API.

## ⚠️ Bạn PHẢI làm khi lên production
1. **Đổi mật khẩu admin mặc định** `admin123` ngay sau lần đăng nhập đầu (mật khẩu mạnh).
2. **Đặt `ALLOWED_ORIGINS`** = đúng domain web (xem `docs/deploy.md`).
3. **Bí mật chỉ nạp lúc chạy** trên host (`fly secrets set ...`) — không bao giờ commit `.env`.
4. **Bật HTTPS**: Fly/Vercel tự lo (`force_https`). Không dùng HTTP trần khi production.
5. **R2**: token chỉ cấp quyền tối thiểu (put/get/delete đúng 1 bucket `crm`), không dùng API token toàn tài khoản.
6. **Turso**: token gắn đúng 1 database; nếu nghi lộ → `turso db tokens invalidate` rồi tạo token mới.

## 🔑 Nếu lỡ lộ khóa (rotate ngay)
- **Turso**: `turso db tokens invalidate <db>` → tạo token mới → cập nhật `fly secrets`.
- **R2**: xóa Access Key trong Cloudflare dashboard → tạo cặp mới.
- **Service account**: xóa key trong Google Cloud Console → tạo key mới → cập nhật `GOOGLE_SERVICE_ACCOUNT_B64`.

## 📌 Hạn chế đã biết (chấp nhận ở MVP)
- **App desktop nhúng bí mật trong file .exe**: bất kỳ ai có file cài đều có thể trích token Turso/R2. Vì DB dùng chung online. Hướng nâng cấp sau: cho desktop cũng gọi qua server API (như web) thay vì nối thẳng Turso → khóa không nằm trên máy người dùng.
- **Phiên đăng nhập lưu trong RAM server**: restart server = đăng nhập lại. Nâng cấp sau: JWT hoặc lưu phiên ở DB.
