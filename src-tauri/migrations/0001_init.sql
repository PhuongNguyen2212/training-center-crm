-- Initial schema for the Training Center CRM (SQLite).
-- Mirrors prisma/schema.prisma. Timestamps are ISO-8601 TEXT; booleans are
-- INTEGER 0/1; enums are TEXT constrained by CHECK. snake_case per CLAUDE.md.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,                 -- bcrypt
  role          TEXT NOT NULL CHECK (role IN ('admin','teacher','salesperson','finance_staff')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  age               INTEGER,
  phone             TEXT,
  job_title         TEXT,
  goal              TEXT,
  enrollment_status TEXT NOT NULL DEFAULT 'prospect' CHECK (enrollment_status IN ('prospect','confirmed','dropped')),
  cccd_number       TEXT,
  salesperson_id    TEXT REFERENCES users(id),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT                         -- soft delete
);

CREATE TABLE IF NOT EXISTS classes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  course_name TEXT NOT NULL,
  teacher_id  TEXT REFERENCES users(id),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS class_students (
  class_id    TEXT NOT NULL REFERENCES classes(id),
  student_id  TEXT NOT NULL REFERENCES students(id),
  enrolled_at TEXT NOT NULL,
  PRIMARY KEY (class_id, student_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  google_event_id TEXT UNIQUE,                  -- sync dedup key
  title           TEXT NOT NULL,
  start_time      TEXT NOT NULL,
  end_time        TEXT NOT NULL,
  teacher_id      TEXT REFERENCES users(id),
  class_id        TEXT REFERENCES classes(id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- Append-only: corrections insert a new row with is_override = 1.
CREATE TABLE IF NOT EXISTS attendance (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(id),
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  status      TEXT NOT NULL CHECK (status IN ('present','absent','late','excused')),
  marked_by   TEXT NOT NULL REFERENCES users(id),
  marked_at   TEXT NOT NULL,
  is_override INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_docs (
  id           TEXT PRIMARY KEY,
  student_id   TEXT NOT NULL REFERENCES students(id),
  amount       INTEGER NOT NULL,               -- VND
  payment_date TEXT NOT NULL,
  file_path    TEXT NOT NULL,                  -- path only, never a blob
  file_type    TEXT NOT NULL,
  note         TEXT,
  uploaded_by  TEXT NOT NULL REFERENCES users(id),
  uploaded_at  TEXT NOT NULL,
  deleted_at   TEXT                            -- soft delete
);

CREATE TABLE IF NOT EXISTS homework (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(id),
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  status      TEXT NOT NULL CHECK (status IN ('completed','not_completed')),
  recorded_by TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (student_id, session_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  action     TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_students_salesperson ON students(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_sessions_class ON sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_homework_session ON homework(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
