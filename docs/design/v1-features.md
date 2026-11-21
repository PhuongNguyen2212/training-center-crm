# System design — v1 handover features

_Status: **draft, decisions open** (see [§10](#10-open-decisions)) · Target: handover 2026-11-30_

Four features for the v1 handover, plus one optional alternative, designed to
fit the existing architecture without new infrastructure:

| # | Feature | For | Effort |
|---|---|---|---|
| A | Finance access lockdown | Center owner | ~0.5 d |
| B | Classes + class overview with at-risk students | Teachers | ~1.5 d |
| C | Lesson notes + homework details per session | Teachers, students | ~1 d |
| D | Student progress report (printable / shareable) | Students, parents | ~1.5 d |
| E | _(alternative)_ Tuition installment plans | Finance | ~1.5 d |

---

## 1. Architecture recap

The system is web-only for the handover:

```
 Browser (phone / laptop)                 Render (Docker)                 Cloud
┌────────────────────────┐  HTTPS+Bearer ┌──────────────────────────┐   ┌──────────────┐
│ React SPA (Vercel)     │──────────────▶│ Axum HTTP API            │──▶│ Turso libSQL │
│  features/* pages/*    │  JSON         │  server.rs  (routes)     │   │ (all tables) │
│  store/ (Zustand)      │◀──────────────│  commands/*_impl (logic) │   └──────────────┘
│  lib/permissions.ts    │               │  auth.rs (sessions,      │   ┌──────────────┐
│   (UI hiding only)     │               │   capabilities, audit)   │──▶│ Cloudflare R2│
└────────────────────────┘               └──────────────────────────┘   │ (receipts)   │
                                                                        └──────────────┘
```

Every new feature follows the same path: **SQL table/columns → `*_impl`
function → Axum route → `backend.ts` method → store → page**.

> `docs/topology.md` still describes the old desktop/SQLite setup. Update it as
> part of the handover docs.

## 2. Design rules (apply to every feature)

1. **The server decides access.** Every `*_impl` calls
   `current_user` + `require_capability`. `lib/permissions.ts` only hides UI.
2. **Scope data in SQL**, not in the browser. A teacher's query has
   `WHERE teacher_id = ?`. Never send all rows and filter on the client.
   Today finance violates this rule (see A).
3. **Check every single-record read** (`GET /x/:id`) for scope, not only the
   list endpoint. This prevents someone reading another person's record by
   guessing its ID.
4. **Migrations are additive only**: `CREATE TABLE IF NOT EXISTS` in
   `0001_init.sql`, and `ALTER TABLE ADD COLUMN` in `db::migrate()` (an "already
   exists" error is ignored). No destructive changes before handover.
5. **Audit sensitive actions** with `write_audit`, covering every finance read
   and write.
6. **Attendance is append-only.** The effective status for a student in a
   session is the latest row (`ORDER BY marked_at DESC LIMIT 1`). All stats
   below use that rule.
7. **Phone-first UI**: tables from `md` up, `MobileCard` below.

---

## A. Finance access lockdown

**Problem.** `list_payment_docs_impl` and `read_payment_doc_impl` require only
`PaymentView`, which salespeople hold. So any salesperson can list **all**
receipts, open any receipt file, and see total center revenue on the
dashboard. KPI revenue is also computed in the browser from that full list.

**Design.** Split the capability and move totals to the server.

| Capability | Roles | Grants |
|---|---|---|
| `PaymentViewAll` | admin, finance_staff | All receipts, files, center totals |
| `PaymentViewOwn` | salesperson _(only if decision A = option b)_ | Receipts of students where `salesperson_id = me` |
| `PaymentUpload` | admin, finance_staff | unchanged |
| `PaymentDelete` | admin | unchanged |

- **List:** `PaymentViewAll` → all rows. `PaymentViewOwn` → `JOIN students s ON
  s.id = p.student_id WHERE s.salesperson_id = ?me`. Otherwise → 403.
- **Read file** (`GET /api/payment-docs/:id/file`) uses the same scope check on
  that single row, then writes the audit entry `payment.view_file`.
- **KPI revenue** gets a new `GET /api/kpi/sales`. It returns **aggregates only**
  (count, confirmed, revenue per salesperson). Admin sees every salesperson; a
  salesperson sees only their own row. It is guarded by a new backend
  capability, `SalesReport` (admin, salesperson). Today `sales.view` exists only
  in the frontend matrix. The browser stops receiving raw payment rows just to
  compute KPIs.
- **Dashboard revenue tile** and the Finance nav entry are shown only with
  `PaymentViewAll`, plus `PaymentViewOwn` under option b.
- **Frontend:** in `data-store.ts`, fetch payment docs only for roles that may
  see them. Clear them on logout (already done).

**Tests** (`tests/backend_it.rs`): a salesperson gets 403 or only their own
rows; a salesperson can't read another student's file by ID; a teacher gets
403 on every finance endpoint; `kpi/sales` never leaks another salesperson's
numbers.

---

## B. Classes + class overview

**Problem.** Sessions are standalone ("Lớp IELTS B - Buổi 6" is only a title),
so nothing can show a class's progress over time. The `classes` table exists
but nothing uses it.

**Data model** (bring back the existing table, no new tables):

```
classes (id, name, course_name, teacher_id, status, …)   -- exists
sessions.class_id → classes.id                           -- column exists, now set by the UI
```

- The session form gets an optional **Class** picker, and new sessions default
  to the last class used.
- **Old sessions:** the admin uses a one-time screen, "Assign sessions to
  class", which multi-selects sessions and sets `class_id`. Sessions without a
  class keep working as they do today.

**Class overview** (`GET /api/classes/:id/overview`) is computed in SQL and
returns:

```json
{
  "class": { "id": "...", "name": "IELTS B", "teacherId": "...", "sessionCount": 12 },
  "students": [
    {
      "studentId": "s-1", "name": "Vũ Thị Ngọc Mai",
      "attendanceRate": 0.83,        // (present + late) / sessions held while on roster
      "homeworkRate": 0.70,          // completed / homework recorded
      "lastSessions": ["present","absent","absent","late"],
      "atRisk": true,
      "atRiskReasons": ["2 buổi vắng trong 4 buổi gần nhất"]
    }
  ]
}
```

**At-risk rule** (constants in Rust, easy to tune):

- **unexcused absences ≥ 2 in the student's last 4 sessions**, or
- **homework completion < 50 % over the last 4 sessions**, where at least 2
  were recorded.

`excused` counts as neither present nor absent. Rates use only sessions that
have already ended.

**Access**

| Capability | Roles | Scope |
|---|---|---|
| `ClassView` | admin, teacher | teacher: `classes.teacher_id = me` (also checked on `/:id/overview`) |
| `ClassManage` | admin | create / edit / archive classes, bulk-assign sessions |

**API:** `GET/POST /api/classes`, `PUT /api/classes/:id`,
`GET /api/classes/:id/overview`, `POST /api/classes/:id/sessions` (bulk assign).

**UI:** a new nav item, **"Lớp học"** (Classes). It shows a list of class cards
(name, teacher, sessions held, number of at-risk students). The detail page has
a per-student table, or cards on phones, with at-risk students highlighted and
sorted first.

---

## C. Lesson notes + homework details

**Problem.** Homework is only `completed / not_completed`. Nothing records
*what* was taught or *what* the homework is, which is the information students
need to study.

**Data model** (additive columns, plus one new table):

```sql
-- db::migrate()
ALTER TABLE sessions ADD COLUMN lesson_notes  TEXT;   -- what was covered
ALTER TABLE sessions ADD COLUMN homework_task TEXT;   -- what to do
ALTER TABLE sessions ADD COLUMN homework_due  TEXT;   -- ISO date, optional

-- 0001_init.sql
CREATE TABLE IF NOT EXISTS student_comments (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(id),
  session_id  TEXT REFERENCES sessions(id),       -- optional: tie to a lesson
  author_id   TEXT NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,                       -- ≤ 1000 chars, validated in Rust
  created_at  TEXT NOT NULL,
  deleted_at  TEXT                                 -- soft delete
);
CREATE INDEX IF NOT EXISTS idx_comments_student ON student_comments(student_id);
```

**Access:** a new `LessonEdit` capability for admin and teacher, where teachers
are limited to sessions with `sessions.teacher_id = me`. Teachers today can't
edit sessions at all (`ScheduleEdit` is admin-only). This grants notes only:
the time and roster stay locked.

**API:** `PUT /api/sessions/:id/lesson` with
`{ lessonNotes, homeworkTask, homeworkDue }`, plus
`GET/POST /api/students/:id/comments` and `DELETE /api/comments/:id`
(author or admin only).

**UI:** a "Nội dung buổi học" (lesson content) panel on the session detail in
Buổi học & Điểm danh. The Homework page shows the task text above the roster.
Each student row on the class overview gets a "Nhận xét" (comment) button.

---

## D. Student progress report

**Goal.** Teachers give students and parents a clear progress summary without
creating student accounts.

**API:** `GET /api/students/:id/progress?from=YYYY-MM-DD&to=YYYY-MM-DD` returns
one aggregate:

```json
{
  "student": { "id": "s-1", "name": "Vũ Thị Ngọc Mai", "goal": "IELTS 6.5" },
  "period": { "from": "2026-10-01", "to": "2026-11-30" },
  "attendance": { "held": 12, "present": 9, "late": 1, "excused": 1, "absent": 1 },
  "homework":   { "recorded": 10, "completed": 8 },
  "sessions": [
    { "date": "...", "title": "...", "lessonNotes": "...", "homeworkTask": "...",
      "attendance": "present", "homework": "completed" }
  ],
  "comments": [ { "date": "...", "author": "Lê Thu Hà", "body": "..." } ]
}
```

**Privacy by design:** the report contains **no** phone number, CCCD, payment
or salesperson data. It is safe to forward.

**Access** (`ProgressView`):

| Role | Scope |
|---|---|
| admin | any student |
| teacher | students on a roster of one of their sessions |
| salesperson | their own students (useful for renewals) |
| finance_staff | none |

**UI:** a `/students/:id/report` route with a period picker and a print
stylesheet (`@media print`), so phones and laptops can **Print / Save as PDF**
without a server-side PDF engine. A **"Sao chép tóm tắt"** (copy summary) button
copies a short Vietnamese text summary for Zalo.

---

## E. _(Alternative)_ Tuition installment plans

Build this only if "financial plan" means payment schedules. It is restricted
to admin and finance; salespeople and teachers get no access.

```sql
CREATE TABLE IF NOT EXISTS tuition_plans (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id),
  course_name TEXT NOT NULL, total_amount INTEGER NOT NULL,      -- VND
  created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS plan_installments (
  id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES tuition_plans(id),
  seq INTEGER NOT NULL, due_date TEXT NOT NULL, amount INTEGER NOT NULL,
  UNIQUE (plan_id, seq)
);
-- db::migrate(): link a receipt to the installment it pays
ALTER TABLE payment_docs ADD COLUMN installment_id TEXT REFERENCES plan_installments(id);
```

- Paid / overdue status is **derived**, not stored: an installment is paid when
  its linked receipts add up to at least its amount, and overdue when it's
  unpaid and `due_date < today`. This avoids status columns drifting out of sync.
- Validation: installments must sum to `total_amount`, and due dates must
  increase.
- API: `GET/POST /api/tuition-plans`, `GET /api/tuition-plans/overdue`.
  Everything requires `PaymentViewAll`, and every write is audited.
- UI: a "Kế hoạch học phí" (tuition plan) tab in Finance, with an overdue list
  sorted by days late.

---

## 6. API summary (new or changed)

| Method & path | Capability | Feature |
|---|---|---|
| `GET /api/payment-docs` _(changed: scoped)_ | PaymentViewAll / Own | A |
| `GET /api/payment-docs/:id/file` _(changed: scoped + audit)_ | PaymentViewAll / Own | A |
| `GET /api/kpi/sales` | SalesReport _(new; admin, salesperson)_ | A |
| `GET/POST /api/classes`, `PUT /api/classes/:id` | ClassView / ClassManage | B |
| `GET /api/classes/:id/overview` | ClassView | B |
| `POST /api/classes/:id/sessions` | ClassManage | B |
| `PUT /api/sessions/:id/lesson` | LessonEdit | C |
| `GET/POST /api/students/:id/comments`, `DELETE /api/comments/:id` | LessonEdit (+ author check) | C |
| `GET /api/students/:id/progress` | ProgressView | D |
| `/api/tuition-plans…` | PaymentViewAll | E |

## 7. Permission matrix after the change

| Capability | admin | teacher | salesperson | finance |
|---|:-:|:-:|:-:|:-:|
| PaymentViewAll | ✅ | — | — | ✅ |
| PaymentViewOwn | — | — | option b | — |
| SalesReport | ✅ | — | own row | — |
| ClassView | ✅ | own | — | — |
| ClassManage | ✅ | — | — | — |
| LessonEdit | ✅ | own sessions | — | — |
| ProgressView | ✅ | own rosters | own students | — |

Mirror this in `auth.rs` (`Capability::allowed_roles`), which is the source of
truth, and in `src/lib/permissions.ts`. Extend the existing matrix unit tests.

## 8. Testing plan

- **Rust integration tests** (`--features db-tests`, in-memory DB) for each
  feature's scope rules, especially the negative cases: wrong role → 403, and
  someone else's record by ID → 403.
- **Unit tests** for the at-risk rule and rate maths: excused handling,
  override rows, sessions in the future, and the "fewer than 2 recorded" rule.
- **Frontend Vitest** for permission gating, plus a phone and laptop screenshot
  pass over every new page.
- **Manual check on production** before handover, logging in once with each role.

## 9. Delivery plan

| Date | Work |
|---|---|
| Nov 22 | **A** finance lockdown (+ tests) |
| Nov 23–24 | **B** classes, bulk-assign, overview |
| Nov 25 | **C** lesson notes, homework task, comments |
| Nov 26–27 | **D** progress report (or **E** installments) |
| Nov 28 | Feature freeze: bug fixes, check on production with each role |
| Nov 29–30 | Handover docs (user guide, admin runbook, account transfer), tag `v1.0.0` |

## 10. Open decisions

1. **Finance visibility for salespeople:** (a) none, or (b) own students only.
   This changes one row of the matrix and one SQL branch.
2. **"Financial plan" meaning:** existing payment records, or new
   installment plans (E)? If E, it replaces D in the plan.
3. **At-risk thresholds:** the defaults are 2 absences in 4 sessions and
   homework < 50 %. Confirm them with the center.

## 11. After handover: student portal (sketch)

- New role `student`, plus `users.student_id → students.id` (1:1).
- **Read-only** access to *own* schedule, lesson notes, homework tasks, and the
  progress report from D. Feature D's endpoint is reused with scope
  `student_id = me.student_id`.
- No finance data, other students, or staff data. Every query is scoped by the
  linked `student_id`.
- Accounts are created by admin or teacher with a forced password change, the
  same flow as staff today.
