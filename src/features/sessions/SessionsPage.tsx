import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Cloud,
  CloudOff,
  Copy,
  History,
  Info,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { useDataStore } from "@/store/data-store";
import { useAuthStore } from "@/store/auth-store";
import { notify } from "@/store/toast-store";
import { errorMessage } from "@/lib/error";
import { hasRemoteBackend } from "@/lib/backend";
import { can } from "@/lib/permissions";
import { getSessionRoster } from "@/lib/roster";
import {
  ATTENDANCE_BADGE,
  ATTENDANCE_LABELS,
  formatDate,
  formatDateTime,
  formatTime,
} from "@/lib/labels";
import { Badge, EmptyState, NoAccess, PageHeader } from "@/components/ui";
import { Modal } from "@/components/Modal";
import {
  connectGoogle,
  getCalendarId,
  isConnected,
  isGoogleConfigured,
  listEvents,
} from "@/lib/google-calendar";
import type { AttendanceStatus, Session, Student } from "@/types";
import { DeleteSessionModal, SessionForm } from "./SessionForm";
import { teachers } from "./teachers";
import { useSessionActions } from "./use-session-actions";

const STATUSES: AttendanceStatus[] = ["present", "absent", "late", "excused"];

const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });

const isToday = (iso: string) =>
  new Date(iso).toDateString() === new Date().toDateString();

/**
 * Buổi học & Điểm danh — one session-centric page: pick a session, manage its
 * student list, and mark attendance on that list.
 */
