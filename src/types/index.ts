// Domain types — mirror prisma/schema.prisma. Vietnamese labels live in
// src/lib/labels.ts so the types stay clean.

export type Role = "admin" | "teacher" | "salesperson" | "finance_staff";

export type UserStatus = "active" | "suspended";

export type EnrollmentStatus = "prospect" | "confirmed" | "dropped";

export type ClassStatus = "active" | "completed" | "archived";

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export type HomeworkStatus = "completed" | "not_completed";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus; // suspended accounts cannot log in
  // Credentials. Seed demo accounts keep `password` (plaintext) for easy login;
  // any account created/changed in-app stores a PBKDF2 hash + salt and clears
  // the plaintext. Production hashes everything server-side (CLAUDE.md).
  password?: string;
  passwordHash?: string;
  salt?: string;
  // True when the account must set a new password before normal use
  // (default/temporary password). The UI forces the change-password modal.
  mustChangePassword?: boolean;
  createdAt: string;
}

export interface Student {
  id: string;
  name: string;
  age: number | null;
  phone: string | null;
  jobTitle: string | null; // Vị trí công việc
  goal: string | null; // Nguyện vọng
  enrollmentStatus: EnrollmentStatus;
  cccdNumber: string | null; // 12 digits, required when confirmed
  salespersonId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null; // soft delete
}

export interface Class {
  id: string;
  name: string; // Tên lớp, vd "Lớp Giao tiếp A"
  courseName: string; // Khóa học, vd "Giao tiếp tiếng Anh"
  teacherId: string | null; // Giáo viên phụ trách
  studentIds: string[]; // Học viên đã ghi danh vào lớp
  status: ClassStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  googleEventId: string | null;
  title: string;
  startTime: string; // ISO
  endTime: string; // ISO
  teacherId: string | null;
  classId: string | null;
}

export interface Attendance {
  id: string;
  studentId: string;
  sessionId: string;
  status: AttendanceStatus;
  markedBy: string;
  markedAt: string;
  isOverride: boolean; // corrections create a new override row
}

export interface PaymentDoc {
  id: string;
  studentId: string;
  amount: number; // VND
  paymentDate: string;
  fileName: string; // prototype: name only; production stores a file path
  fileType: "image/jpeg" | "image/png" | "application/pdf";
  note: string | null;
  uploadedBy: string;
  uploadedAt: string;
  deletedAt: string | null;
}

export interface Homework {
  id: string;
  studentId: string;
  sessionId: string;
  status: HomeworkStatus;
  recordedBy: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  detail: string | null;
  createdAt: string;
}
