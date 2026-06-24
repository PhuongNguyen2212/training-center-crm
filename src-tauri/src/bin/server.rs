// Standalone HTTP API server entry point (web/mobile backend).
// Run locally:  cargo run --bin server
fn main() {
    // libSQL is stack-heavy; give worker threads a large stack (matches lib.rs).
    let rt = tokio::runtime::Builder::new_multi_thread()
        .thread_stack_size(32 * 1024 * 1024)
        .enable_all()
        .build()
        .expect("không khởi tạo được tokio runtime");
    rt.block_on(app_lib::serve());
}
