// Plain-SQL dump of every table, for off-site backups. The output is a series
// of INSERT statements that can be replayed into a fresh database created from
// migrations/0001_init.sql (see docs/backup.md for the restore drill).

use crate::error::{AppError, AppResult};
use libsql::{Connection, Value};

/// Tables in FK-safe insert order (parents before children).
pub const TABLES: [&str; 9] = [
    "users",
    "students",
    "classes",
    "class_students",
    "sessions",
    "attendance",
    "payment_docs",
    "homework",
    "audit_logs",
];

/// Render one libSQL value as a SQL literal, escaping quotes per the SQL
/// standard ('' inside a single-quoted string).
fn sql_literal(v: &Value) -> String {
    match v {
        Value::Null => "NULL".to_string(),
        Value::Integer(i) => i.to_string(),
        Value::Real(f) => f.to_string(),
        Value::Text(s) => format!("'{}'", s.replace('\'', "''")),
        Value::Blob(b) => {
            let hex: String = b.iter().map(|byte| format!("{byte:02x}")).collect();
            format!("X'{hex}'")
        }
    }
}

/// Dump every table as INSERT statements. Wrapped in a transaction with
/// foreign keys deferred so the file replays cleanly.
pub async fn dump_all(conn: &Connection) -> AppResult<String> {
    let mut out = String::from(
        "-- Training Center CRM backup\nPRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n",
    );
    for table in TABLES {
        out.push_str(&format!("-- {table}\n"));
        let mut rows = conn
            .query(&format!("SELECT * FROM {table}"), ())
            .await
            .map_err(|e| AppError::new(format!("dump {table} thất bại: {e}")))?;
        while let Some(row) = rows
            .next()
            .await
            .map_err(|e| AppError::new(format!("đọc {table} thất bại: {e}")))?
        {
            let mut vals = Vec::new();
            for i in 0..row.column_count() {
                vals.push(sql_literal(&row.get_value(i)?));
            }
            out.push_str(&format!(
                "INSERT INTO {table} VALUES ({});\n",
                vals.join(",")
            ));
        }
    }
    out.push_str("COMMIT;\nPRAGMA foreign_keys=ON;\n");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn literals_escape_quotes_and_render_types() {
        assert_eq!(sql_literal(&Value::Null), "NULL");
        assert_eq!(sql_literal(&Value::Integer(42)), "42");
        assert_eq!(
            sql_literal(&Value::Text("Nguyễn Văn A".into())),
            "'Nguyễn Văn A'"
        );
        // The classic injection/corruption case: embedded single quote.
        assert_eq!(sql_literal(&Value::Text("O'Brien".into())), "'O''Brien'");
        assert_eq!(sql_literal(&Value::Blob(vec![0xde, 0xad])), "X'dead'");
    }
}
