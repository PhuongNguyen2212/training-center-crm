import { useState } from "react";
import { Modal } from "@/components/Modal";
import type { Session } from "@/types";
import { teachers } from "./teachers";


export type SessionInput = {
  title: string;
  startTime: string;
  endTime: string;
  teacherId: string | null;
};

// Format a Date into the value an <input type="datetime-local"> expects.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function SessionForm({
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

export function DeleteSessionModal({
  session,
  busy,
  onClose,
  onConfirm,
}: {
  session: Session | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (session: Session) => void;
}) {
  return (
    <Modal
      open={Boolean(session)}
      title="Xóa buổi học"
      onClose={onClose}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button
            className="btn-danger"
            disabled={busy}
            onClick={() => session && onConfirm(session)}
          >
            {busy ? "Đang xóa..." : "Xóa"}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        Xóa buổi học <strong>{session?.title}</strong>?{" "}
        {session?.googleEventId
          ? "Sự kiện tương ứng trên Google Calendar cũng sẽ bị xóa."
          : "Buổi học sẽ bị xóa khỏi dữ liệu cục bộ."}
      </p>
    </Modal>
  );
}
