# Contributing

Thanks for contributing to the Training Center CRM. This document describes the
branch / PR / CI workflow.

## Branching

- `main` is always green (CI passing) and deployable.
- Create a topic branch off `main`:
  - `feat/<short-name>` — new functionality
  - `fix/<short-name>` — bug fixes
  - `chore/`, `docs/`, `test/`, `ci/` — as appropriate

## Commits

- Keep commits small and focused; write imperative, descriptive messages.
- Follow [Conventional Commits](https://www.conventionalcommits.org/) where
  practical (`feat:`, `fix:`, `test:`, `ci:`, `docs:`, `chore:`).
- Do **not** commit secrets. `.env`, service-account keys, and signing keys are
  gitignored — keep it that way.

## Pull requests

1. Push your branch and open a PR against `main`.
2. Fill in what changed and why; link any issue.
3. CI must pass (see below). PRs that go red are not merged until fixed.
4. Squash or rebase to keep history readable.

## Running checks locally

These mirror what CI runs, so you can catch problems before pushing.

### Frontend

```bash
npm ci
npx tsc --noEmit     # type-check
npm run lint         # ESLint
npm test             # Vitest unit tests
npm run build        # production build
```

### Backend (in `src-tauri/`)

```bash
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test                                   # pure unit tests (no LLVM needed)
cargo build --bin server --no-default-features --release
```

The DB-backed integration tests need libSQL's local backend (clang/libclang),
so they run in the CI `integration` job. If you have clang installed locally:

```bash
cargo test --no-default-features --features db-tests
```

## CI

`.github/workflows/ci.yml` runs three jobs on every push and PR:

- **frontend** — type-check, lint, test, build (Node 20).
- **backend** — rustfmt, clippy (`-D warnings`), test, release server build.
- **integration** — DB-backed `*_impl` + Axum server tests on an in-memory DB.

Runs on the same ref are cancelled when superseded.

## Releases

Update [CHANGELOG.md](CHANGELOG.md) under `Unreleased` as you go. On release,
move those entries under a new version heading and tag the commit
(`vMAJOR.MINOR.PATCH`).
