# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- GitHub Actions CI pipeline: frontend job (type-check, lint, test, build) and
  backend job (rustfmt, clippy `-D warnings`, test, release server build), with
  concurrency cancellation and a status badge.
- Dedicated `integration` CI job running DB-backed `*_impl` and Axum server
  integration tests against an in-memory libSQL database (`db-tests` feature).
- ESLint flat config (TypeScript + React hooks) and `npm run lint` wiring.
- CCCD validation now also checks the province-code prefix (frontend + backend),
  rejecting structurally-impossible IDs while keeping the 12-digit base rule.
- Security-critical unit tests: capability/role matrix, login lockout, CCCD rule.
- `CHANGELOG.md`, `CONTRIBUTING.md`, and Dependabot config for npm + cargo.
- Env-driven CORS allow-list (`ALLOWED_ORIGINS`) for the HTTP API server.

### Changed
- Renamed the `useBackend()` helper to `hasRemoteBackend()` (it is a plain
  predicate, not a React hook).
- Extracted `build_router()` from `serve()` so the server is testable without a
  live Turso connection or a bound socket.

### Security
- Documented infrastructure hardening and key-rotation steps in
  [docs/security.md](docs/security.md).

## [0.1.0] - 2026-05

### Added
- Initial Training Center CRM: students, classes, attendance, finance/payment
  documents, KPI/homework, schedule (Google Calendar), and staff management.
- Tauri desktop app + headless HTTP API server sharing one command layer.
- Turso Cloud (libSQL) data layer and Cloudflare R2 file storage.
- Role-based permission matrix, bcrypt auth, brute-force lockout, audit logging.

[Unreleased]: https://github.com/PhuongNguyen2212/training-center-crm/compare/main...HEAD
