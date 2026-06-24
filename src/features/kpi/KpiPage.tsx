import { useAuthStore } from "@/store/auth-store";
import { can } from "@/lib/permissions";
import { NoAccess, PageHeader } from "@/components/ui";
import SalesReport from "./SalesReport";

// KPI — chỉ báo cáo bán hàng, dành cho nhân viên tư vấn (own) và admin (tất cả).
export default function KpiPage() {
  const user = useAuthStore((s) => s.currentUser)!;
  if (!can(user.role, "sales.view")) return <NoAccess />;

  return (
    <div>
      <PageHeader
        title="KPI — Báo cáo bán hàng"
        subtitle="Hiệu suất tuyển sinh và doanh thu theo nhân viên tư vấn"
      />
      <SalesReport />
    </div>
  );
}
