// Typed client for the backend. ONE set of methods, TWO transports:
//   - Desktop (Tauri)  → invoke() into the embedded Rust backend.
//   - Web (browser)    → fetch() the HTTP API server (set VITE_API_URL).
// `useBackend()` is true when either transport is available; otherwise the app
// falls back to the localStorage prototype store (pure web demo).

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

// URL of the HTTP API server for the web build (e.g. http://localhost:8787 in
// dev, or the deployed server URL in prod). Empty → pure localStorage demo.
// Read dynamically so tests can stub it via vi.stubEnv.
const apiUrl = (): string => (import.meta.env.VITE_API_URL as string) || "";

/** True when a real backend is reachable (desktop Tauri, or web + API server). */
export const useBackend = (): boolean => isTauri() || Boolean(apiUrl());

interface HttpReq {
  method: string;
  path: string;
  token?: string;
  body?: unknown;
}

async function httpFetch<T>(req: HttpReq): Promise<T> {
  const headers: Record<string, string> = {};
  if (req.body !== undefined) headers["Content-Type"] = "application/json";
  if (req.token) headers["Authorization"] = `Bearer ${req.token}`;
  const res = await fetch(`${apiUrl()}${req.path}`, {
    method: req.method,
    headers,
    body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  // The server returns { message } on error — throw it so errorMessage() works.
  if (!res.ok) throw data ?? { message: `Lỗi máy chủ (${res.status})` };
  return data as T;
}

/** Dispatch: Tauri invoke on desktop, HTTP fetch on web. */
function call<T>(cmd: string, args: Record<string, unknown>, req: HttpReq): Promise<T> {
  return isTauri() ? invoke<T>(cmd, args) : httpFetch<T>(req);
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface StudentInput {
  name: string;
  age: number | null;
  phone: string | null;
  jobTitle: string | null;
  goal: string | null;
  enrollmentStatus: EnrollmentStatus;
  cccdNumber: string | null;
}

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
  appVersion: () =>
    isTauri() ? invoke<string>("app_version") : Promise.resolve("web"),

  // Auth
  login: (email: string, password: string) =>
    call<LoginResponse>("login", { email, password }, {
      method: "POST",
      path: "/api/login",
      body: { email, password },
    }),
  logout: (token: string) =>
    isTauri() ? invoke<void>("logout", { token }) : Promise.resolve(),
  me: (token: string) =>
    call<User>("me", { token }, { method: "GET", path: "/api/me", token }),
  changeOwnPassword: (token: string, currentPassword: string, newPassword: string) =>
    call<void>("change_own_password", { token, currentPassword, newPassword }, {
      method: "POST",
      path: "/api/account/password",
      token,
      body: { currentPassword, newPassword },
    }),

  // Students
  listStudents: (token: string) =>
    call<BackendStudent[]>("list_students", { token }, { method: "GET", path: "/api/students", token }),
  createStudent: (token: string, input: StudentInput) =>
    call<BackendStudent>("create_student", { token, input }, { method: "POST", path: "/api/students", token, body: input }),
  updateStudent: (token: string, id: string, input: StudentInput) =>
    call<BackendStudent>("update_student", { token, id, input }, { method: "PUT", path: `/api/students/${id}`, token, body: input }),
  softDeleteStudent: (token: string, id: string) =>
    call<void>("soft_delete_student", { token, id }, { method: "DELETE", path: `/api/students/${id}`, token }),

  // Staff / users
  listUsers: (token: string) =>
    call<User[]>("list_users", { token }, { method: "GET", path: "/api/users", token }),
  createStaff: (token: string, name: string, email: string, role: Role, password: string) =>
    call<User>("create_staff", { token, name, email, role, password }, {
      method: "POST",
      path: "/api/users",
      token,
      body: { name, email, role, password },
    }),
  setUserStatus: (token: string, id: string, status: "active" | "suspended") =>
    call<void>("set_user_status", { token, id, status }, { method: "POST", path: `/api/users/${id}/status`, token, body: { status } }),
  updateUserRole: (token: string, id: string, role: Role) =>
    call<void>("update_user_role", { token, id, role }, { method: "POST", path: `/api/users/${id}/role`, token, body: { role } }),
  resetUserPassword: (token: string, id: string, password: string) =>
    call<void>("reset_user_password", { token, id, password }, { method: "POST", path: `/api/users/${id}/password`, token, body: { password } }),

  // Audit + notifications
  listAudit: (token: string) =>
    call<AuditLog[]>("list_audit", { token }, { method: "GET", path: "/api/audit", token }),
  listClassNotifications: (token: string) =>
    call<AuditLog[]>("list_class_notifications", { token }, { method: "GET", path: "/api/notifications", token }),

  // Classes
  listClasses: (token: string) =>
    call<Class[]>("list_classes", { token }, { method: "GET", path: "/api/classes", token }),
  createClass: (token: string, input: ClassInput) =>
    call<Class>("create_class", { token, input }, { method: "POST", path: "/api/classes", token, body: input }),
  updateClass: (token: string, id: string, input: ClassInput) =>
    call<Class>("update_class", { token, id, input }, { method: "PUT", path: `/api/classes/${id}`, token, body: input }),
  setClassStatus: (token: string, id: string, status: ClassStatus) =>
    call<void>("set_class_status", { token, id, status }, { method: "POST", path: `/api/classes/${id}/status`, token, body: { status } }),
  enrollStudent: (token: string, classId: string, studentId: string) =>
    call<void>("enroll_student", { token, classId, studentId }, { method: "POST", path: `/api/classes/${classId}/enroll`, token, body: { studentId } }),
  unenrollStudent: (token: string, classId: string, studentId: string) =>
    call<void>("unenroll_student", { token, classId, studentId }, { method: "POST", path: `/api/classes/${classId}/unenroll`, token, body: { studentId } }),
  deleteClass: (token: string, id: string) =>
    call<void>("delete_class", { token, id }, { method: "DELETE", path: `/api/classes/${id}`, token }),

  // Sessions
  listSessions: (token: string) =>
    call<Session[]>("list_sessions", { token }, { method: "GET", path: "/api/sessions", token }),
  createSession: (token: string, input: SessionInput) =>
    call<Session>("create_session", { token, input }, { method: "POST", path: "/api/sessions", token, body: input }),
  updateSession: (token: string, id: string, input: SessionInput) =>
    call<Session>("update_session", { token, id, input }, { method: "PUT", path: `/api/sessions/${id}`, token, body: input }),
  deleteSession: (token: string, id: string) =>
    call<void>("delete_session", { token, id }, { method: "DELETE", path: `/api/sessions/${id}`, token }),
  upsertSessionsFromGoogle: (token: string, incoming: SessionInput[]) =>
    isTauri()
      ? invoke<Session[]>("upsert_sessions_from_google", { token, incoming })
      : Promise.resolve([] as Session[]),

  // Attendance & homework
  listAttendance: (token: string) =>
    call<Attendance[]>("list_attendance", { token }, { method: "GET", path: "/api/attendance", token }),
  markAttendance: (token: string, studentId: string, sessionId: string, status: AttendanceStatus) =>
    call<Attendance>("mark_attendance", { token, studentId, sessionId, status }, {
      method: "POST",
      path: "/api/attendance",
      token,
      body: { studentId, sessionId, status },
    }),
  listHomework: (token: string) =>
    call<Homework[]>("list_homework", { token }, { method: "GET", path: "/api/homework", token }),
  setHomework: (token: string, studentId: string, sessionId: string, status: HomeworkStatus) =>
    call<Homework>("set_homework", { token, studentId, sessionId, status }, {
      method: "POST",
      path: "/api/homework",
      token,
      body: { studentId, sessionId, status },
    }),

  // Payment documents
  listPaymentDocs: (token: string) =>
    call<PaymentDoc[]>("list_payment_docs", { token }, { method: "GET", path: "/api/payments", token }),
  createPaymentDoc: (token: string, input: PaymentDocInput) =>
    call<PaymentDoc>("create_payment_doc", { token, input }, { method: "POST", path: "/api/payments", token, body: input }),
  readPaymentDoc: (token: string, id: string) =>
    call<PaymentDocFile>("read_payment_doc", { token, id }, { method: "GET", path: `/api/payments/${id}/file`, token }),
  softDeletePaymentDoc: (token: string, id: string) =>
    call<void>("soft_delete_payment_doc", { token, id }, { method: "DELETE", path: `/api/payments/${id}`, token }),
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
  /** Base64-encoded file content; the backend decodes, validates and stores it. */
  fileBase64: string;
  note: string | null;
}

// Returned by readPaymentDoc — the decoded file for viewing/download.
export interface PaymentDocFile {
  fileName: string;
  fileType: PaymentDoc["fileType"];
  base64: string;
}
