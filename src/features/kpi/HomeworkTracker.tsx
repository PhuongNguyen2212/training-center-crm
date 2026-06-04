import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { useDataStore } from "@/store/data-store";
import { useAuthStore } from "@/store/auth-store";
import { Badge, EmptyState } from "@/components/ui";
import { getSessionRoster } from "@/lib/roster";
import { HOMEWORK_LABELS, formatDate, formatTime } from "@/lib/labels";

export default function HomeworkTracker() {
  const user = useAuthStore((s) => s.currentUser)!;
  const sessions = useDataStore((s) => s.sessions);
  const students = useDataStore((s) => s.students);
  const classes = useDataStore((s) => s.classes);
  const homework = useDataStore((s) => s.homework);
  const setHomework = useDataStore((s) => s.setHomework);

  // Teacher records homework for their own sessions only.
  const visibleSessions = useMemo(
    () =>
      [...sessions]
        .filter((s) => (user.role === "teacher" ? s.teacherId === user.id : true))
        .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime)),
    [sessions, user.role, user.id],
  );

  const [sessionId, setSessionId] = useState(visibleSessions[0]?.id ?? "");

  const selectedSession = visibleSessions.find((s) => s.id === sessionId) ?? null;
  const roster = getSessionRoster(selectedSession, classes, students);

  const statusFor = (studentId: string) =>
    homework.find((h) => h.studentId === studentId && h.sessionId === sessionId)
      ?.status;

  const completedCount = roster.filter(
    (s) => statusFor(s.id) === "completed",
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[260px]">
          <label className="label">Buổi học</label>
          <select
            className="input"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          >
            {visibleSessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} · {formatDate(s.startTime)} {formatTime(s.startTime)}
              </option>
            ))}
          </select>
        </div>
        {sessionId && (
          <div className="pb-1 text-sm text-slate-500">
            Đã hoàn thành:{" "}
            <span className="font-semibold text-emerald-600">
              {completedCount}
            </span>
            /{roster.length}
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        {!sessionId || roster.length === 0 ? (
          <EmptyState message="Chọn buổi học có danh sách học viên." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Học viên</th>
                <th className="px-4 py-3">Trạng thái bài tập</th>
                <th className="px-4 py-3 text-right">Ghi nhận</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((s) => {
                const status = statusFor(s.id);
                return (
                  <tr
                    key={s.id}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {s.name}
                    </td>
                    <td className="px-4 py-3">
                      {status ? (
                        <Badge
                          className={
                            status === "completed"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800"
                          }
                        >
                          {HOMEWORK_LABELS[status]}
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-300">
                          Chưa ghi nhận
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() =>
                            setHomework(s.id, sessionId, "completed", user.id)
                          }
                          className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                            status === "completed"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-500 hover:bg-emerald-50"
                          }`}
                        >
                          <Check size={14} /> Hoàn thành
                        </button>
                        <button
                          onClick={() =>
                            setHomework(
                              s.id,
                              sessionId,
                              "not_completed",
                              user.id,
                            )
                          }
                          className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                            status === "not_completed"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-slate-100 text-slate-500 hover:bg-rose-50"
                          }`}
                        >
                          <X size={14} /> Chưa
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
