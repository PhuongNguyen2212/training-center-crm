# Training Center CRM — Project Memory

This file gives Claude persistent context for every session. Read it fully before writing any code, making decisions, or answering project questions.

---

## Project Overview

- **Product**: A desktop CRM for managing a training center / language or skill school
- **Users**: Admins, Teachers, Course Salespeople (each with different access levels)
- **Runtime**: File-based desktop app — no web server; mostly offline except Google Calendar integration for class scheduling
- **Data storage**: Single local SQLite file (portable, backupable)
- **Stage**: MVP in active development
- **Language**: Vietnamese-first UI; field names and labels in Vietnamese where noted

---

## Tech Stack

| Layer        | Technology                              |
|--------------|-----------------------------------------|
| Shell        | Tauri (Rust backend + web frontend)     |
| Frontend     | React 18 + TypeScript + Tailwind CSS    |
| Database     | SQLite (single `.db` file)              |
| ORM          | Prisma (SQLite provider)                |
| State Mgmt   | Zustand                                 |
| Forms        | React Hook Form + Zod validation        |
| File Storage | Local filesystem via Tauri `fs` API     |
| Auth         | Local bcrypt password (no JWT/tokens)   |
| Calendar     | Google Calendar API v3 (OAuth 2.0)      |
| Packaging    | Tauri bundler → `.exe` / `.dmg` / `.deb`|

---

## Project Structure

```
/
├── src/                        # React frontend
│   ├── components/             # Shared UI components
│   ├── pages/                  # Route-level pages
│   ├── features/
│   │   ├── students/           # Học viên management
│   │   ├── schedule/           # Lịch học — Google Calendar integration
│   │   ├── attendance/         # Điểm danh
│   │   ├── finance/            # Tài chính / payment docs
│   │   └── kpi/                # KPI & homework tracking
│   ├── hooks/                  # Custom React hooks
│   ├── store/                  # Zustand stores
│   └── lib/                    # Tauri invoke wrappers, utils
├── src-tauri/                  # Tauri Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/           # Tauri commands (DB queries, file ops)
│   │   └── db/                 # SQLite connection, migrations
│   └── tauri.conf.json
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── CLAUDE.md
└── .env.example
```

---

## Core Domain Concepts

- **Học viên (Student)**: A person enrolled or prospective at the training center
- **Xác nhận học (Enrollment Confirmation)**: Student is confirmed enrolled — triggers CCCD (national ID) requirement
- **CCCD**: Vietnamese national ID card — required document once a student confirms enrollment
- **Điểm danh (Attendance)**: Per-session attendance record for a student in a class
- **Lịch học (Class Schedule)**: The timetable for a course/class — managed and displayed via Google Calendar; sessions synced back to local SQLite as `Session` records
- **Buổi học (Session)**: A single class session — attendance is recorded per session
- **Giáo viên (Teacher)**: Staff member who teaches sessions and marks attendance
- **Nhân viên tư vấn (Course Salesperson)**: Staff who sells courses; has access to sales reports only
- **Admin**: Full access — manages students, staff, finance, and KPI
- **Payment Document**: A file (image or PDF) uploaded as proof of payment; 2 roles can edit, 1 role can only view
- **KPI / Bài tập về nhà (Homework)**: Tracked per student per session — status is either `completed` or `not_completed`

---

## Feature Specifications

### 1. Quản lý thông tin học viên (Student Management)

Fields per student:
- `name` — Họ và tên
- `age` — Tuổi
- `phone` — Số điện thoại
- `position` / `job_title` — Vị trí công việc
- `goal` / `aspiration` — Nguyện vọng
- `enrollment_status` — enum: `prospect`, `confirmed`, `dropped`
- `cccd_number` — Số CCCD (12-digit Vietnamese national ID number, required when status = `confirmed`)

**Business rule**: When `enrollment_status` changes to `confirmed`, the system must prompt for and validate that `cccd_number` is provided and matches the 12-digit Vietnamese ID format (`/^[0-9]{12}$/`) before saving.

---

### 2. Điểm danh (Attendance)

- Attendance is recorded **per student, per session (buổi học)**
- UI resembles a phone calendar — sessions displayed by date, tap to mark attendance
- Attendance status: `present`, `absent`, `late`, `excused`
- **Role-based access**:
  - `teacher` — can mark and edit attendance for their own classes only
  - `admin` — can view and edit all attendance records
  - `salesperson` — no access to attendance
