import { useMemo, useState } from "react";
import { BookCheck, TrendingUp } from "lucide-react";
import { useAuthStore } from "@/store/auth-store";
import { can } from "@/lib/permissions";
import { NoAccess, PageHeader } from "@/components/ui";
import HomeworkTracker from "./HomeworkTracker";
import SalesReport from "./SalesReport";

export default function KpiPage() {
  const user = useAuthStore((s) => s.currentUser)!;
  const canHomework = can(user.role, "homework.record");
  const canSales = can(user.role, "sales.view");

  const tabs = useMemo(() => {
    const t: { key: "homework" | "sales"; label: string }[] = [];
    if (canHomework) t.push({ key: "homework", label: "Bài tập về nhà" });
    if (canSales) t.push({ key: "sales", label: "Báo cáo bán hàng" });
    return t;
  }, [canHomework, canSales]);

  const [tab, setTab] = useState<"homework" | "sales">(
    tabs[0]?.key ?? "homework",
  );

  if (tabs.length === 0) return <NoAccess />;

  return (
    <div>
      <PageHeader
        title="KPI"
        subtitle="Theo dõi bài tập về nhà và hiệu suất bán hàng"
      />

      <div className="mb-5 flex gap-1 rounded-lg bg-slate-200/60 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === t.key
                ? "bg-white text-brand-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.key === "homework" ? (
              <BookCheck size={16} />
            ) : (
              <TrendingUp size={16} />
            )}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "homework" && canHomework && <HomeworkTracker />}
      {tab === "sales" && canSales && <SalesReport />}
    </div>
  );
}
