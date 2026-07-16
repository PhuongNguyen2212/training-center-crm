import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Cloud,
  CloudOff,
  Pencil,
  Plus,
  Plug,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useDataStore } from "@/store/data-store";
import { useAuthStore } from "@/store/auth-store";
import { errorMessage } from "@/lib/error";
import { hasRemoteBackend } from "@/lib/backend";
import { can } from "@/lib/permissions";
import { formatTime } from "@/lib/labels";
import { EmptyState, NoAccess, PageHeader } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { seedUsers } from "@/data/seed";
import type { Session } from "@/types";
import {
  connectGoogle,
  createEvent,
  deleteEvent,
  getCalendarId,
  isConnected,
  isGoogleConfigured,
  listEvents,
  updateEvent,
} from "@/lib/google-calendar";

const teachers = seedUsers.filter((u) => u.role === "teacher");

// Format a Date into the value an <input type="datetime-local"> expects.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

type SessionInput = {
  title: string;
  startTime: string;
  endTime: string;
  teacherId: string | null;
};

export default function SchedulePage() {
  const user = useAuthStore((s) => s.currentUser)!;
  const sessions = useDataStore((s) => s.sessions);
  const addSession = useDataStore((s) => s.addSession);
  const updateSession = useDataStore((s) => s.updateSession);
  const deleteSession = useDataStore((s) => s.deleteSession);
  const upsertFromGoogle = useDataStore((s) => s.upsertSessionsFromGoogle);

  const canView = can(user.role, "schedule.view");
  const canEdit = can(user.role, "schedule.edit"); // admin: any session
  // Teachers may create/edit/delete their OWN sessions (visible scopes to own).
  const canEditOwn = canEdit || user.role === "teacher";

  const googleConfigured = isGoogleConfigured();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Session | null>(null);
  const [deleting, setDeleting] = useState<Session | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [connected, setConnected] = useState(isConnected());
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      [...sessions]
        .filter((s) => (user.role === "teacher" ? s.teacherId === user.id : true))
        .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime)),
    [sessions, user.role, user.id],
  );

  if (!canView) return <NoAccess />;

  const grouped = visible.reduce<Record<string, Session[]>>((acc, s) => {
    const k = dayKey(s.startTime);
    (acc[k] ??= []).push(s);
    return acc;
  }, {});

  const teacherName = (id: string | null) =>
    teachers.find((t) => t.id === id)?.name ?? "—";

  // Connect to Google (OAuth popup), then pull events.
  const handleConnect = async () => {
    setError(null);
    setSyncing(true);
    try {
      await connectGoogle();
      setConnected(true);
      await pull();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSyncing(false);
    }
  };

  const pull = async () => {
    const events = await listEvents();
    upsertFromGoogle(
      events.map((e) => ({
        googleEventId: e.googleEventId,
        title: e.title,
        startTime: e.startTime,
        endTime: e.endTime,
        teacherId: e.teacherId,
        classId: e.classId,
      })),
      user.id,
    );
    setLastSync(new Date().toLocaleTimeString("vi-VN"));
  };

  const handleSync = async () => {
    setError(null);
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
      setError(errorMessage(e));
      setConnected(isConnected());
    } finally {
      setSyncing(false);
    }
  };

  // Create or edit: write to Google first (when connected), then mirror locally.
  const handleSubmit = async (data: SessionInput) => {
    setError(null);
    const useApi = googleConfigured && isConnected();
    setBusy(true);
    try {
      if (editing) {
        if (useApi && editing.googleEventId) {
          await updateEvent(editing.googleEventId, { ...data, classId: editing.classId });
        }
        // await so a backend rejection lands in this catch (not swallowed)
        await updateSession(editing.id, data, user.id);
      } else if (useApi) {
        const eventId = await createEvent({ ...data, classId: null });
        await addSession({ ...data, googleEventId: eventId, classId: null }, user.id);
      } else {
        await addSession({ ...data, googleEventId: null, classId: null }, user.id);
      }
      setFormOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (session: Session) => {
    setError(null);
    setBusy(true);
    try {
      if (googleConfigured && isConnected() && session.googleEventId) {
        await deleteEvent(session.googleEventId);
      }
      await deleteSession(session.id, user.id);
      setDeleting(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Lịch học"
        subtitle="Buổi học được quản lý và đồng bộ qua Google Calendar"
        actions={
          <div className="flex gap-2">
            {/* Desktop pushes to Google automatically via the backend service
                account; the browser-only connect/sync controls are web-demo only. */}
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
                  setError(null);
                  setFormOpen(true);
                }}
              >
                <Plus size={16} /> Tạo buổi học
              </button>
            )}
          </div>
        }
      />

      {/* Connection banner */}
      {hasRemoteBackend() ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <Cloud size={16} />
          Buổi học tự động đồng bộ lên Google Calendar chung — giáo viên/admin xem
          được trên điện thoại (sau khi đăng ký lịch đó).
        </div>
      ) : googleConfigured ? (
        <div
          className={`mb-4 flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${
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
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <CloudOff size={16} />
          Chưa cấu hình Google Calendar (thiếu <code className="mx-1">VITE_GOOGLE_CLIENT_ID</code>)
          — đang chạy ở chế độ cục bộ. Xem hướng dẫn trong <code>docs/google-calendar-setup.md</code>.
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}

      {user.role === "teacher" && (
        <p className="mb-4 text-xs text-slate-400">
          Bạn quản lý các buổi học của mình; chúng tự lên Google Calendar chung.
        </p>
      )}

      {Object.keys(grouped).length === 0 ? (
        <div className="card">
          <EmptyState message="Không có buổi học nào." />
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([day, list]) => (
            <div key={day}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold capitalize text-slate-600">
                <CalendarDays size={15} className="text-brand-500" /> {day}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((s) => (
                  <div key={s.id} className="card p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-slate-800">{s.title}</p>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {formatTime(s.startTime)} – {formatTime(s.endTime)}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          GV: {teacherName(s.teacherId)}
                        </p>
                      </div>
                      {canEditOwn && (
                        <div className="flex gap-1">
                          <button
                            className="btn-ghost p-1.5"
                            onClick={() => {
                              setEditing(s);
                              setError(null);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className="btn-ghost p-1.5 text-rose-600 hover:bg-rose-50"
                            onClick={() => setDeleting(s)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="mt-2 truncate text-[10px] text-slate-300">
                      {s.googleEventId ?? "(chỉ lưu cục bộ)"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <SessionForm
          session={editing}
          busy={busy}
          canAssignTeacher={user.role === "admin"}
          onClose={() => setFormOpen(false)}
          onSubmit={handleSubmit}
        />
      )}

      <Modal
        open={Boolean(deleting)}
        title="Xóa buổi học"
        onClose={() => setDeleting(null)}
        footer={
          <>
            <button className="btn-outline" onClick={() => setDeleting(null)}>
              Hủy
            </button>
            <button
              className="btn-danger"
              disabled={busy}
              onClick={() => deleting && handleDelete(deleting)}
            >
              {busy ? "Đang xóa..." : "Xóa"}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Xóa buổi học <strong>{deleting?.title}</strong>?{" "}
          {connected && deleting?.googleEventId
            ? "Sự kiện tương ứng trên Google Calendar cũng sẽ bị xóa."
            : "Buổi học sẽ bị xóa khỏi dữ liệu cục bộ."}
        </p>
      </Modal>
    </div>
  );
}

function SessionForm({
  session,
  busy,
  canAssignTeacher,
  onClose,
  onSubmit,
}: {
  session: Session | null;
  busy: boolean;
  canAssignTeacher: boolean;
  onClose: () => void;
  onSubmit: (data: SessionInput) => void;
}) {
  const [title, setTitle] = useState(session?.title ?? "");
  const [start, setStart] = useState(
    session ? toLocalInput(session.startTime) : "",
  );
  const [end, setEnd] = useState(session ? toLocalInput(session.endTime) : "");
  const [teacherId, setTeacherId] = useState(session?.teacherId ?? "");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !start || !end) {
      setError("Vui lòng nhập tiêu đề và thời gian.");
      return;
    }
    if (new Date(end) <= new Date(start)) {
      setError("Thời gian kết thúc phải sau thời gian bắt đầu.");
      return;
    }
    onSubmit({
      title: title.trim(),
      startTime: new Date(start).toISOString(),
      endTime: new Date(end).toISOString(),
      teacherId: teacherId || null,
    });
  };

  return (
    <Modal
      open
      title={session ? "Sửa buổi học" : "Tạo buổi học"}
      onClose={onClose}
      footer={
        <>
          <button className="btn-outline" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button
            type="submit"
            form="session-form"
            className="btn-primary"
            disabled={busy}
          >
            {busy ? "Đang lưu..." : "Lưu & đồng bộ"}
          </button>
        </>
      }
    >
      <form id="session-form" onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Tiêu đề buổi học</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Lớp A - Buổi 15"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Bắt đầu</label>
            <input
              type="datetime-local"
              className="input"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Kết thúc</label>
            <input
              type="datetime-local"
              className="input"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </div>
        {canAssignTeacher && (
          <div>
            <label className="label">Giáo viên</label>
            <select
              className="input"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
            >
              <option value="">— Chọn giáo viên —</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </form>
    </Modal>
  );
}
