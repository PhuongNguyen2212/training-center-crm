import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "@/store/auth-store";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import StudentsPage from "@/features/students/StudentsPage";
import ClassesPage from "@/features/classes/ClassesPage";
import SchedulePage from "@/features/schedule/SchedulePage";
import AttendancePage from "@/features/attendance/AttendancePage";
import FinancePage from "@/features/finance/FinancePage";
import KpiPage from "@/features/kpi/KpiPage";
import StaffPage from "@/features/staff/StaffPage";

export default function App() {
  const user = useAuthStore((s) => s.currentUser);

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/classes" element={<ClassesPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/kpi" element={<KpiPage />} />
        <Route path="/staff" element={<StaffPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
