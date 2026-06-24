# Phát hành & gửi app desktop cho người dùng

Hướng dẫn build file cài đặt và gửi cho giáo viên/admin cài lên máy.

> **Quan trọng:** app **tự chứa khóa bí mật** (Turso/R2/Google) — chúng được
> **nhúng tự động lúc build** từ file `.env` trên máy bạn (xem `build.rs`). Vì
> vậy chỉ build trên **máy của bạn** (nơi có `.env` thật), và **chỉ gửi file cài
> cho nhân viên tin cậy** — KHÔNG đăng công khai (ai có file đều dùng được khóa).

---

## 1. Build file cài đặt

Trên máy bạn (đã có `.env` đầy đủ), chạy:
```bash
npm run tauri build
```
Quá trình này: build frontend → biên dịch Rust (nhúng khóa từ `.env`) → đóng gói.
Lần đầu khá lâu (~5–15 phút).

**File cài đặt nằm ở** `src-tauri/target/release/bundle/`:
- `msi/CRM Trung tâm đào tạo_0.1.0_x64_en-US.msi` — bộ cài Windows (khuyên dùng).
- `nsis/CRM Trung tâm đào tạo_0.1.0_x64-setup.exe` — bộ cài kiểu NSIS.

→ **Gửi 1 trong 2 file này** cho người dùng.

## 2. Gửi file cho người dùng (host ở đâu)

Chọn một cách:

| Cách | Phù hợp |
|---|---|
| **Google Drive / OneDrive** | Đơn giản nhất — upload file `.msi`, bấm *Share*, gửi link tải. Đặt quyền "Ai có link" hoặc giới hạn theo email nhân viên. |
| **Zalo / Telegram / email** | Gửi trực tiếp file cho từng người (file vài chục MB). |
| **GitHub Releases** | Nếu có repo riêng tư: tạo Release, đính kèm file. Có lịch sử phiên bản. |
| **USB** | Chép tay khi cài tại chỗ. |

> Vì file chứa khóa, ưu tiên cách **giới hạn người nhận** (Drive theo email, hoặc
> gửi riêng), tránh link công khai.

## 3. Người dùng cài đặt (gửi kèm hướng dẫn này)

1. Tải file `.msi` (hoặc `.exe`) về máy.
2. Bấm đúp để cài. Nếu Windows hiện **"Windows protected your PC"** (SmartScreen):
   bấm **More info → Run anyway** (do app chưa ký số — xem mục 5).
3. Làm theo trình cài đặt → Finish. App xuất hiện trong Start Menu.
4. Mở app, đăng nhập bằng tài khoản được cấp. **Cần có Internet** (dữ liệu trên
   cloud Turso).

## 4. Cập nhật phiên bản sau này

1. Sửa code → tăng `version` trong `src-tauri/tauri.conf.json` (vd `0.1.1`).
2. `npm run tauri build` lại → gửi file mới cho người dùng cài đè.
3. **Dữ liệu không bị ảnh hưởng** — nó nằm trên Turso, không nằm trong app.

## 5. (Tùy chọn) Ký số để hết cảnh báo SmartScreen

Mỗi máy cài lần đầu sẽ thấy cảnh báo "nhà phát hành không xác định". Để bỏ cảnh
báo, **ký số** file cài bằng chứng chỉ code-signing — xem `docs/signing.md`.
Không bắt buộc; nhân viên chỉ cần bấm *Run anyway* một lần.

---

## Tóm tắt nhanh
```bash
# build (trên máy bạn, có .env thật)
npm run tauri build
# → lấy file ở: src-tauri/target/release/bundle/msi/*.msi
# → upload Google Drive → gửi link cho nhân viên → họ tải về, cài, đăng nhập
```
