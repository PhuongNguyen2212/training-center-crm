# Database backup & restore

Nightly off-site backups of the shared Turso database, stored in the private
Cloudflare R2 bucket under `backups/`.

## How it works

```
GitHub Actions (02:00 VN hằng đêm)
   └─► cargo run --bin backup        (headless, no Tauri)
         ├─ connect Turso (TURSO_*)
         ├─ dump mọi bảng thành INSERT statements (.sql)
         └─ upload R2: backups/crm-YYYY-MM-DD-HHMM.sql
```

- Workflow: [.github/workflows/backup.yml](../.github/workflows/backup.yml)
  (cron + nút **Run workflow** để backup thủ công).
- Code: `src-tauri/src/dump.rs` (tạo dump) + `src-tauri/src/bin/backup.rs`.
- Chạy tay trên máy dev: `cd src-tauri && cargo run --bin backup --no-default-features`.

## One-time setup (GitHub secrets)

Repo → **Settings → Secrets and variables → Actions → New repository secret**,
thêm đúng các giá trị trong `.env`:

```
TURSO_DATABASE_URL   TURSO_AUTH_TOKEN
R2_ENDPOINT   R2_BUCKET   R2_ACCESS_KEY_ID   R2_SECRET_ACCESS_KEY
```

Không có secrets thì workflow fail ngay bước chạy — không lộ gì cả.

## Restore drill (diễn tập khôi phục)

Mục tiêu: từ file `.sql` dựng lại database dùng được.

1. Tải file backup mới nhất từ R2 (Cloudflare dashboard → R2 → bucket →
   `backups/`).
2. Tạo database Turso mới (hoặc dùng file SQLite local để diễn tập):
   ```bash
   turso db create crm-restore
   ```
3. Áp schema trước, rồi nạp dữ liệu:
   ```bash
   turso db shell crm-restore < src-tauri/migrations/0001_init.sql
   turso db shell crm-restore < crm-2026-07-15-0515.sql
   ```
4. Kiểm chứng: `turso db shell crm-restore "SELECT COUNT(*) FROM students;"`
   — số lượng phải khớp production.
5. Muốn chuyển hẳn sang bản khôi phục: đổi `TURSO_DATABASE_URL` +
   `TURSO_AUTH_TOKEN` trên Render sang database mới.

> 🗓️ Nên diễn tập restore **mỗi quý một lần** — backup chưa từng restore thử
> là backup chưa chắc dùng được.

## Retention

R2 giữ file vô thời hạn. Token R2 hiện **không có quyền delete** (tối thiểu
quyền), nên dọn file cũ làm thủ công trong Cloudflare dashboard (giữ ~30 ngày
gần nhất là đủ). Có thể bật R2 lifecycle rule để tự xóa sau N ngày.
