// Vietnamese display labels for enums and roles (UI is Vietnamese-first).

import type {
  AttendanceStatus,
  EnrollmentStatus,
  HomeworkStatus,
  Role,
} from "@/types";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Quản trị viên",
  teacher: "Giáo viên",
  salesperson: "Nhân viên tư vấn",
  finance_staff: "Nhân viên tài chính",
};

export const USER_STATUS_LABELS: Record<"active" | "suspended", string> = {
  active: "Đang hoạt động",
  suspended: "Bị treo",
};

export const CLASS_STATUS_LABELS: Record<
  "active" | "completed" | "archived",
  string
> = {
  active: "Đang học",
  completed: "Đã kết thúc",
  archived: "Lưu trữ",
};

export const CLASS_STATUS_BADGE: Record<
  "active" | "completed" | "archived",
  string
> = {
  active: "bg-emerald-100 text-emerald-800",
  completed: "bg-sky-100 text-sky-800",
  archived: "bg-slate-200 text-slate-600",
};

export const ENROLLMENT_LABELS: Record<EnrollmentStatus, string> = {
  prospect: "Tiềm năng",
  confirmed: "Đã xác nhận",
  dropped: "Đã nghỉ",
};

export const ENROLLMENT_BADGE: Record<EnrollmentStatus, string> = {
  prospect: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  dropped: "bg-slate-200 text-slate-600",
};

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: "Có mặt",
  absent: "Vắng",
  late: "Đi muộn",
  excused: "Có phép",
};

export const ATTENDANCE_BADGE: Record<AttendanceStatus, string> = {
  present: "bg-emerald-100 text-emerald-800",
  absent: "bg-rose-100 text-rose-800",
  late: "bg-amber-100 text-amber-800",
  excused: "bg-sky-100 text-sky-800",
};

export const HOMEWORK_LABELS: Record<HomeworkStatus, string> = {
  completed: "Đã hoàn thành",
  not_completed: "Chưa hoàn thành",
};

export const formatVND = (amount: number): string =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    amount,
  );

export const formatDate = (iso: string): string =>
  new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(
    new Date(iso),
  );

export const formatDateTime = (iso: string): string =>
  new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));

export const formatTime = (iso: string): string =>
  new Intl.DateTimeFormat("vi-VN", { timeStyle: "short" }).format(
    new Date(iso),
  );
