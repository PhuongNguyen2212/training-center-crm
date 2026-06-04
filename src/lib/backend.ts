// Typed client for the Rust/Tauri backend (production data layer).
//
// Every call passes the session `token` returned by `login`; the backend
// re-checks the role server-side. In the browser (no Tauri), `isTauri()` is
// false and the app uses the localStorage prototype store instead — see
// docs/production-backend.md for the migration plan.

import { invoke } from "@tauri-apps/api/core";
import type {
  Attendance,
  AttendanceStatus,
  AuditLog,
  Class,
  ClassStatus,
  EnrollmentStatus,
  Homework,
  HomeworkStatus,
  PaymentDoc,
  Role,
  Session,
  User,
} from "@/types";

export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface LoginResponse {
  token: string;
  user: User;
}

// Matches the Rust StudentInput (serde camelCase).
export interface StudentInput {
  name: string;
  age: number | null;
  phone: string | null;
  jobTitle: string | null;
  goal: string | null;
  enrollmentStatus: EnrollmentStatus;
  cccdNumber: string | null;
}

// Backend Student/User rows omit credentials and use camelCase.
export interface BackendStudent {
  id: string;
  name: string;
  age: number | null;
  phone: string | null;
  jobTitle: string | null;
  goal: string | null;
  enrollmentStatus: EnrollmentStatus;
  cccdNumber: string | null;
  salespersonId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export const backend = {
  appVersion: () => invoke<string>("app_version"),

  // Auth
  login: (email: string, password: string) =>
    invoke<LoginResponse>("login", { email, password }),
  logout: (token: string) => invoke<void>("logout", { token }),
  me: (token: string) => invoke<User>("me", { token }),
  changeOwnPassword: (
    token: string,
    currentPassword: string,
    newPassword: string,
  ) =>
    invoke<void>("change_own_password", {
      token,
      currentPassword,
      newPassword,
    }),

  // Students
  listStudents: (token: string) =>
    invoke<BackendStudent[]>("list_students", { token }),
  createStudent: (token: string, input: StudentInput) =>
    invoke<BackendStudent>("create_student", { token, input }),
  updateStudent: (token: string, id: string, input: StudentInput) =>
    invoke<BackendStudent>("update_student", { token, id, input }),
  softDeleteStudent: (token: string, id: string) =>
    invoke<void>("soft_delete_student", { token, id }),

  // Staff / users (admin only, enforced server-side)
  listUsers: (token: string) => invoke<User[]>("list_users", { token }),
  createStaff: (
    token: string,
    name: string,
    email: string,
    role: Role,
    password: string,
  ) => invoke<User>("create_staff", { token, name, email, role, password }),
  setUserStatus: (token: string, id: string, status: "active" | "suspended") =>
    invoke<void>("set_user_status", { token, id, status }),
  updateUserRole: (token: string, id: string, role: Role) =>
    invoke<void>("update_user_role", { token, id, role }),
  resetUserPassword: (token: string, id: string, password: string) =>
    invoke<void>("reset_user_password", { token, id, password }),

  // Audit
  listAudit: (token: string) => invoke<AuditLog[]>("list_audit", { token }),

  // Classes
  listClasses: (token: string) => invoke<Class[]>("list_classes", { token }),
  createClass: (token: string, input: ClassInput) =>
    invoke<Class>("create_class", { token, input }),
  updateClass: (token: string, id: string, input: ClassInput) =>
    invoke<Class>("update_class", { token, id, input }),
  setClassStatus: (token: string, id: string, status: ClassStatus) =>
    invoke<void>("set_class_status", { token, id, status }),
  enrollStudent: (token: string, classId: string, studentId: string) =>
    invoke<void>("enroll_student", { token, classId, studentId }),
  unenrollStudent: (token: string, classId: string, studentId: string) =>
    invoke<void>("unenroll_student", { token, classId, studentId }),

  // Sessions
  listSessions: (token: string) => invoke<Session[]>("list_sessions", { token }),
  createSession: (token: string, input: SessionInput) =>
    invoke<Session>("create_session", { token, input }),
  updateSession: (token: string, id: string, input: SessionInput) =>
    invoke<Session>("update_session", { token, id, input }),
  deleteSession: (token: string, id: string) =>
    invoke<void>("delete_session", { token, id }),
  upsertSessionsFromGoogle: (token: string, incoming: SessionInput[]) =>
    invoke<Session[]>("upsert_sessions_from_google", { token, incoming }),

  // Attendance & homework
  listAttendance: (token: string) =>
    invoke<Attendance[]>("list_attendance", { token }),
  markAttendance: (
    token: string,
    studentId: string,
    sessionId: string,
    status: AttendanceStatus,
  ) => invoke<Attendance>("mark_attendance", { token, studentId, sessionId, status }),
  listHomework: (token: string) => invoke<Homework[]>("list_homework", { token }),
  setHomework: (
    token: string,
    studentId: string,
    sessionId: string,
    status: HomeworkStatus,
  ) => invoke<Homework>("set_homework", { token, studentId, sessionId, status }),

  // Payment documents
  listPaymentDocs: (token: string) =>
    invoke<PaymentDoc[]>("list_payment_docs", { token }),
  createPaymentDoc: (token: string, input: PaymentDocInput) =>
    invoke<PaymentDoc>("create_payment_doc", { token, input }),
  softDeletePaymentDoc: (token: string, id: string) =>
    invoke<void>("soft_delete_payment_doc", { token, id }),
};

export interface ClassInput {
  name: string;
  courseName: string;
  teacherId: string | null;
}

export interface SessionInput {
  googleEventId: string | null;
  title: string;
  startTime: string;
  endTime: string;
  teacherId: string | null;
  classId: string | null;
}

export interface PaymentDocInput {
  studentId: string;
  amount: number;
  paymentDate: string;
  fileName: string;
  fileType: PaymentDoc["fileType"];
  note: string | null;
}