export default function SessionsPage() {
  const user = useAuthStore((s) => s.currentUser)!;
  const sessions = useDataStore((s) => s.sessions);
  const students = useDataStore((s) => s.students);
  const attendance = useDataStore((s) => s.attendance);
  const markAttendance = useDataStore((s) => s.markAttendance);
  const addSessionStudents = useDataStore((s) => s.addSessionStudents);
  const removeSessionStudent = useDataStore((s) => s.removeSessionStudent);
  const upsertFromGoogle = useDataStore((s) => s.upsertSessionsFromGoogle);
  const actions = useSessionActions();

  const canView = can(user.role, "schedule.view");
  // Admin edits any session; teachers their OWN (server re-checks).
  const canEditOwn = can(user.role, "schedule.edit") || user.role === "teacher";
  const canMark = can(user.role, "attendance.mark");

  const googleConfigured = isGoogleConfigured();

  const visible = useMemo(
    () =>
      [...sessions]
        .filter((s) => (user.role === "teacher" ? s.teacherId === user.id : true))
        .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime)),
    [sessions, user.role, user.id],
  );

  // Default to the session closest to now: the next one today or later,
  // otherwise the most recent past one.
  const defaultId = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const upcoming = visible.find((s) => +new Date(s.endTime) >= startOfToday);
    return (upcoming ?? visible.filter((s) => +new Date(s.startTime) < now).pop())
      ?.id;
  }, [visible]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Session | null>(null);
  const [deleting, setDeleting] = useState<Session | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [connected, setConnected] = useState(isConnected());
  const [syncError, setSyncError] = useState<string | null>(null);
  const error = syncError ?? actions.error;

  if (!canView) return <NoAccess />;

  const selected =
    visible.find((s) => s.id === selectedId) ??
    visible.find((s) => s.id === defaultId) ??
    null;
  const roster = getSessionRoster(selected, students);

  const grouped = visible.reduce<Record<string, Session[]>>((acc, s) => {
    (acc[dayKey(s.startTime)] ??= []).push(s);
    return acc;
  }, {});

  const teacherName = (id: string | null) =>
    teachers.find((t) => t.id === id)?.name ?? "—";

  const historyFor = (studentId: string) =>
    selected
      ? attendance
          .filter((a) => a.sessionId === selected.id && a.studentId === studentId)
          .sort((a, b) => +new Date(a.markedAt) - +new Date(b.markedAt))
      : [];

  const markedCount = roster.filter((st) => historyFor(st.id).length > 0).length;

  // ---- Google sync (web demo only; the backend pushes to Google itself) ----
  const pull = async () => {
    const events = await listEvents();
    await upsertFromGoogle(events, user.id);
    setLastSync(new Date().toLocaleTimeString("vi-VN"));
  };

  const handleConnect = async () => {
    setSyncError(null);
    setSyncing(true);
    try {
      await connectGoogle();
      setConnected(true);
      await pull();
    } catch (e) {
      setSyncError(errorMessage(e));
    } finally {
      setSyncing(false);
    }
  };

  const handleSync = async () => {
    setSyncError(null);
    // No Google configured → keep the local-only demo behavior.
    if (!googleConfigured) {
      setSyncing(true);
      setTimeout(() => {
        setSyncing(false);
        setLastSync(new Date().toLocaleTimeString("vi-VN"));
      }, 700);
      return;
    }
    if (!isConnected()) {
      await handleConnect();
      return;
    }
    setSyncing(true);
    try {
      await pull();
    } catch (e) {
      setSyncError(errorMessage(e));
      setConnected(isConnected());
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Buổi học & Điểm danh"
        subtitle="Chọn buổi học → thêm học viên → điểm danh. Buổi học đồng bộ Google Calendar."
        actions={
          <div className="flex gap-2">
            {!hasRemoteBackend() && googleConfigured && !connected && (
              <button className="btn-outline" onClick={handleConnect} disabled={syncing}>
                <Plug size={16} /> Kết nối Google
              </button>
            )}
            {!hasRemoteBackend() && (
              <button className="btn-outline" onClick={handleSync} disabled={syncing}>
                <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
                {syncing ? "Đang đồng bộ..." : "Đồng bộ"}
              </button>
            )}
            {canEditOwn && (
              <button
                className="btn-primary"
                onClick={() => {
                  setEditing(null);
                  actions.setError(null);
                  setFormOpen(true);
                }}
              >
                <Plus size={16} /> Tạo buổi học
              </button>
            )}
          </div>
        }
      />

      {/* Connection status */}
      {hasRemoteBackend() ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          <Cloud size={16} />
          Buổi học tự động đồng bộ lên Google Calendar chung.
        </div>
      ) : googleConfigured ? (
        <div
          className={`mb-4 flex items-center justify-between rounded-lg border px-4 py-2 text-sm ${
            connected
              ? "border-emerald-100 bg-emerald-50 text-emerald-800"
              : "border-amber-100 bg-amber-50 text-amber-800"
          }`}
        >
          <span className="flex items-center gap-2">
            {connected ? <Cloud size={16} /> : <CloudOff size={16} />}
            {connected
              ? `Đã kết nối Google Calendar · lịch: ${getCalendarId()}`
              : "Chưa kết nối Google Calendar — nhấn “Kết nối Google” để đăng nhập."}
          </span>
          <span className="text-xs opacity-70">
            {lastSync ? `Đồng bộ lần cuối: ${lastSync}` : "OAuth 2.0"}
          </span>
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
          <CloudOff size={16} />
          Chưa cấu hình Google Calendar — đang chạy ở chế độ cục bộ.
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Session list, grouped by day */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
            <CalendarDays size={16} className="text-brand-500" /> Buổi học
          </div>
          {visible.length === 0 ? (
            <EmptyState message="Chưa có buổi học nào." />
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
              {Object.entries(grouped).map(([day, list]) => (
                <div key={day}>
                  <p className="sticky top-0 bg-slate-50 px-4 py-1.5 text-xs font-semibold capitalize text-slate-500">
                    {day}
                    {isToday(list[0].startTime) && (
                      <span className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold normal-case text-brand-700">
                        Hôm nay
                      </span>
                    )}
                  </p>
                  <ul className="divide-y divide-slate-100">
                    {list.map((s) => (
                      <li key={s.id}>
                        <button
                          onClick={() => setSelectedId(s.id)}
                          className={`flex w-full flex-col items-start px-4 py-2.5 text-left transition ${
                            selected?.id === s.id ? "bg-brand-50" : "hover:bg-slate-50"
                          }`}
                        >
                          <span className="text-sm font-medium text-slate-800">
                            {s.title}
                          </span>
                          <span className="flex items-center gap-2 text-xs text-slate-400">
                            {formatTime(s.startTime)}–{formatTime(s.endTime)}
                            <span className="flex items-center gap-0.5">
                              <Users size={11} /> {s.studentIds.length}
                            </span>
                            {user.role !== "teacher" && (
                              <span>· {teacherName(s.teacherId)}</span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Session detail: roster + attendance */}
        <div className="card p-5">
          {!selected ? (
            <EmptyState message="Chọn một buổi học." />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">
                    {selected.title}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {formatDate(selected.startTime)} · {formatTime(selected.startTime)}–
                    {formatTime(selected.endTime)} · GV: {teacherName(selected.teacherId)}
                  </p>
                </div>
                {canEditOwn && (
                  <div className="flex gap-2">
                    <button
                      className="btn-outline"
                      onClick={() => {
                        setEditing(selected);
                        actions.setError(null);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil size={15} /> Sửa
                    </button>
                    <button
                      className="btn-outline text-rose-600 hover:bg-rose-50"
                      onClick={() => setDeleting(selected)}
                    >
                      <Trash2 size={15} /> Xóa
                    </button>
                  </div>
                )}
              </div>

              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800">
                  <Users size={17} className="text-brand-500" /> Học viên ({roster.length})
                  {roster.length > 0 && (
                    <span className="text-xs font-normal text-slate-400">
                      · đã điểm danh {markedCount}/{roster.length}
                    </span>
                  )}
                </h3>
                {canMark && (
                  <div className="flex gap-2">
                    <button className="btn-outline" onClick={() => setCopyOpen(true)}>
                      <Copy size={15} /> Lấy từ buổi khác
                    </button>
                    <button className="btn-outline" onClick={() => setAddOpen(true)}>
                      <UserPlus size={15} /> Thêm học viên
                    </button>
                  </div>
                )}
              </div>

              <div className="mb-4 flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700">
                <Info size={14} className="mt-0.5 shrink-0" />
                Điểm danh là bằng chứng tham gia học: khi sửa, hệ thống tạo bản ghi
                mới (override). Học viên đã được điểm danh không thể rút khỏi buổi.
              </div>

              {roster.length === 0 ? (
                <EmptyState message="Buổi này chưa có học viên — nhấn “Thêm học viên” hoặc “Lấy từ buổi khác”." />
              ) : (
                <div className="space-y-2">
                  {roster.map((st) => {
                    const history = historyFor(st.id);
                    const latest = history[history.length - 1];
                    return (
                      <div key={st.id} className="rounded-lg border border-slate-100 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                              {st.name.charAt(0)}
                            </span>
                            <div>
                              <p className="text-sm font-medium text-slate-800">{st.name}</p>
                              {latest ? (
                                <span className="flex items-center gap-1 text-xs text-slate-400">
                                  <Badge className={ATTENDANCE_BADGE[latest.status]}>
                                    {ATTENDANCE_LABELS[latest.status]}
                                  </Badge>
                                  {latest.isOverride && (
                                    <span className="text-amber-600">(đã ghi đè)</span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-300">Chưa điểm danh</span>
                              )}
                            </div>
                          </div>

                          {canMark && (
                            <div className="flex flex-wrap items-center gap-1">
                              {STATUSES.map((status) => (
                                <button
                                  key={status}
                                  onClick={() =>
                                    notify(markAttendance(st.id, selected.id, status, user.id))
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
                              {history.length === 0 && (
                                <button
                                  className="btn-ghost ml-1 p-1.5 text-rose-600 hover:bg-rose-50"
                                  title="Rút khỏi buổi"
                                  onClick={() =>
                                    notify(removeSessionStudent(selected.id, st.id, user.id))
                                  }
                                >
                                  <UserMinus size={15} />
                                </button>
                              )}
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
                                <li key={h.id} className="text-xs text-slate-500">
                                  {formatDateTime(h.markedAt)} — {ATTENDANCE_LABELS[h.status]}
                                  {h.isOverride && (
                                    <span className="text-amber-600"> (override)</span>
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

      {formOpen && (
        <SessionForm
          session={editing}
          busy={actions.busy}
          canAssignTeacher={user.role === "admin"}
          onClose={() => setFormOpen(false)}
          onSubmit={async (data) => {
            if (await actions.save(editing, data)) setFormOpen(false);
          }}
        />
      )}

      <DeleteSessionModal
        session={deleting}
        busy={actions.busy}
        onClose={() => setDeleting(null)}
        onConfirm={async (s) => {
          if (await actions.remove(s)) {
            setDeleting(null);
            setSelectedId(null);
          }
        }}
      />

      {addOpen && selected && (
        <AddStudentsModal
          candidates={students.filter(
            (s) => !s.deletedAt && !selected.studentIds.includes(s.id),
          )}
          onClose={() => setAddOpen(false)}
          onAdd={(studentId) =>
            notify(addSessionStudents(selected.id, [studentId], user.id))
          }
        />
      )}

      {copyOpen && selected && (
        <CopyRosterModal
          sources={visible.filter(
            (s) => s.id !== selected.id && s.studentIds.length > 0,
          )}
          onClose={() => setCopyOpen(false)}
          onCopy={(source) => {
            notify(addSessionStudents(selected.id, source.studentIds, user.id));
            setCopyOpen(false);
          }}
        />
      )}
    </div>
  );
}

function AddStudentsModal({
  candidates,
  onClose,
  onAdd,
}: {
  candidates: Student[];
  onClose: () => void;
  onAdd: (studentId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const list = candidates.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Modal open title="Thêm học viên vào buổi học" onClose={onClose}>
      <input
        className="input mb-3"
        placeholder="Tìm học viên..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          Không có học viên phù hợp.
        </p>
      ) : (
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
          {list.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-700">
                {s.name}
                {s.phone && <span className="ml-2 text-xs text-slate-400">{s.phone}</span>}
              </span>
              <button className="btn-outline px-2 py-1 text-xs" onClick={() => onAdd(s.id)}>
                <UserPlus size={13} /> Thêm
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function CopyRosterModal({
  sources,
  onClose,
  onCopy,
}: {
  sources: Session[];
  onClose: () => void;
  onCopy: (source: Session) => void;
}) {
  // Most recent first — usually the previous session of the same course.
  const list = [...sources].sort(
    (a, b) => +new Date(b.startTime) - +new Date(a.startTime),
  );
  return (
    <Modal open title="Lấy danh sách học viên từ buổi khác" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500">
        Học viên của buổi được chọn sẽ được thêm vào buổi này (bỏ qua người đã có).
      </p>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          Chưa có buổi nào khác có học viên.
        </p>
      ) : (
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
          {list.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <p className="text-sm font-medium text-slate-700">{s.title}</p>
                <p className="text-xs text-slate-400">
                  {formatDate(s.startTime)} · {formatTime(s.startTime)}
                </p>
              </div>
              <button className="btn-outline px-2 py-1 text-xs" onClick={() => onCopy(s)}>
                <Copy size={13} /> Chép {s.studentIds.length} học viên
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
