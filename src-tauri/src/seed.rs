use crate::error::AppResult;
use crate::util::now_iso;
use libsql::Connection;

/// Populate demo data the first time the DB is created (when `users` is empty).
/// Runs once against the shared Turso DB. Passwords are bcrypt-hashed (cost 12).
pub async fn seed_if_empty(conn: &Connection) -> AppResult<()> {
    let count = crate::db::query_opt(conn, "SELECT COUNT(*) FROM users", (), |r| r.get::<i64>(0))
        .await?
        .unwrap_or(0);
    if count > 0 {
        return Ok(());
    }

    let now = now_iso();

    // (id, name, email, password, role)
    let users = [
        (
            "u-admin",
            "Nguyễn Thị Lan",
            "admin@trungtam.vn",
            "admin123",
            "admin",
        ),
        (
            "u-teacher-1",
            "Trần Văn Minh",
            "minh.gv@trungtam.vn",
            "teacher123",
            "teacher",
        ),
        (
            "u-teacher-2",
            "Lê Thu Hà",
            "ha.gv@trungtam.vn",
            "teacher123",
            "teacher",
        ),
        (
            "u-sales-1",
            "Phạm Quốc Bảo",
            "bao.tv@trungtam.vn",
            "sales123",
            "salesperson",
        ),
        (
            "u-finance",
            "Đỗ Mỹ Linh",
            "linh.tc@trungtam.vn",
            "finance123",
            "finance_staff",
        ),
    ];
    for (id, name, email, pw, role) in users {
        let hash = bcrypt::hash(pw, 12)?;
        conn.execute(
            "INSERT INTO users (id,name,email,password_hash,role,status,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,'active',?6,?6)",
            libsql::params![
                id.to_string(),
                name.to_string(),
                email.to_string(),
                hash,
                role.to_string(),
                now.clone()
            ],
        )
        .await?;
    }

    // (id, name, age, phone, job, goal, status, cccd)
    type SeedStudent = (
        &'static str,
        &'static str,
        i64,
        &'static str,
        &'static str,
        &'static str,
        &'static str,
        Option<&'static str>,
    );
    let students: [SeedStudent; 6] = [
        (
            "s-1",
            "Hoàng Anh Tuấn",
            24,
            "0901234567",
            "Nhân viên văn phòng",
            "Giao tiếp tiếng Anh công việc",
            "confirmed",
            Some("012345678901"),
        ),
        (
            "s-2",
            "Vũ Thị Ngọc Mai",
            19,
            "0912345678",
            "Sinh viên",
            "Luyện thi IELTS 6.5",
            "confirmed",
            Some("012345678902"),
        ),
        (
            "s-3",
            "Đặng Hữu Phước",
            31,
            "0923456789",
            "Kỹ sư phần mềm",
            "Tiếng Anh phỏng vấn",
            "prospect",
            None,
        ),
        (
            "s-4",
            "Bùi Khánh Vy",
            22,
            "0934567890",
            "Nhân viên bán hàng",
            "Giao tiếp cơ bản",
            "prospect",
            None,
        ),
        (
            "s-5",
            "Ngô Gia Hân",
            27,
            "0945678901",
            "Kế toán",
            "Luyện thi TOEIC 750",
            "confirmed",
            Some("012345678905"),
        ),
        (
            "s-6",
            "Trương Minh Khôi",
            20,
            "0956789012",
            "Sinh viên",
            "Tiếng Anh học thuật",
            "dropped",
            None,
        ),
    ];
    for (id, name, age, phone, job, goal, status, cccd) in students {
        conn.execute(
            "INSERT INTO students
             (id,name,age,phone,job_title,goal,enrollment_status,cccd_number,salesperson_id,created_at,updated_at,deleted_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'u-sales-1',?9,?9,NULL)",
            libsql::params![id.to_string(), name.to_string(), age, phone.to_string(), job.to_string(), goal.to_string(), status.to_string(), cccd.map(|s| s.to_string()), now.clone()],
        )
        .await?;
    }

    // (id, name, course, teacher)
    let classes = [
        (
            "lop-a",
            "Lớp Giao tiếp A",
            "Giao tiếp tiếng Anh",
            "u-teacher-1",
        ),
        (
            "lop-ielts-b",
            "Lớp IELTS B",
            "Luyện thi IELTS",
            "u-teacher-2",
        ),
        (
            "lop-toeic-c",
            "Lớp TOEIC C",
            "Luyện thi TOEIC",
            "u-teacher-2",
        ),
    ];
    for (id, name, course, teacher) in classes {
        conn.execute(
            "INSERT INTO classes (id,name,course_name,teacher_id,status,created_at,updated_at)
             VALUES (?1,?2,?3,?4,'active',?5,?5)",
            libsql::params![
                id.to_string(),
                name.to_string(),
                course.to_string(),
                teacher.to_string(),
                now.clone()
            ],
        )
        .await?;
    }

    let enrollments = [
        ("lop-a", "s-1"),
        ("lop-a", "s-2"),
        ("lop-a", "s-5"),
        ("lop-ielts-b", "s-2"),
        ("lop-toeic-c", "s-5"),
    ];
    for (class_id, student_id) in enrollments {
        conn.execute(
            "INSERT INTO class_students (class_id,student_id,enrolled_at) VALUES (?1,?2,?3)",
            libsql::params![class_id.to_string(), student_id.to_string(), now.clone()],
        )
        .await?;
    }

    Ok(())
}
