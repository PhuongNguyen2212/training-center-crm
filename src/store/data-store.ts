// Central data store for the prototype. Holds every entity and the mutating
// actions, persisted to localStorage so edits survive a refresh during a demo.
//
// This stands in for the production Tauri/SQLite layer. Each action mirrors what
// a Tauri command would do (incl. soft delete, append-only attendance, and
// audit logging) so the business rules are demonstrable.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Attendance,
  AttendanceStatus,
  AuditLog,
  Class,
  ClassStatus,
  Homework,
  HomeworkStatus,
  PaymentDoc,
  Role,
  Session,
  Student,
  User,
  UserStatus,
} from "@/types";
import {
  seedAttendance,
  seedAuditLogs,
  seedClasses,
  seedHomework,
  seedPaymentDocs,
  seedSessions,
  seedStudents,
  seedUsers,
} from "@/data/seed";
import { hashPassword, randomSalt } from "@/lib/crypto";
import { backend, useBackend, type StudentInput } from "@/lib/backend";
import { errorMessage } from "@/lib/error";
import { useAuthStore } from "./auth-store";

// Session token for backend calls (desktop only). Read lazily to avoid an
// import cycle at module-eval time.
const authToken = (): string | null => useAuthStore.getState().token;

const toStudentInput = (s: {
  name: string;
  age: number | null;
  phone: string | null;
  jobTitle: string | null;
  goal: string | null;
  enrollmentStatus: Student["enrollmentStatus"];
  cccdNumber: string | null;
}): StudentInput => ({
  name: s.name,
  age: s.age,
  phone: s.phone,
  jobTitle: s.jobTitle,
  goal: s.goal,
  enrollmentStatus: s.enrollmentStatus,
  cccdNumber: s.cccdNumber,
});

const uid = (prefix: string) =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const nowIso = () => new Date().toISOString();

export interface DataState {
  users: User[];
  students: Student[];
  classes: Class[];
  sessions: Session[];
  attendance: Attendance[];
  homework: Homework[];
  paymentDocs: PaymentDoc[];
  auditLogs: AuditLog[];
  /** Class-activity notifications, broadcast to everyone (powers the bell). */
  notifications: AuditLog[];

  // --- Audit ---
  addAudit: (userId: string, action: string, detail: string) => void;

  // Load students/users/audit from the backend (desktop only). No-op in browser.
  hydrateFromBackend: (token: string) => Promise<void>;

