# Training Center CRM

[![CI](https://github.com/PhuongNguyen2212/training-center-crm/actions/workflows/ci.yml/badge.svg)](https://github.com/PhuongNguyen2212/training-center-crm/actions/workflows/ci.yml)

> A production-minded desktop + web CRM for a Vietnamese training center. **One
> codebase** ships a Tauri **desktop app**, a headless **HTTP API**, and a React
> **web / mobile UI**, all sharing one cloud database.

**Status:** MVP, active development · **CI:** green (3 jobs) · **Tests:** 59
frontend + Rust unit & integration · **Live demo accounts** below.

## At a glance

| | |
|---|---|
| **What** | Role-based CRM: students, classes, attendance, finance, scheduling, KPI, staff |
| **Who** | Admin, teacher, salesperson, finance — each with scoped permissions |
| **Frontend** | React 18 · TypeScript · Tailwind · Zustand · React Hook Form + Zod |
| **Backend** | Rust · Axum (HTTP API) · Tauri (desktop) — one shared command layer |
| **Data** | Turso Cloud (libSQL/SQLite) · Cloudflare R2 (files) · Google Calendar |
| **Quality** | GitHub Actions CI · ESLint + clippy · unit + integration tests · Dependabot |

## Highlights for reviewers

A compact tour of the engineering, mapped across the software lifecycle:

- **Backend services & cohesive integration** — a single transport-agnostic
  command layer (`*_impl` functions) serves *both* the desktop app and the web
  API, so business rules, permissions, and audit logging live in exactly one
  place. [→ Architecture](#architecture)
- **QA & test automation** — frontend (Vitest) and backend (Rust) unit tests,
  plus an **end-to-end test that boots the Axum server** over an in-memory
  database and drives real HTTP auth paths. [→ Tests](#tests)
- **CI/CD & release management** — a 3-job GitHub Actions pipeline (lint, test,
  build, integration), a documented branch/PR flow, a CHANGELOG, and Dependabot.
  [→ Engineering practices](#engineering-practices)
- **Security by default** — bcrypt, brute-force lockout, server-side role
  re-validation, parameterized SQL, and secrets kept out of git.
  [→ Security](#security)

> New here? [docs/topology.md](./docs/topology.md) is the architecture overview;
> [CONTRIBUTING.md](./CONTRIBUTING.md) is the dev workflow;
> [docs/roadmap.md](./docs/roadmap.md) is the status, security posture & roadmap.

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

Frontend (Vitest) — type-check, lint, and unit tests:

```bash
npx tsc --noEmit
npm run lint
npm test
```

Backend (in `src-tauri/`) — formatting, lints, and the pure unit tests (no
extra toolchain needed):

```bash
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test
```

The DB-backed `*_impl` tests and the Axum server integration test run against an
in-memory libSQL database, which needs the local libSQL backend (clang/libclang)
and so runs in CI. To run them locally with clang installed:

```bash
cargo test --no-default-features --features db-tests
```

---

## Engineering practices

This project is built with full-SDLC hygiene in mind:

- **CI / DevOps** — every push and PR runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml):
  frontend (type-check, lint, test, build), backend (rustfmt, clippy `-D
  warnings`, test, release server build), and an integration job (DB + HTTP
  server tests). Runs are de-duplicated per ref; Dependabot keeps deps current.
- **Test automation** — Vitest on the frontend and Rust unit + integration tests
  on the backend, focused on business rules and security-critical paths (role
  matrix, login lockout, CCCD validation, soft-delete, append-only attendance)
  rather than vanity coverage. The server is integration-tested end-to-end over
  HTTP against an in-memory database.
- **Audit logging** — login, student status changes, and payment-document
  changes are recorded with user id + timestamp.
- **Security hardening** — bcrypt auth, brute-force lockout, server-side role
  re-validation, parameterized SQL, env-driven CORS, and secrets kept out of
  git (see [docs/security.md](docs/security.md)).
- **Release management** — [CHANGELOG.md](CHANGELOG.md) (Keep a Changelog) and a
  documented branch/PR/CI flow in [CONTRIBUTING.md](CONTRIBUTING.md).

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
| **Students** | CRUD with the **CCCD rule** (national ID required when status = *confirmed*; validated as 12 digits + a real province-code prefix), soft delete, search/filter; salespeople see only their own. |
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
