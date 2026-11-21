import type { ReactNode } from "react";
import { Inbox, ShieldAlert } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <span className={`badge ${className}`}>{children}</span>;
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
      <Inbox size={40} strokeWidth={1.5} />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
      <ShieldAlert size={48} strokeWidth={1.5} />
      <p className="text-base font-medium text-slate-600">
        Bạn không có quyền truy cập mục này
      </p>
      <p className="text-sm">Liên hệ quản trị viên nếu cần cấp quyền.</p>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        {icon && <span className="text-brand-500">{icon}</span>}
      </div>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export interface MobileField {
  label: string;
  value: ReactNode;
  /** Span both columns (long text such as a goal or note). */
  wide?: boolean;
}

/**
 * One table row rendered as a stacked card for phone screens. Pages show their
 * `<table>` from `md` up (`hidden md:block`) and a list of these below it
 * (`md:hidden`), sharing the same row data and action buttons.
 */
export function MobileCard({
  title,
  subtitle,
  badge,
  fields = [],
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  fields?: MobileField[];
  actions?: ReactNode;
}) {
  return (
    <div className="border-t border-slate-100 p-4 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words font-medium text-slate-800">{title}</div>
          {subtitle && <div className="mt-0.5 text-xs text-slate-400">{subtitle}</div>}
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>
      {fields.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {fields.map((f) => (
            <div key={f.label} className={`min-w-0 ${f.wide ? "col-span-2" : ""}`}>
              <dt className="text-xs text-slate-400">{f.label}</dt>
              <dd className="break-words text-slate-700">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {actions && (
        <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
          {actions}
        </div>
      )}
    </div>
  );
}
