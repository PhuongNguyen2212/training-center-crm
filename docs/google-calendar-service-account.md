# Google Calendar cho app desktop — Service Account (lịch chung)

Mục tiêu: app đẩy **mọi buổi học** lên **một lịch Google chung**; giáo viên & admin
đăng ký lịch đó trên điện thoại để **ai cũng thấy toàn bộ lịch học**.

Dùng **Service Account** (máy-nói-chuyện-máy) thay vì đăng nhập OAuth — vì luồng
OAuth trình duyệt **không chạy trong app Tauri**. Service account gọi thẳng từ
backend Rust, không cần popup, không cần đăng nhập trên từng máy.

> Đây là kênh **một chiều**: app → Google (để xem). Quản lý buổi học vẫn làm
> trong app (lưu trên Turso).

---

## A. Tạo Service Account + key (Google Cloud Console)

1. Vào <https://console.cloud.google.com> → tạo (hoặc chọn) một **Project**.
2. **APIs & Services → Library** → tìm **Google Calendar API** → **Enable**.
3. **APIs & Services → Credentials → Create credentials → Service account**:
   - Đặt tên, ví dụ `crm-calendar`.
   - Tạo xong, mở service account → tab **Keys → Add key → Create new key → JSON**.
   - Tải file JSON về (ví dụ `google-sa.json`). **Giữ bí mật, không commit.**
4. Mở file JSON, ghi nhớ trường **`client_email`** (dạng
   `crm-calendar@<project>.iam.gserviceaccount.com`) — đây là "email" của service
   account, dùng để chia sẻ lịch ở bước B.

## B. Tạo lịch chung + cho service account quyền ghi

1. Vào <https://calendar.google.com> bằng tài khoản trung tâm.
2. Bên trái **Other calendars → +** → **Create new calendar** → đặt tên
   ví dụ "Lịch học Trung tâm" → **Create calendar**.
3. Mở **Settings** của lịch vừa tạo → mục **Share with specific people**:
   - **Add people** → dán **`client_email`** của service account (bước A.4).
   - Quyền: **Make changes to events**. → Save.
4. Vẫn trong Settings, kéo xuống **Integrate calendar** → copy **Calendar ID**
   (dạng `...@group.calendar.google.com`).

## C. Cho giáo viên/admin xem trên điện thoại

Trong Settings của lịch:
- Cách 1 (riêng tư): **Share with specific people** → thêm email Google của từng
  giáo viên/admin (quyền *See all event details*). Họ sẽ thấy lịch trong app
  Google Calendar trên điện thoại (bật/tắt được, cạnh lịch cá nhân).
- Cách 2 (nhanh): bật **Make available to public** (chỉ xem) → ai có link cũng
  đăng ký được. (Cân nhắc quyền riêng tư.)

## D. Khai báo cho app

Sao chép file key vào dự án (đã gitignore) và điền `.env`:
```
GOOGLE_SERVICE_ACCOUNT_FILE=./google-sa.json
GOOGLE_CALENDAR_ID=...@group.calendar.google.com
```

Gửi Claude **file key JSON** + **Calendar ID** (hoặc tự đặt vào `.env`) → Claude
viết phần đẩy lịch ở backend và test bằng một buổi học thật.

---

## Sau khi có key — phần Claude làm
- Backend Rust: xác thực service account (ký JWT → access token Google), gọi
  Calendar API **insert/update/delete** sự kiện trên lịch chung.
- Khi tạo/sửa/xóa buổi học trong app → tự đẩy lên Google, lưu `google_event_id`
  vào Turso để các máy không tạo trùng.
