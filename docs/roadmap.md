# Project Status, Security Posture & Roadmap

_Last updated: 2026-06-25_

A single reference for **what's built**, **how secure it is today**, and **what's
planned next**. See also [README.md](../README.md), [CHANGELOG.md](../CHANGELOG.md),
and [docs/security.md](./security.md).

---

## 1. Accomplishments (shipped)

### Product
- Role-based CRM for a training center with four roles (admin, teacher,
  salesperson, finance) and a permission matrix enforced server-side.
- Feature areas: **students** (CCCD rule, soft delete), **classes**
  (enroll/unenroll, per-class sessions), **attendance** (append-only + override),
  **finance** (payment-proof upload to R2, 5 MB/type validation),
  **KPI/homework**, **schedule** (Google Calendar), **staff/HR**, and a
  **dashboard** with audit log + notifications.
- Vietnamese-first UI, responsive for desktop / web / mobile browsers.

### Architecture & engineering
- **One codebase → three shapes**: Tauri desktop app, headless Axum HTTP API,
  and a React web/mobile UI — all sharing a single transport-agnostic command
  layer (`*_impl` functions), so business rules live in one place.
- **Cloud data layer**: Turso Cloud (libSQL) over HTTP, Cloudflare R2 for files,
  Google Calendar (service account) for scheduling.
- **Feature-gated build**: the server compiles without Tauri
  (`--no-default-features`) → small Docker image.

### Quality & delivery
- **CI/CD**: 3-job GitHub Actions pipeline (frontend, backend, integration) —
  green. Concurrency-cancelled per ref; Dependabot for npm + cargo + actions.
- **Tests**: 59 frontend (Vitest) + Rust unit tests + DB-backed `*_impl` tests +
  an end-to-end test that boots the Axum server and drives real HTTP auth paths.
- **Deployed to production**: backend on Render (Docker), web on Vercel, wired
  via `VITE_API_URL` ↔ `ALLOWED_ORIGINS`, verified end-to-end (200 + CORS OK).
- **Docs/process**: README (dual-audience), CHANGELOG (Keep a Changelog),
  CONTRIBUTING, deploy + security guides.

---

## 2. Current security level

**Overall: solid MVP baseline — strong fundamentals, a few known gaps before
"enterprise-ready".** Roughly **7/10** for a small-business MVP.

### ✅ In place
| Control | Status |
|---|---|
| Password hashing (bcrypt, cost 12) | ✅ |
| Brute-force login lockout | ✅ |
| Server-side role re-validation (deny-by-default matrix) | ✅ |
| Parameterized SQL (no injection) | ✅ |
| Audit logging (login, status changes, payment docs) | ✅ |
| Soft delete (students, payment docs) | ✅ |
| File upload validation (type + magic bytes + ≤5 MB) | ✅ |
| Secrets kept out of git; injected at runtime | ✅ |
| HTTPS in production (Render + Vercel) | ✅ |
| Env-driven CORS allow-list (`ALLOWED_ORIGINS`) | ✅ |

### ⚠️ Known gaps (ranked)
| Gap | Risk | Notes |
|---|---|---|
| ~~Default admin password `admin123`~~ | ~~High~~ | **Addressed**: admin is now forced to set a new password at next login (`must_change_password`). |
| ~~Sessions never expire~~ | ~~Medium~~ | **Addressed**: 60-min idle + 12-h absolute expiry. Sessions still reset on restart (re-login) — persistence/JWT remains open. |
| ~~No general API rate limiting~~ | ~~Medium~~ | **Addressed**: per-IP 300 req/min on all `/api` routes (single-instance, in-memory). |
| Desktop `.exe` embeds secrets (extractable) | Medium | Architectural; mitigate by routing desktop through the API too. |
| No 2FA / MFA | Low–Med | Fine for MVP; add for admin later. |
| No self-serve password reset flow | Low | Admin-reset only today. |
| Dependency freshness | Low | Dependabot open PRs (axum 0.8, etc.) — review + merge. |

### Recommended immediate actions
1. **Change the admin password** on the live site.
2. Set **`ALLOWED_ORIGINS`** to the exact Vercel URL (confirmed done).
3. Rotate any secret that was ever shared in plaintext.

---

## 3. Roadmap (planned features & expansion)

Phased so each stage is shippable on its own.

### Phase 1 — Security & reliability hardening (in progress)
- [x] Session token **expiry**: 60-min idle + 12-h absolute lifetime
      (`Sessions::resolve`). _Persistence across restarts still open._
- [x] **API rate limiting**: per-IP fixed window (300 req/min) on all `/api`
      routes → HTTP 429.
- [x] **Force password change** for default/temporary passwords
      (`must_change_password` flag + non-dismissable UI gate; additive
      migration flags the seeded admin).
- [x] **Observability**: structured request logs (`tracing` + `TraceLayer`,
      `RUST_LOG`-tunable) surfaced in the Render/Fly dashboard.
- [x] Automated **database backups**: nightly Actions cron → Turso dump → R2
      `backups/`, manual trigger + restore drill in [docs/backup.md](./backup.md).

### Phase 2 — Product features
- [ ] **Reporting & analytics dashboard**: revenue, attendance trends, conversion
      funnels, teacher KPI (charts).
- [ ] **Notifications**: class reminders, payment-due, homework — via
      email / **Zalo** / SMS (Vietnam-friendly).
- [ ] **Invoices / receipts** (PDF generation) from payment records.
- [ ] **Payment gateway** integration (VNPay / MoMo) for online tuition.
- [ ] **Bulk import/export** (CSV) for students and attendance (partial today).
- [ ] **Student/parent self-service portal** (view schedule, attendance, dues).

### Phase 3 — Scale & platform
- [ ] **Multi-branch / multi-center** support (tenant per center).
- [ ] **Permissions admin UI** (edit the role matrix without code).
- [ ] **Internationalization (i18n)** beyond Vietnamese.
- [ ] **Native mobile app** (Tauri mobile or a dedicated build).
- [ ] Move the desktop app onto the same HTTP API so no secrets ship in the
      binary.

---

## How to use this file
Check items off as they ship, move completed features into
[CHANGELOG.md](../CHANGELOG.md), and keep the security table honest — it's the
first thing a reviewer (or auditor) will read.
