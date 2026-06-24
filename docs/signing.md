# Ký số installer (Windows code signing)

Khi ký số file cài đặt (`.msi` / `.exe`), Windows **SmartScreen** không còn cảnh
báo "Nhà phát hành không xác định", và người dùng tin tưởng hơn khi cài. Tài liệu
này hướng dẫn cấu hình ký cho bản build Tauri.

> **Cần gì từ bạn:** một **chứng chỉ code-signing** mua từ CA (DigiCert, Sectigo,
> GlobalSign…). Claude/máy build **không thể tự tạo** chứng chỉ được tin cậy.
> - **OV** (Organization Validation): rẻ hơn, nhưng SmartScreen cần "tích lũy uy
>   tín" một thời gian mới hết cảnh báo.
> - **EV** (Extended Validation): hết cảnh báo ngay, nhưng đắt hơn và thường yêu
>   cầu khóa nằm trên USB token/HSM.

---

## 1. Đã cấu hình sẵn trong repo

`src-tauri/tauri.conf.json` đã đặt mặc định an toàn:

```json
"bundle": {
  "windows": {
    "digestAlgorithm": "sha256",
    "timestampUrl": "http://timestamp.digicert.com"
  }
}
```

- **Chưa có `certificateThumbprint`** → build thường **không ký** (không lỗi).
- `timestampUrl` đảm bảo chữ ký vẫn hợp lệ sau khi chứng chỉ hết hạn.

## 2. Khi đã có chứng chỉ

### Bước 1 — Import chứng chỉ vào Windows certificate store
- Nếu có file `.pfx`/`.p12`: nhấp đúp → Import vào **Current User → Personal**.
- Nếu dùng EV token: cài driver token theo hướng dẫn của CA.

### Bước 2 — Lấy thumbprint
PowerShell:
```powershell
Get-ChildItem Cert:\CurrentUser\My | Format-List Subject, Thumbprint
```
Sao chép chuỗi `Thumbprint` (40 ký tự hex) của chứng chỉ tương ứng.

### Bước 3 — Tạo lớp cấu hình ký (không commit)
Sao chép file ví dụ rồi điền thumbprint:
```bash
cp src-tauri/tauri.signing.example.json src-tauri/tauri.signing.json
```
Sửa `certificateThumbprint` trong `src-tauri/tauri.signing.json`. File này đã được
`.gitignore` bỏ qua (chứa thông tin nhạy cảm).

### Bước 4 — Build có ký
```bash
npm run tauri build -- --config src-tauri/tauri.signing.json
```
Tauri merge lớp cấu hình này lên `tauri.conf.json` và ký bằng chứng chỉ tham
chiếu qua thumbprint.

### Bước 5 — Kiểm tra chữ ký
```powershell
Get-AuthenticodeSignature ".\src-tauri\target\release\bundle\msi\*.msi" |
  Format-List Status, SignerCertificate
```
`Status` phải là `Valid`.

---

## 3. Ký trong CI (tùy chọn)

- Lưu chứng chỉ ở dạng base64 trong secret của CI, giải mã thành `.pfx` lúc build,
  import vào store, đặt `certificateThumbprint` qua `tauri.signing.json` sinh động.
- Với EV token không export được khóa: phải build trên máy/máy ảo có gắn token,
  hoặc dùng dịch vụ ký đám mây (Azure Trusted Signing, DigiCert KeyLocker) qua
  trường `signCommand` của Tauri.

## 4. macOS / Linux (tham khảo)

- **macOS**: cần Apple Developer ID + notarize (`bundle.macOS.signingIdentity`,
  biến `APPLE_*`). Ngoài phạm vi tài liệu này.
- **Linux**: `.deb`/AppImage thường không ký theo kiểu Authenticode; phân phối qua
  checksum/repo có GPG.
