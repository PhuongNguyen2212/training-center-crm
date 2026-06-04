# Mô hình bảo mật

Tài liệu này mô tả lớp bảo vệ **của bản prototype web** và ranh giới trung thực
của nó, cùng những gì bản production (Tauri/SQLite theo CLAUDE.md) sẽ bổ sung.

## ⚠️ Giới hạn quan trọng (đọc trước)

Prototype là **ứng dụng chạy hoàn toàn trong trình duyệt**, dữ liệu nằm trong
`localStorage`. Điều này có nghĩa:

- Người dùng cuối **có thể đọc/sửa** localStorage và mã JS đang chạy. Không thể
  giấu bí mật hay ép buộc quyền một cách tuyệt đối ở phía client.
- Các biện pháp dưới đây **nâng cao rào cản** chống thao tác vô tình và tấn công
  hời hợt, **không** chống được người dùng kỹ thuật cố ý can thiệp.
- **Bảo mật thật** đòi hỏi backend kiểm tra lại mọi thứ ở phía server. Trong
  kiến trúc CLAUDE.md, đó là các lệnh Tauri (Rust) đọc lại vai trò từ phiên DB
  và xác thực trước mọi thao tác đọc/ghi.

> Quy tắc vàng: **không bao giờ tin role/userId do frontend gửi lên.**

## Lớp bảo vệ đã có trong prototype

| Cơ chế | Mô tả | Mã nguồn |
|--------|-------|----------|
| Băm mật khẩu | PBKDF2-SHA256, 150k vòng, salt ngẫu nhiên mỗi tài khoản. Tài khoản tạo/đổi trong app không lưu plaintext. | [src/lib/crypto.ts](src/lib/crypto.ts) |
| Khóa chống dò mật khẩu | Sai 5 lần → khóa đăng nhập 5 phút (theo email). | [src/store/auth-store.ts](src/store/auth-store.ts) |
| Chặn tài khoản bị treo | Tài khoản `suspended` không đăng nhập được dù đúng mật khẩu. | [src/store/auth-store.ts](src/store/auth-store.ts) |
| Hết hạn phiên | Tự đăng xuất sau 30 phút không thao tác. | [src/hooks/useSessionTimeout.ts](src/hooks/useSessionTimeout.ts) |
| Chính sách mật khẩu | ≥8 ký tự, có chữ + số; có thanh đo độ mạnh khi tạo/đổi. | [src/lib/crypto.ts](src/lib/crypto.ts) |
| Phân quyền theo vai trò | Ma trận quyền 1 nguồn; ẩn menu + chặn trang theo quyền. | [src/lib/permissions.ts](src/lib/permissions.ts) |
| Xác thực lại khi nhạy cảm | Xóa chứng từ tài chính yêu cầu nhập lại mật khẩu admin. | [src/features/finance/FinancePage.tsx](src/features/finance/FinancePage.tsx) |
| Nhật ký kiểm toán | Ghi log: đăng nhập (thành công/thất bại/bị chặn), đổi trạng thái học viên, thao tác chứng từ, thao tác nhân sự. | [src/store/data-store.ts](src/store/data-store.ts) |
| Không lộ thông tin | Thông báo đăng nhập sai không tiết lộ email đúng hay mật khẩu sai. | [src/store/auth-store.ts](src/store/auth-store.ts) |
| Soft delete | Học viên & chứng từ chỉ ẩn (giữ dữ liệu để kiểm toán). | [src/store/data-store.ts](src/store/data-store.ts) |
| Append-only điểm danh | Sửa điểm danh tạo bản ghi override, không xóa bản gốc. | [src/store/data-store.ts](src/store/data-store.ts) |

## Production sẽ bổ sung (theo CLAUDE.md)

- **bcrypt 12+ vòng** thay PBKDF2, băm & verify trong lệnh Tauri (Rust).
- **Kiểm tra quyền phía server** trong mọi lệnh Tauri; đọc lại vai trò từ DB.
- **OAuth Google** chạy ở backend; refresh token lưu trong **OS keychain**, không
  ở localStorage/`.env`/SQLite.
- **Khóa chống brute-force ở server**, không thể bỏ qua bằng cách xóa localStorage.
- **Audit log ghi vào DB** (không sửa được từ client).
- Tệp chứng từ lưu trong thư mục hạn chế qua Tauri `fs`, đường dẫn không cho
  người dùng sửa.

## Khi đưa lên web demo

- Client ID Google là công khai (không phải bí mật) nhưng hãy giới hạn bằng
  **Authorized JavaScript origins** đúng domain.
- **Không** đặt `GOOGLE_CLIENT_SECRET` vào biến `VITE_` — secret chỉ dùng ở
  backend.
- File `.env` đã nằm trong `.gitignore`; đừng commit giá trị thật vào
  `.env.example`.
