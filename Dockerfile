# CRM HTTP API server (headless — no Tauri/GUI). Build & run on Fly.io/Railway.
#
# Secrets (TURSO_*, R2_*, GOOGLE_*) are NOT baked in — provide them at runtime
# via the host's environment (e.g. `fly secrets set ...`).

# ---- Build stage ----
FROM rust:1-bookworm AS builder
WORKDIR /app
COPY src-tauri ./src-tauri
WORKDIR /app/src-tauri
# --no-default-features drops the `desktop` feature → no Tauri/webkit/frontend.
RUN cargo build --release --bin server --no-default-features

# ---- Runtime stage ----
FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/src-tauri/target/release/server /usr/local/bin/server
ENV PORT=8080
EXPOSE 8080
CMD ["server"]
