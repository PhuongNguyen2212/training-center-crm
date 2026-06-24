import {
  CalendarDays,
  CheckCircle2,
  Receipt,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { useDataStore } from "@/store/data-store";
import { useAuthStore } from "@/store/auth-store";
import { PageHeader, StatCard } from "@/components/ui";
import {
  ENROLLMENT_BADGE,
  ENROLLMENT_LABELS,
  ROLE_LABELS,
  formatDateTime,
  formatVND,
} from "@/lib/labels";
import { Badge } from "@/components/ui";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.currentUser)!;
  const students = useDataStore((s) => s.students).filter((s) => !s.deletedAt);
  const sessions = useDataStore((s) => s.sessions);
  const payments = useDataStore((s) => s.paymentDocs).filter((p) => !p.deletedAt);
  const auditLogs = useDataStore((s) => s.auditLogs);

  const confirmed = students.filter((s) => s.enrollmentStatus === "confirmed");
  const prospects = students.filter((s) => s.enrollmentStatus === "prospect");
  const revenue = payments.reduce((sum, p) => sum + p.amount, 0);

  // Audit: everyone sees their own activity; admin sees everyone's.
  // (Also enforced server-side in list_audit.)
  const isAdmin = user.role === "admin";
  const visibleLogs = isAdmin
    ? auditLogs
    : auditLogs.filter((l) => l.userId === user.id);

  const upcoming = [...sessions]
    .filter((s) => new Date(s.endTime) >= new Date())
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))
    .slice(0, 5);

  return (
    <div>
      <PageHeader
        title={`Xin chào, ${user.name.split(" ").slice(-1)[0]} 👋`}
        subtitle={`Vai trò: ${ROLE_LABELS[user.role]} · Tổng quan hoạt động trung tâm`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Tổng học viên"
          value={students.length}
          hint={`${confirmed.length} đã xác nhận · ${prospects.length} tiềm năng`}
          icon={<Users size={20} />}
        />
        <StatCard
          label="Học viên đã xác nhận"
          value={confirmed.length}
          hint="Đang theo học"
          icon={<CheckCircle2 size={20} />}
        />
        <StatCard
          label="Buổi học sắp tới"
          value={upcoming.length}
          hint="7 ngày tới"
          icon={<CalendarDays size={20} />}
        />
        <StatCard
          label="Doanh thu ghi nhận"
          value={formatVND(revenue)}
          hint={`${payments.length} chứng từ`}
          icon={<Receipt size={20} />}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Upcoming sessions */}
        <div className="card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-800">
            <CalendarDays size={18} className="text-brand-500" /> Buổi học sắp tới
          </h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-400">Không có buổi học nào sắp tới.</p>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">{s.title}</p>
                    <p className="text-xs text-slate-400">
                      {formatDateTime(s.startTime)}
                    </p>
                  </div>
                  <span className="text-xs text-brand-600">Google Calendar</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent students */}
        <div className="card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-800">
            <UserPlus size={18} className="text-brand-500" /> Học viên mới nhất
          </h2>
          <ul className="space-y-3">
            {[...students]
              .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
              .slice(0, 5)
              .map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">{s.name}</p>
                    <p className="text-xs text-slate-400">{s.goal}</p>
                  </div>
                  <Badge className={ENROLLMENT_BADGE[s.enrollmentStatus]}>
                    {ENROLLMENT_LABELS[s.enrollmentStatus]}
                  </Badge>
                </li>
              ))}
          </ul>
        </div>
      </div>

      {/* Audit log — own activity; admin sees everyone's (also enforced server-side) */}
      <div className="card mt-6 p-5">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-800">
          <TrendingUp size={18} className="text-brand-500" /> Nhật ký hoạt động
          (Audit log){isAdmin ? "" : " của bạn"}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="py-2 pr-4">Thời gian</th>
                <th className="py-2 pr-4">Hành động</th>
                <th className="py-2">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {visibleLogs.slice(0, 8).map((log) => (
                <tr key={log.id} className="border-b border-slate-50">
                  <td className="py-2 pr-4 text-slate-500">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="py-2 pr-4">
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                      {log.action}
                    </code>
                  </td>
                  <td className="py-2 text-slate-600">{log.detail}</td>
                </tr>
              ))}
              {visibleLogs.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-3 text-slate-400">
                    Chưa có hoạt động nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
