import { useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useDataStore } from "@/store/data-store";
import { hasRemoteBackend } from "@/lib/backend";
import { formatDateTime } from "@/lib/labels";

// Any class-related activity (enroll/unenroll/create/update/status/delete) is
// broadcast to EVERYONE via `notifications` (unscoped). In the web demo we fall
// back to local audit logs filtered to class actions.
const isClassAction = (action: string) => action.startsWith("class.");
const SEEN_KEY = "crm.notifications.seenAt";

const dotColor = (action: string) =>
  action === "class.unenroll" || action === "class.delete"
    ? "bg-rose-400"
    : action === "class.enroll" || action === "class.create"
      ? "bg-emerald-400"
      : "bg-sky-400";

export function NotificationBell() {
  const notifications = useDataStore((s) => s.notifications);
  const auditLogs = useDataStore((s) => s.auditLogs);
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState<number>(() =>
    Number(localStorage.getItem(SEEN_KEY) ?? 0),
  );
  const ref = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const base = hasRemoteBackend() ? notifications : auditLogs;
    return [...base]
      .filter((l) => isClassAction(l.action))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, 20);
  }, [notifications, auditLogs]);

  const unread = useMemo(
    () => items.filter((l) => +new Date(l.createdAt) > seenAt).length,
    [items, seenAt],
  );

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      const now = Date.now();
      localStorage.setItem(SEEN_KEY, String(now));
      setSeenAt(now);
    }
  };

  // Close when clicking outside the dropdown.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        title="Thông báo lớp học"
        className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700">
            Thông báo lớp học
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              Chưa có thông báo.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-slate-50 overflow-y-auto">
              {items.map((l) => (
                <li key={l.id} className="flex gap-2.5 px-4 py-2.5">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotColor(l.action)}`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700">{l.detail}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {l.userName ? `${l.userName} · ` : ""}
                      {formatDateTime(l.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
