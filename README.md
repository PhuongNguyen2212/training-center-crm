# Training Center CRM

[![CI](https://github.com/PhuongNguyen2212/training-center-crm/actions/workflows/ci.yml/badge.svg)](https://github.com/PhuongNguyen2212/training-center-crm/actions/workflows/ci.yml)

A desktop + web CRM for managing a training center / language school
(Vietnamese-first UI). One shared cloud database serves the desktop app, the web
app, and mobile browsers — built for many teacher/admin machines online.

Built per [CLAUDE.md](./CLAUDE.md): **Tauri 2 · Rust · React 18 · TypeScript ·
Tailwind · Zustand · React Hook Form + Zod**, backed by **Turso Cloud (libSQL)**
and **Cloudflare R2**.

---

## Architecture

The same Rust logic ships in two shapes from one codebase (Cargo feature flag):

```
Desktop app (Tauri) ─┐
                     ├─►  shared command logic  ─►  Turso Cloud (libSQL)  +  R2 (files)
Web / mobile browser ─┘            ▲                       (one shared database)
        │                          │
        └──►  HTTP API server (Axum, headless)
```

- **Desktop** (`npm run tauri:dev`) — Tauri window, calls the logic directly.
- **Server** (`cargo run --bin server`) — headless Axum HTTP API (no GUI), built
  with `--no-default-features` so Tauri/WebKit are dropped → small Docker image.
- **Web** (`npm run dev`) — React SPA; talks to the server via `VITE_API_URL`.

Both transports call the same `*_impl` functions, so business rules, permissions,
and audit logging live in exactly one place.

---

## Run it locally

```bash
npm install
```

### Web + backend (recommended for development)

```bash
# Terminal 1 — backend API (reads secrets from .env, serves on :8787)
cd src-tauri
cargo run --bin server --no-default-features

# Terminal 2 — web frontend
npm run dev          # http://localhost:5173
```

The web app talks to the backend because `.env` sets
`VITE_API_URL=http://localhost:8787`. Health check: `curl http://localhost:8787/api/health` → `ok`.

### Desktop app (Tauri)

Requires the Rust toolchain (https://rustup.rs):

```bash
npm run tauri:dev    # desktop window
npm run tauri:build  # installer in src-tauri/target/release
```

### Tests

```bash
npm test             # vitest run
```

---

## Configuration

Copy [.env.example](./.env.example) to `.env` and fill in your values. Secrets are
**backend-only** and are never committed (see [.gitignore](./.gitignore)).

| Variable | Purpose |
|---|---|
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Hosted libSQL database |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT` | Cloudflare R2 for payment-proof files |
| `GOOGLE_CALENDAR_ID`, `GOOGLE_SERVICE_ACCOUNT_FILE` | Shared Google Calendar (service account) |
| `VITE_API_URL` | Web → server URL (empty = standalone demo) |
| `ALLOWED_ORIGINS` | **Production** CORS allow-list (e.g. your Vercel URL) |

---

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin (Quản trị viên) | admin@trungtam.vn | `admin123` |
| Teacher (Giáo viên) | minh.gv@trungtam.vn | `teacher123` |
| Salesperson (Tư vấn) | bao.tv@trungtam.vn | `sales123` |
| Finance (Tài chính) | linh.tc@trungtam.vn | `finance123` |

> ⚠️ Change the default admin password immediately in any real deployment.

---

## Features

| Area | Description |
|---|---|
| **Dashboard** | Stats, upcoming sessions, new students, activity bell, audit log. |
| **Students** | CRUD with the **CCCD rule** (12-digit national ID required when status = *confirmed*), soft delete, search/filter; salespeople see only their own. |
| **Classes** | Class management, assigned teacher, **enroll/unenroll** students, status, per-class session list. Teachers see/edit only their own classes. |
| **Schedule** | Real **Google Calendar** integration via a shared service-account calendar so everyone can see sessions on their phones; create/edit/delete sessions. |
| **Attendance** | Phone-calendar style; **append-only** — corrections create override records, history preserved. |
| **Finance** | Upload payment proofs (type/≤5MB validation) to R2; salespeople view-only; deletion requires admin re-authentication. |
| **KPI** | Per-session homework tracking (teachers) + sales reports: conversion rate, referral revenue (sales/admin). |
| **Staff (HR)** | *(admin)* Create accounts, assign roles, suspend/activate, reset passwords. |

---

## Security

- bcrypt password hashing (cost 12); brute-force lockout after repeated failures.
- Role re-read from the DB on every request — the frontend's role/userId is never trusted.
- Parameterized SQL (no string interpolation of user input).
- Audit log for login, student status changes, and payment-doc changes.
- Soft delete for students and payment documents.
- Env-driven CORS allow-list (`ALLOWED_ORIGINS`) for production.
- Secrets stay out of git and are injected at runtime on the host.

Full checklist and key-rotation steps: **[docs/security.md](./docs/security.md)**.

---

## Deploy

Server → Fly.io / Railway / Render (Docker); web → Vercel. Step-by-step guide:
**[docs/deploy.md](./docs/deploy.md)**.

```bash
# Server image is built headless (no Tauri):
docker build -t crm-server .
# Provide TURSO_*, R2_*, GOOGLE_* as runtime env / host secrets — never baked in.
```

---

## Project layout

```
src/                 React frontend
  components/         shared UI (AppLayout, NotificationBell, modals)
  features/           students · schedule · attendance · finance · kpi · staff
  store/              Zustand stores (auth, data)
  lib/                backend dispatch (Tauri invoke | HTTP fetch), utils
src-tauri/            Rust backend
  src/commands/       feature domains — transport-agnostic *_impl + Tauri wrappers
  src/server.rs       Axum HTTP API
  src/bin/server.rs   headless server entrypoint
  src/db.rs           libSQL (Turso) connection + query helpers
  src/storage.rs      Cloudflare R2
  src/gcal.rs         Google Calendar (service account)
prisma/               reference data model
docs/                 deploy, security, setup guides
Dockerfile, fly.toml  server deployment
```
