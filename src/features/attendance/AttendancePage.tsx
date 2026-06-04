import { useMemo, useState } from "react";
import { CalendarDays, History, Info } from "lucide-react";
import { useDataStore } from "@/store/data-store";
import { useAuthStore } from "@/store/auth-store";
import { can } from "@/lib/permissions";
import {
  ATTENDANCE_BADGE,
  ATTENDANCE_LABELS,
  formatDate,
  formatDateTime,
  formatTime,
} from "@/lib/labels";
import { Badge, EmptyState, NoAccess, PageHeader } from "@/components/ui";
import { getSessionRoster } from "@/lib/roster";
import type { AttendanceStatus } from "@/types";

const STATUSES: AttendanceStatus[] = ["present", "absent", "late", "excused"];

export default function AttendancePage() {
  const user = useAuthStore((s) => s.currentUser)!;
  const sessions = useDataStore((s) => s.sessions);
  const students = useDataStore((s) => s.students);
  const classes = useDataStore((s) => s.classes);
  const attendance = useDataStore((s) => s.attendance);
  const markAttendance = useDataStore((s) => s.markAttendance);

  const canView = can(user.role, "attendance.view");
  const canMark = can(user.role, "attendance.mark");

  // Teacher sees only their own classes; admin sees all.
  const visibleSessions = useMemo(
    () =>
      [...sessions]
        .filter((s) => (user.role === "teacher" ? s.teacherId === user.id : true))
        .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime)),
    [sessions, user.role, user.id],
  );

  const [selectedId, setSelectedId] = useState<string | null>(
    visibleSessions[0]?.id ?? null,
  );

  if (!canView) return <NoAccess />;

  const selected = visibleSessions.find((s) => s.id === selectedId) ?? null;
  // Roster = students enrolled in this session's class (fallback: confirmed).
  const roster = getSessionRoster(selected, classes, students);

  // Latest (most recent markedAt) attendance row per student for this session.
  const latestFor = (studentId: string) => {
    if (!selected) return undefined;
    return attendance
      .filter((a) => a.sessionId === selected.id && a.studentId === studentId)
      .sort((a, b) => +new Date(b.markedAt) - +new Date(a.markedAt))[0];
  };

  const historyFor = (studentId: string) => {
    if (!selected) return [];
    return attendance
      .filter((a) => a.sessionId === selected.id && a.studentId === studentId)
      .sort((a, b) => +new Date(a.markedAt) - +new Date(b.markedAt));
  };

  return (
    <div>
      <PageHeader
        title="Điểm danh"
        subtitle="Ghi nhận theo từng buổi học · bản ghi chỉ thêm mới (append-only)"
      />

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Session list (phone-calendar feel) */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
            <CalendarDays size={16} className="text-brand-500" /> Buổi học
          </div>
          {visibleSessions.length === 0 ? (
            <EmptyState message="Không có buổi học." />
          ) : (
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
              {visibleSessions.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => setSelectedId(s.id)}
                    className={`flex w-full flex-col items-start px-4 py-3 text-left transition ${
                      selectedId === s.id
                        ? "bg-brand-50"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="text-sm font-medium text-slate-800">
                      {s.title}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatDate(s.startTime)} · {formatTime(s.startTime)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Roster */}
        <div className="card p-5">
          {!selected ? (
            <EmptyState message="Chọn một buổi học để điểm danh." />
          ) : (
            <>
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-slate-800">
                  {selected.title}
                </h2>
                <p className="text-sm text-slate-400">
                  {formatDateTime(selected.startTime)}
                </p>
              </div>

              <div className="mb-4 flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700">
                <Info size={14} className="mt-0.5 shrink-0" />
                Điểm danh là bằng chứng tham gia học. Khi sửa, hệ thống tạo bản
                ghi mới (override) thay vì chỉnh sửa bản ghi cũ.
              </div>

              {roster.length === 0 ? (
                <EmptyState message="Chưa có học viên trong danh sách lớp." />
              ) : (
                <div className="space-y-2">
                  {roster.map((st) => {
                    const latest = latestFor(st.id);
                    const history = historyFor(st.id);
                    return (
                      <div
                        key={st.id}
                        className="rounded-lg border border-slate-100 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                              {st.name.charAt(0)}
                            </span>
                            <div>
                              <p className="text-sm font-medium text-slate-800">
                                {st.name}
                              </p>
                              {latest ? (
                                <span className="flex items-center gap-1 text-xs text-slate-400">
                                  <Badge className={ATTENDANCE_BADGE[latest.status]}>
                                    {ATTENDANCE_LABELS[latest.status]}
                                  </Badge>
                                  {latest.isOverride && (
                                    <span className="text-amber-600">
                                      (đã ghi đè)
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-300">
                                  Chưa điểm danh
                                </span>
                              )}
                            </div>
                          </div>

                          {canMark && (
                            <div className="flex flex-wrap gap-1">
                              {STATUSES.map((status) => (
                                <button
                                  key={status}
                                  onClick={() =>
                                    markAttendance(
                                      st.id,
                                      selected.id,
                                      status,
                                      user.id,
                                    )
                                  }
                                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                                    latest?.status === status
                                      ? ATTENDANCE_BADGE[status]
                                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                  }`}
                                >
                                  {ATTENDANCE_LABELS[status]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {history.length > 1 && (
                          <div className="mt-2 border-t border-slate-100 pt-2">
                            <p className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-400">
                              <History size={12} /> Lịch sử điểm danh
                            </p>
                            <ul className="space-y-0.5">
                              {history.map((h) => (
                                <li
                                  key={h.id}
                                  className="text-xs text-slate-500"
                                >
                                  {formatDateTime(h.markedAt)} —{" "}
                                  {ATTENDANCE_LABELS[h.status]}
                                  {h.isOverride && (
                                    <span className="text-amber-600">
                                      {" "}
                                      (override)
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
