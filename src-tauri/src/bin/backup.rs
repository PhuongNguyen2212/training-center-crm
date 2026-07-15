// Off-site database backup: dump every table from Turso and upload the SQL
// file to Cloudflare R2 under backups/. Run manually or from the scheduled
// GitHub Actions workflow (.github/workflows/backup.yml):
//
//   cargo run --bin backup --no-default-features
//
// Reads TURSO_* and R2_* from the environment / .env like the server does.

fn main() {
    // libSQL's call chain is stack-heavy; match the server's 32MB worker stacks.
    let rt = tokio::runtime::Builder::new_multi_thread()
        .thread_stack_size(32 * 1024 * 1024)
        .enable_all()
        .build()
        .expect("không khởi tạo được tokio runtime");
    rt.block_on(run());
}

async fn run() {
    dotenvy::dotenv().ok();
    let url = app_lib::secret!("TURSO_DATABASE_URL").expect("thiếu TURSO_DATABASE_URL");
    let token = app_lib::secret!("TURSO_AUTH_TOKEN").expect("thiếu TURSO_AUTH_TOKEN");

    let db = app_lib::backup_db_open(&url, &token)
        .await
        .expect("kết nối Turso thất bại");
    let sql = app_lib::backup_dump(&db)
        .await
        .expect("dump database thất bại");

    let stamp = chrono::Utc::now().format("%Y-%m-%d-%H%M");
    let key = format!("backups/crm-{stamp}.sql");
    app_lib::backup_upload(&key, sql.as_bytes())
        .await
        .expect("upload backup lên R2 thất bại");

    println!("OK: {key} ({} bytes)", sql.len());
}
