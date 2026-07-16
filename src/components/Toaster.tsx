import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { useToastStore } from "@/store/toast-store";

// Fixed toast stack (bottom-right; full-width on small screens). Rendered once
// in AppLayout so every page shares it.
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex flex-col items-end gap-2 sm:left-auto sm:w-96">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className={`flex w-full items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm shadow-lg ${
            t.kind === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {t.kind === "error" ? (
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          )}
          <span className="min-w-0 flex-1">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="shrink-0 opacity-60 hover:opacity-100"
            aria-label="Đóng thông báo"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