  // --- Staff / HR (admin only; re-checked server-side in the desktop build) ---
  addStaff: (
    data: { name: string; email: string; role: Role; password: string },
    actorId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  updateStaff: (
    id: string,
    data: { name?: string; role?: Role },
    actorId: string,
  ) => Promise<void>;
  setStaffStatus: (
    id: string,
    status: UserStatus,
    actorId: string,
  ) => Promise<void>;
  resetStaffPassword: (
    id: string,
    newPassword: string,
    actorId: string,
  ) => Promise<void>;
  changeOwnPassword: (
    id: string,
    newPassword: string,
    currentPassword?: string,
  ) => Promise<void>;

  // --- Students ---
  addStudent: (
    data: Omit<Student, "id" | "createdAt" | "updatedAt" | "deletedAt">,
    actorId: string,
  ) => Promise<void>;
  updateStudent: (
    id: string,
    data: Partial<Student>,
    actorId: string,
  ) => Promise<void>;
  softDeleteStudent: (id: string, actorId: string) => Promise<void>;

  // --- Attendance (append-only) ---
  markAttendance: (
    studentId: string,
    sessionId: string,
    status: AttendanceStatus,
    actorId: string,
  ) => void;

  // --- Homework ---
  setHomework: (
    studentId: string,
    sessionId: string,
    status: HomeworkStatus,
    actorId: string,
  ) => void;

  // --- Payment docs ---
  // `fileBase64` carries the file content to the backend; it is never stored on
  // the PaymentDoc row (paths/metadata only — content lives on disk).
  addPaymentDoc: (
    data: Omit<PaymentDoc, "id" | "uploadedAt" | "deletedAt"> & {
      fileBase64: string;
    },
    actorId: string,
  ) => void;
  updatePaymentDoc: (
    id: string,
    data: Partial<PaymentDoc>,
    actorId: string,
  ) => void;
  softDeletePaymentDoc: (id: string, actorId: string) => void;
  /** Open a stored payment document for viewing (desktop/Tauri only). */
  viewPaymentDoc: (id: string) => Promise<void>;

  // --- Classes (Lớp học) ---
  addClass: (
    data: {
      name: string;
      courseName: string;
      teacherId: string | null;
    },
    actorId: string,
  ) => void;
  updateClass: (
    id: string,
    data: Partial<Pick<Class, "name" | "courseName" | "teacherId" | "status">>,
    actorId: string,
  ) => void;
  enrollStudent: (classId: string, studentId: string, actorId: string) => void;
  unenrollStudent: (
    classId: string,
    studentId: string,
    actorId: string,
  ) => void;
  setClassStatus: (id: string, status: ClassStatus, actorId: string) => void;
  deleteClass: (id: string, actorId: string) => void;

  // --- Sessions (Google Calendar) ---
  addSession: (data: Omit<Session, "id">, actorId: string) => void;
  updateSession: (id: string, data: Partial<Session>, actorId: string) => void;
  deleteSession: (id: string, actorId: string) => void;
  // Merge events pulled from Google: upsert by google_event_id, keep local-only.
  upsertSessionsFromGoogle: (
    incoming: Omit<Session, "id">[],
    actorId: string,
  ) => void;

  resetData: () => void;
}

const initialData = () => ({
  users: seedUsers,
  students: seedStudents,
  classes: seedClasses,
  sessions: seedSessions,
  attendance: seedAttendance,
  homework: seedHomework,
  paymentDocs: seedPaymentDocs,
  auditLogs: seedAuditLogs,
  notifications: [],
});

export const useDataStore = create<DataState>()(
  persist(
    (set, get) => ({
      ...initialData(),

      addAudit: (userId, action, detail) =>
        set((s) => ({
          auditLogs: [
            { id: uid("log"), userId, action, detail, createdAt: nowIso() },
            ...s.auditLogs,
          ],
        })),

      hydrateFromBackend: async (token) => {
        if (!useBackend()) return;
        // Each list is role-gated server-side; swallow forbidden ones and keep
        // the seeded slice so name lookups still work for that role.
        const load = async <T>(fn: () => Promise<T>, apply: (v: T) => void) => {
          try {
            apply(await fn());
          } catch {
            /* forbidden for this role */
          }
        };
        await Promise.all([
          load(
            () => backend.listStudents(token),
            (v) => set({ students: v as Student[] }),
          ),
          load(
            () => backend.listUsers(token),
            (v) => v.length && set({ users: v as User[] }),
          ),
          load(
            () => backend.listAudit(token),
            (v) => set({ auditLogs: v }),
          ),
          load(
            () => backend.listClassNotifications(token),
            (v) => set({ notifications: v }),
          ),
          load(
            () => backend.listClasses(token),
            (v) => set({ classes: v as Class[] }),
          ),
          load(
            () => backend.listSessions(token),
            (v) => set({ sessions: v as Session[] }),
          ),
          load(
            () => backend.listAttendance(token),
            (v) => set({ attendance: v as Attendance[] }),
          ),
          load(
            () => backend.listHomework(token),
            (v) => set({ homework: v as Homework[] }),
          ),
          load(
            () => backend.listPaymentDocs(token),
            (v) => set({ paymentDocs: v as PaymentDoc[] }),
          ),
        ]);
      },

      addStaff: async (data, actorId) => {
        if (useBackend()) {
          const token = authToken();
          if (token) {
            try {
              const created = await backend.createStaff(
                token,
                data.name,
                data.email,
                data.role,
                data.password,
              );
              set((s) => ({ users: [...s.users, created as User] }));
              return { ok: true };
            } catch (e) {
              return {
                ok: false,
                error: errorMessage(e),
              };
            }
          }
        }
        const email = data.email.trim().toLowerCase();
        if (get().users.some((u) => u.email.toLowerCase() === email)) {
          return { ok: false, error: "Email đã tồn tại." };
        }
        const salt = randomSalt();
        const passwordHash = await hashPassword(data.password, salt);
        const staff: User = {
          id: uid("u"),
          name: data.name.trim(),
          email,
          role: data.role,
          status: "active",
          passwordHash,
          salt,
          createdAt: nowIso(),
        };
        set((s) => ({ users: [...s.users, staff] }));
        get().addAudit(
          actorId,
          "staff.create",
          `Tạo tài khoản ${staff.name} (${staff.role})`,
        );
        return { ok: true };
      },

      updateStaff: async (id, data, actorId) => {
        if (useBackend()) {
          const token = authToken();
          if (token && data.role) {
            await backend.updateUserRole(token, id, data.role);
          }
        }
        const prev = get().users.find((u) => u.id === id);
        set((s) => ({
          users: s.users.map((u) => (u.id === id ? { ...u, ...data } : u)),
        }));
        if (prev && data.role && data.role !== prev.role) {
          get().addAudit(
            actorId,
            "staff.role_change",
            `${prev.name}: ${prev.role} → ${data.role}`,
          );
        } else {
          get().addAudit(actorId, "staff.update", `Cập nhật ${prev?.name ?? id}`);
        }
      },

      setStaffStatus: async (id, status, actorId) => {
        if (useBackend()) {
          const token = authToken();
          if (token) await backend.setUserStatus(token, id, status);
        }
        const prev = get().users.find((u) => u.id === id);
        set((s) => ({
          users: s.users.map((u) => (u.id === id ? { ...u, status } : u)),
        }));
        get().addAudit(
          actorId,
          status === "suspended" ? "staff.suspend" : "staff.activate",
          `${status === "suspended" ? "Treo" : "Kích hoạt"} tài khoản ${prev?.name ?? id}`,
        );
      },

      resetStaffPassword: async (id, newPassword, actorId) => {
        if (useBackend()) {
          const token = authToken();
          if (token) {
            await backend.resetUserPassword(token, id, newPassword);
            return;
          }
        }
        const salt = randomSalt();
        const passwordHash = await hashPassword(newPassword, salt);
        set((s) => ({
          users: s.users.map((u) =>
            u.id === id
              ? { ...u, salt, passwordHash, password: undefined }
              : u,
          ),
        }));
        const prev = get().users.find((u) => u.id === id);
        get().addAudit(
          actorId,
          "staff.reset_password",
          `Đặt lại mật khẩu cho ${prev?.name ?? id}`,
        );
      },

      changeOwnPassword: async (id, newPassword, currentPassword) => {
        if (useBackend()) {
          const token = authToken();
          if (token) {
            // Backend verifies the current password server-side.
            await backend.changeOwnPassword(
              token,
              currentPassword ?? "",
              newPassword,
            );
            return;
          }
        }
        const salt = randomSalt();
        const passwordHash = await hashPassword(newPassword, salt);
        set((s) => ({
          users: s.users.map((u) =>
            u.id === id
              ? { ...u, salt, passwordHash, password: undefined }
              : u,
          ),
        }));
        get().addAudit(id, "account.change_password", "Tự đổi mật khẩu");
      },

      addStudent: async (data, actorId) => {
        if (useBackend()) {
          const token = authToken();
          if (token) {
            const created = (await backend.createStudent(
              token,
              toStudentInput(data),
            )) as Student;
            set((s) => ({ students: [created, ...s.students] }));
            return;
          }
        }
        const student: Student = {
          ...data,
          id: uid("s"),
          createdAt: nowIso(),
          updatedAt: nowIso(),
          deletedAt: null,
        };
        set((s) => ({ students: [student, ...s.students] }));
        get().addAudit(
          actorId,
          "student.create",
          `Thêm học viên ${student.name}`,
        );
      },

      updateStudent: async (id, data, actorId) => {
        if (useBackend()) {
          const token = authToken();
          const existing = get().students.find((s) => s.id === id);
          if (token && existing) {
            const updated = (await backend.updateStudent(
              token,
              id,
              toStudentInput({ ...existing, ...data }),
            )) as Student;
            set((s) => ({
              students: s.students.map((st) => (st.id === id ? updated : st)),
            }));
            return;
          }
        }
        const prev = get().students.find((s) => s.id === id);
        set((s) => ({
          students: s.students.map((st) =>
            st.id === id ? { ...st, ...data, updatedAt: nowIso() } : st,
          ),
        }));
        if (
          prev &&
          data.enrollmentStatus &&
          data.enrollmentStatus !== prev.enrollmentStatus
        ) {
          get().addAudit(
            actorId,
            "student.status_change",
            `Học viên ${prev.name}: ${prev.enrollmentStatus} → ${data.enrollmentStatus}`,
          );
        } else {
          get().addAudit(
            actorId,
            "student.update",
            `Cập nhật học viên ${prev?.name ?? id}`,
          );
        }
      },

      softDeleteStudent: async (id, actorId) => {
        if (useBackend()) {
          const token = authToken();
          if (token) {
            await backend.softDeleteStudent(token, id);
            set((s) => ({
              students: s.students.map((st) =>
                st.id === id ? { ...st, deletedAt: nowIso() } : st,
              ),
            }));
            return;
          }
        }
        const prev = get().students.find((s) => s.id === id);
        set((s) => ({
          students: s.students.map((st) =>
            st.id === id ? { ...st, deletedAt: nowIso() } : st,
          ),
        }));
        get().addAudit(
          actorId,
          "student.soft_delete",
          `Ẩn học viên ${prev?.name ?? id}`,
        );
      },

      markAttendance: async (studentId, sessionId, status, actorId) => {
        if (useBackend()) {
          const token = authToken();
          if (token) {
            const record = (await backend.markAttendance(
              token,
              studentId,
              sessionId,
              status,
            )) as Attendance;
            set((s) => ({ attendance: [...s.attendance, record] }));
            return;
          }
        }
        // Append-only: if a record already exists, add an override row instead
        // of editing the original (attendance = legal proof of participation).
        const existing = get().attendance.find(
          (a) => a.studentId === studentId && a.sessionId === sessionId,
        );
        const record: Attendance = {
          id: uid("att"),
          studentId,
          sessionId,
          status,
          markedBy: actorId,
          markedAt: nowIso(),
          isOverride: Boolean(existing),
        };
        set((s) => ({ attendance: [...s.attendance, record] }));
        get().addAudit(
          actorId,
          existing ? "attendance.override" : "attendance.mark",
          `Điểm danh ${status}${existing ? " (ghi đè)" : ""}`,
        );
      },

      setHomework: async (studentId, sessionId, status, actorId) => {
        if (useBackend()) {
          const token = authToken();
          if (token) {
            const hw = (await backend.setHomework(
              token,
              studentId,
              sessionId,
              status,
            )) as Homework;
            set((s) => ({
              homework: [
                ...s.homework.filter((h) => h.id !== hw.id),
                hw,
              ],
            }));
            return;
          }
        }
        const existing = get().homework.find(
          (h) => h.studentId === studentId && h.sessionId === sessionId,
        );
        if (existing) {
          set((s) => ({
            homework: s.homework.map((h) =>
              h.id === existing.id ? { ...h, status, recordedBy: actorId } : h,
            ),
          }));
        } else {
          set((s) => ({
            homework: [
              ...s.homework,
              { id: uid("hw"), studentId, sessionId, status, recordedBy: actorId },
            ],
          }));
        }
      },

      addPaymentDoc: async (data, actorId) => {
        if (useBackend()) {
          const token = authToken();
          if (token) {
            const doc = (await backend.createPaymentDoc(token, {
              studentId: data.studentId,
              amount: data.amount,
              paymentDate: data.paymentDate,
              fileName: data.fileName,
              fileType: data.fileType,
              fileBase64: data.fileBase64,
              note: data.note,
            })) as PaymentDoc;
            set((s) => ({ paymentDocs: [doc, ...s.paymentDocs] }));
            return;
          }
        }
        // Prototype store keeps metadata only; drop the file content.
        const { fileBase64: _fileBase64, ...meta } = data;
        const doc: PaymentDoc = {
          ...meta,
          id: uid("pay"),
          uploadedAt: nowIso(),
          deletedAt: null,
        };
        set((s) => ({ paymentDocs: [doc, ...s.paymentDocs] }));
        get().addAudit(
          actorId,
          "payment_doc.upload",
          `Tải lên chứng từ ${doc.fileName}`,
        );
      },

      updatePaymentDoc: (id, data, actorId) => {
        set((s) => ({
          paymentDocs: s.paymentDocs.map((d) =>
            d.id === id ? { ...d, ...data } : d,
          ),
        }));
        get().addAudit(actorId, "payment_doc.edit", `Sửa chứng từ ${id}`);
      },

      softDeletePaymentDoc: async (id, actorId) => {
        if (useBackend()) {
          const token = authToken();
          if (token) {
            await backend.softDeletePaymentDoc(token, id);
            set((s) => ({
              paymentDocs: s.paymentDocs.map((d) =>
                d.id === id ? { ...d, deletedAt: nowIso() } : d,
              ),
            }));
            return;
          }
        }
        set((s) => ({
          paymentDocs: s.paymentDocs.map((d) =>
            d.id === id ? { ...d, deletedAt: nowIso() } : d,
          ),
        }));
        get().addAudit(
          actorId,
          "payment_doc.delete",
          `Xóa chứng từ ${id} (yêu cầu xác thực admin)`,
        );
      },

      viewPaymentDoc: async (id) => {
        if (!useBackend()) {
          throw new Error(
            "Xem nội dung tệp chỉ khả dụng trong ứng dụng máy tính.",
          );
        }
        const token = authToken();
        if (!token) throw new Error("Phiên đăng nhập đã hết hạn.");
        const file = await backend.readPaymentDoc(token, id);
        // base64 -> Blob -> object URL, opened in a new window for viewing.
        const bin = atob(file.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: file.fileType }));
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },

      addClass: async (data, actorId) => {
        if (useBackend()) {
          const token = authToken();
          if (token) {
            const cls = (await backend.createClass(token, {
              name: data.name,
              courseName: data.courseName,
              teacherId: data.teacherId,
            })) as Class;
            set((s) => ({ classes: [cls, ...s.classes] }));
            return;
          }
        }
        const cls: Class = {
          id: uid("class"),
          name: data.name.trim(),
          courseName: data.courseName.trim(),
          teacherId: data.teacherId,
          studentIds: [],
          status: "active",
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        set((s) => ({ classes: [cls, ...s.classes] }));
        get().addAudit(actorId, "class.create", `Tạo lớp ${cls.name}`);
      },

      updateClass: async (id, data, actorId) => {
        if (useBackend()) {
          const token = authToken();
          const existing = get().classes.find((c) => c.id === id);
          if (token && existing) {
            const merged = { ...existing, ...data };
            const updated = (await backend.updateClass(token, id, {
              name: merged.name,
              courseName: merged.courseName,
              teacherId: merged.teacherId,
            })) as Class;
            set((s) => ({
              classes: s.classes.map((c) => (c.id === id ? updated : c)),
            }));
            return;
          }
        }
        const prev = get().classes.find((c) => c.id === id);
        set((s) => ({
          classes: s.classes.map((c) =>
            c.id === id ? { ...c, ...data, updatedAt: nowIso() } : c,
          ),
        }));
        get().addAudit(actorId, "class.update", `Cập nhật lớp ${prev?.name ?? id}`);
      },

      enrollStudent: async (classId, studentId, actorId) => {
        if (useBackend()) {
          const token = authToken();
          if (token) {
            await backend.enrollStudent(token, classId, studentId);
          }
        }
        const cls = get().classes.find((c) => c.id === classId);
        if (!cls || cls.studentIds.includes(studentId)) return; // no duplicates
        set((s) => ({
          classes: s.classes.map((c) =>
            c.id === classId
              ? { ...c, studentIds: [...c.studentIds, studentId], updatedAt: nowIso() }
              : c,
          ),
        }));
        if (!useBackend()) {
          const st = get().students.find((x) => x.id === studentId);
          get().addAudit(
            actorId,
            "class.enroll",
            `Ghi danh ${st?.name ?? studentId} vào ${cls.name}`,
          );
        }
      },

      unenrollStudent: async (classId, studentId, actorId) => {
        if (useBackend()) {
          const token = authToken();
          if (token) await backend.unenrollStudent(token, classId, studentId);
        }
        const cls = get().classes.find((c) => c.id === classId);
        set((s) => ({
          classes: s.classes.map((c) =>
            c.id === classId
              ? {
                  ...c,
                  studentIds: c.studentIds.filter((id) => id !== studentId),
                  updatedAt: nowIso(),
                }
              : c,
          ),
        }));
        if (!useBackend()) {
          const st = get().students.find((x) => x.id === studentId);
          get().addAudit(
            actorId,
            "class.unenroll",
            `Rút ${st?.name ?? studentId} khỏi ${cls?.name ?? classId}`,
          );
        }
      },

      setClassStatus: async (id, status, actorId) => {
        if (useBackend()) {
          const token = authToken();
          if (token) await backend.setClassStatus(token, id, status);
        }
        const prev = get().classes.find((c) => c.id === id);
        set((s) => ({
          classes: s.classes.map((c) =>
            c.id === id ? { ...c, status, updatedAt: nowIso() } : c,
          ),
        }));
        if (!useBackend()) {
          get().addAudit(
            actorId,
            "class.status_change",
            `Lớp ${prev?.name ?? id} → ${status}`,
          );
        }
      },

      deleteClass: async (id, actorId) => {
        const cls = get().classes.find((c) => c.id === id);
        if (useBackend()) {
          const token = authToken();
          if (token) await backend.deleteClass(token, id);
        }
        set((s) => ({
          classes: s.classes.filter((c) => c.id !== id),
          // Unlink sessions of the deleted class (keep them).
          sessions: s.sessions.map((se) =>
            se.classId === id ? { ...se, classId: null } : se,
          ),
        }));
        if (!useBackend()) {
          get().addAudit(actorId, "class.delete", `Xóa lớp ${cls?.name ?? id}`);
        }
      },

      addSession: async (data, actorId) => {
        if (useBackend()) {
          const token = authToken();
          if (token) {
            const session = (await backend.createSession(token, {
              googleEventId: data.googleEventId,
              title: data.title,
              startTime: data.startTime,
              endTime: data.endTime,
              teacherId: data.teacherId,
              classId: data.classId,
            })) as Session;
            set((s) => ({ sessions: [...s.sessions, session] }));
            return;
          }
        }
        const session: Session = {
          ...data,
          id: uid("ses"),
          googleEventId: data.googleEventId ?? `gcal-evt-${uid("")}`,
        };
        set((s) => ({ sessions: [...s.sessions, session] }));
        get().addAudit(actorId, "schedule.create", `Tạo buổi học ${session.title}`);
      },

      updateSession: async (id, data, actorId) => {
        if (useBackend()) {
          const token = authToken();
          const existing = get().sessions.find((se) => se.id === id);
          if (token && existing) {
            const m = { ...existing, ...data };
            const updated = (await backend.updateSession(token, id, {
              googleEventId: m.googleEventId,
              title: m.title,
              startTime: m.startTime,
              endTime: m.endTime,
              teacherId: m.teacherId,
              classId: m.classId,
            })) as Session;
            set((s) => ({
              sessions: s.sessions.map((se) => (se.id === id ? updated : se)),
            }));
            return;
          }
        }
        set((s) => ({
          sessions: s.sessions.map((se) =>
            se.id === id ? { ...se, ...data } : se,
          ),
        }));
        get().addAudit(actorId, "schedule.edit", `Sửa buổi học ${id}`);
      },

      deleteSession: async (id, actorId) => {
        if (useBackend()) {
          const token = authToken();
          if (token) await backend.deleteSession(token, id);
        }
        const prev = get().sessions.find((se) => se.id === id);
        set((s) => ({ sessions: s.sessions.filter((se) => se.id !== id) }));
        if (!useBackend()) {
          get().addAudit(
            actorId,
            "schedule.delete",
            `Xóa buổi học ${prev?.title ?? id}`,
          );
        }
      },

      upsertSessionsFromGoogle: async (incoming, actorId) => {
        if (useBackend()) {
          const token = authToken();
          if (token) {
            const all = (await backend.upsertSessionsFromGoogle(
              token,
              incoming.map((g) => ({
                googleEventId: g.googleEventId,
                title: g.title,
                startTime: g.startTime,
                endTime: g.endTime,
                teacherId: g.teacherId,
                classId: g.classId,
              })),
            )) as Session[];
            set({ sessions: all });
            return;
          }
        }
        // True upsert: keep all existing sessions (update the ones whose
        // google_event_id matches), then append events we haven't seen before.
        // We intentionally DON'T drop existing Google-linked sessions that are
        // absent from `incoming` — a pull only covers a time window, so removing
        // them would delete valid sessions outside that window.
        set((s) => {
          const updated = s.sessions.map((se) => {
            const match = se.googleEventId
              ? incoming.find((g) => g.googleEventId === se.googleEventId)
              : undefined;
            return match ? { ...se, ...match } : se;
          });
          const added = incoming
            .filter(
              (g) => !s.sessions.some((se) => se.googleEventId === g.googleEventId),
            )
            .map((g) => ({ ...g, id: uid("ses") }));
          return { sessions: [...updated, ...added] };
        });
        get().addAudit(
          actorId,
          "schedule.sync",
          `Đồng bộ ${incoming.length} buổi học từ Google Calendar`,
        );
      },

      resetData: () => set({ ...initialData() }),
    }),
    { name: "crm-data" },
  ),
);