- Every attendance record must store: `studentId`, `sessionId`, `status`, `markedBy` (userId), `markedAt`
- Attendance serves as **proof of participation** — records are append-only; corrections create a new override record, not an edit

---

### 3. Lịch học / Class Schedule (Google Calendar Integration)

- Class sessions (buổi học) are created, edited, and deleted via **Google Calendar**
- The app connects to a designated Google Calendar using **OAuth 2.0** (admin authenticates once; token stored locally)
- Each calendar event maps to a `Session` record in the local SQLite DB
- **Sync strategy**: Pull events from Google Calendar on app launch and on manual refresh; write back to Google Calendar on create/edit/delete
- Session fields synced from Google Calendar event:
  - `google_event_id` — Google Calendar event ID (used for sync)
  - `title` — Event summary (e.g. "Lớp A - Buổi 3")
  - `start_time` — Event start datetime
  - `end_time` — Event end datetime
  - `teacher_id` — Mapped from event description or attendee email
  - `class_id` — Mapped from a custom event property or naming convention
- **Role-based access to schedule**:
  - `admin` — can create, edit, delete sessions via Google Calendar
  - `teacher` — can view their own sessions; cannot edit via app (edit in Google Calendar directly)
  - `salesperson` — no access to schedule
- If Google Calendar is unreachable (no internet), the app falls back to the last synced local sessions — read-only mode for schedule
- Google OAuth tokens stored securely in Tauri's secure storage (not plaintext in `.env` or SQLite)
- Add `google_event_id TEXT UNIQUE` to the `Session` table for deduplication on sync


---

### 4. Tài chính / Finance (Payment Documents)

- Staff can upload payment proof documents (image or PDF) linked to a student
- **Role permissions**:
  - `admin` — can upload, edit, delete
  - `finance_staff` (2nd edit role) — can upload and edit
  - `salesperson` — view only, cannot edit or delete
- Document fields: `studentId`, `amount`, `payment_date`, `file_path`, `note`, `uploadedBy`, `uploadedAt`
- Max file size: **5MB** per document
- Accepted formats: `image/jpeg`, `image/png`, `application/pdf`
- Files stored in a local folder managed by Tauri `fs` API — never stored as blobs in SQLite

---

### 5. KPI Management

#### Homework Tracking (per Teacher)
- Teachers record homework completion per student per session
- Status: `completed` | `not_completed`
- Teacher can filter by class, session, or student

#### Sales Report (per Salesperson)
- Salespeople see their own sales KPI dashboard:
  - Number of new students enrolled this month
  - Revenue from their referrals
  - Conversion rate (prospects → confirmed)
- Admins can view all salespeople's reports

---

## Role & Permission Matrix

| Feature                  | Admin | Teacher | Salesperson | Finance Staff |
|--------------------------|-------|---------|-------------|---------------|
| View class schedule      | ✅    | ✅ (own) | ❌         | ❌            |
| Edit class schedule      | ✅    | ❌      | ❌          | ❌            |
| View students            | ✅    | ✅      | ✅ (own)    | ✅            |
| Edit students            | ✅    | ❌      | ✅ (own)    | ❌            |
| Mark attendance          | ✅    | ✅ (own class) | ❌   | ❌            |
| View attendance          | ✅    | ✅ (own class) | ❌   | ❌            |
| Upload payment doc       | ✅    | ❌      | ❌          | ✅            |
| Edit payment doc         | ✅    | ❌      | ❌          | ✅            |
| View payment doc         | ✅    | ❌      | ✅ (view)   | ✅            |
| Delete payment doc       | ✅    | ❌      | ❌          | ❌            |
| Record homework KPI      | ✅    | ✅      | ❌          | ❌            |
| View sales report        | ✅    | ❌      | ✅ (own)    | ❌            |
| Manage users/staff       | ✅    | ❌      | ❌          | ❌            |

---

## Database Rules

- Always use Prisma migrations — never edit the DB directly
- Add `createdAt` and `updatedAt` to every model
- Use **UUIDs** for all primary keys
- Soft delete (`deletedAt DateTime?`) for Students and Payment Documents
- Attendance records are **never edited** — corrections create a new record with `isOverride: true`
- Never store file blobs in SQLite — store file paths only
- The SQLite `.db` file lives in the Tauri **app data directory** (not the install directory)

---

