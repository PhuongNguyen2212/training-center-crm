import { useMemo } from "react";
import { Percent, TrendingUp, UserCheck, Users } from "lucide-react";
import { useDataStore } from "@/store/data-store";
import { useAuthStore } from "@/store/auth-store";
import { StatCard } from "@/components/ui";
import { formatVND } from "@/lib/labels";

function statsFor(
  salespersonId: string,
  students: ReturnType<typeof useDataStore.getState>["students"],
  paymentDocs: ReturnType<typeof useDataStore.getState>["paymentDocs"],
) {
  const mine = students.filter(
    (s) => !s.deletedAt && s.salespersonId === salespersonId,
  );
  const now = new Date();
  const newThisMonth = mine.filter((s) => {
    const d = new Date(s.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const confirmed = mine.filter((s) => s.enrollmentStatus === "confirmed");
  const conversion = mine.length
    ? Math.round((confirmed.length / mine.length) * 100)
    : 0;
  const myStudentIds = new Set(mine.map((s) => s.id));
  const revenue = paymentDocs
    .filter((d) => !d.deletedAt && myStudentIds.has(d.studentId))
    .reduce((sum, d) => sum + d.amount, 0);
  return { total: mine.length, newThisMonth, confirmed: confirmed.length, conversion, revenue };
}

export default function SalesReport() {
  const user = useAuthStore((s) => s.currentUser)!;
  const students = useDataStore((s) => s.students);
  const paymentDocs = useDataStore((s) => s.paymentDocs);
  const users = useDataStore((s) => s.users);

  // Salesperson sees their own; admin sees every (real) salesperson from the DB.
  const targets = useMemo(
    () =>
      user.role === "admin"
        ? users.filter((u) => u.role === "salesperson")
        : [user],
    [user, users],
  );

  const rows = useMemo(
    () =>
      targets.map((sp) => ({
        person: sp,
        ...statsFor(sp.id, students, paymentDocs),
      })),
    [targets, students, paymentDocs],
  );

  // For a salesperson, show their KPI as headline cards.
  if (user.role !== "admin") {
    const r = rows[0];
    if (!r) return null;
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Học viên mới (tháng này)"
          value={r.newThisMonth}
          hint={`Tổng ${r.total} học viên giới thiệu`}
          icon={<Users size={20} />}
        />
        <StatCard
          label="Đã xác nhận"
          value={r.confirmed}
          icon={<UserCheck size={20} />}
        />
        <StatCard
          label="Tỷ lệ chuyển đổi"
          value={`${r.conversion}%`}
          hint="Tiềm năng → Xác nhận"
          icon={<Percent size={20} />}
        />
        <StatCard
          label="Doanh thu giới thiệu"
          value={formatVND(r.revenue)}
          icon={<TrendingUp size={20} />}
        />
      </div>
    );
  }

  // Admin: comparison table across all salespeople.
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400">
          <tr>
            <th className="px-4 py-3">Nhân viên tư vấn</th>
            <th className="px-4 py-3">HV mới (tháng)</th>
            <th className="px-4 py-3">Tổng HV</th>
            <th className="px-4 py-3">Đã xác nhận</th>
            <th className="px-4 py-3">Tỷ lệ chuyển đổi</th>
            <th className="px-4 py-3">Doanh thu</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.person.id}
              className="border-t border-slate-100 hover:bg-slate-50"
            >
              <td className="px-4 py-3 font-medium text-slate-800">
                {r.person.name}
              </td>
              <td className="px-4 py-3 text-slate-600">{r.newThisMonth}</td>
              <td className="px-4 py-3 text-slate-600">{r.total}</td>
              <td className="px-4 py-3 text-slate-600">{r.confirmed}</td>
              <td className="px-4 py-3">
                <span className="font-medium text-brand-600">
                  {r.conversion}%
                </span>
              </td>
              <td className="px-4 py-3 font-medium text-slate-800">
                {formatVND(r.revenue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
