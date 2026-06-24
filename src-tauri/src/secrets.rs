//! Secret resolution for dev vs. distributed builds.
//!
//! `secret!("X")` returns the runtime env var (development, loaded from `.env`
//! via dotenvy) if present, otherwise the value baked into the binary at build
//! time — `build.rs` reads `.env` and emits `cargo:rustc-env` so `option_env!`
//! sees them. This lets the shipped `.exe` be self-contained (no `.env` needed
//! on user machines) while dev still uses the live `.env`.

#[macro_export]
macro_rules! secret {
    ($name:literal) => {
        ::std::env::var($name)
            .ok()
            .filter(|s| !s.is_empty())
            .or_else(|| {
                option_env!($name)
                    .filter(|s| !s.is_empty())
                    .map(::std::string::String::from)
            })
    };
}