## Security Rules

- Local authentication: single bcrypt-hashed password per user account (12+ salt rounds)
- Network access is used **only** for Google Calendar API — all other features are fully offline
- Google OAuth token stored in Tauri secure storage — never in `.env`, SQLite, or logs
- Token refresh handled silently in background; user is notified if re-auth is needed
- Role is stored in the local DB and verified server-side in Tauri commands on every invoke
- Never trust role/userId passed from the frontend — always re-read from DB session
- Payment documents stored in a restricted local folder managed by Tauri fs API; paths are not user-editable
- Audit log: record every login, student status change, payment doc upload/edit/delete with `userId` + timestamp
- Payment document deletion requires admin re-authentication (password prompt)

---

## Environment Variables

```
GOOGLE_CLIENT_ID=           # OAuth 2.0 client ID from Google Cloud Console
GOOGLE_CLIENT_SECRET=       # OAuth 2.0 client secret
GOOGLE_REDIRECT_URI=        # Must match registered URI in Google Cloud Console
GOOGLE_CALENDAR_ID=         # The calendar ID to sync sessions from/to
```

- Never commit these to git
- In production, stored via Tauri's secure OS keychain (`tauri-plugin-store` or OS credential store)

---

## Development Commands

```bash
# Install dependencies
npm install

# Start dev mode (Tauri + React hot reload)
npm run tauri dev

# Run database migrations
npx prisma migrate dev

# Seed the database with test data
npx prisma db seed

# Build desktop app for production
npm run tauri build

# Run unit tests
npm run test

# Lint & format
npm run lint
npm run format
```

---

## Coding Standards

### General
- TypeScript everywhere — no `.js` files in `src/`
- All Tauri backend commands in `src-tauri/src/commands/` — one file per feature domain
- Frontend never accesses SQLite directly — always via `invoke()` to Tauri commands
- Validate all inputs with Zod on the **frontend** before invoking Tauri, and re-validate in the **Rust command** before DB write

### Naming Conventions
| Type              | Convention     | Example                      |
|-------------------|----------------|------------------------------|
| Files             | kebab-case     | `student-service.ts`         |
| React components  | PascalCase     | `AttendanceCalendar.tsx`     |
| Functions/vars    | camelCase      | `markAttendance`             |
| Constants         | UPPER_SNAKE_CASE | `MAX_FILE_SIZE_MB`         |
| DB tables/columns | snake_case     | `payment_docs`, `created_at` |
| Tauri commands    | snake_case     | `get_student_by_id`          |
| Prisma models     | PascalCase     | `model Student`              |

---

## What Claude Should Always Do

- Enforce the role permission matrix before any DB read or write in Tauri commands
- Prompt for CCCD when student status changes to `confirmed`
- Create override records for attendance corrections — never edit existing records
- Store file paths in DB and files on disk via Tauri `fs` — never blobs in SQLite
- Use UUIDs for all new models
- Add audit log entries for: login, student status change, payment doc changes
- Keep Tauri commands thin — push logic to service functions in `src-tauri/src/`
- Always store `google_event_id` on Session records and use it (not title) for sync deduplication
- Fall back to local cached sessions gracefully when Google Calendar is unreachable

## What Claude Should Never Do

- Let the frontend pass `role` or `userId` as a trusted parameter to Tauri commands
- Hard-delete students or payment documents (use soft delete)
- Store CCCD or payment file content in the database
- Allow salesperson to access attendance or homework KPI data
- Edit an existing attendance record — always create an override
- Store Google OAuth tokens in plaintext in SQLite or `.env` files
- Block the UI while waiting for Google Calendar sync — always sync in the background

---

## Known Decisions & Why

- **Tauri over Electron**: Smaller binary, better performance, native OS integration — important for a desktop CRM that may run on low-spec office machines
- **SQLite over PostgreSQL**: No server process needed; the whole database is one portable file the business can back up with a USB drive
- **File paths over blobs**: Keeps the DB small and fast; files are managed by the OS
- **Append-only attendance**: Attendance is legal proof of participation — audit trail must be immutable
- **Offline-first**: The training center may not have reliable internet; all features except schedule work fully offline
- **Google Calendar for scheduling**: Avoids building a full calendar UI from scratch; staff already familiar with Google Calendar for editing events; the app only needs to read and sync, not replace Google Calendar

---

*Last updated: May 2026 — Google Calendar integration added*
