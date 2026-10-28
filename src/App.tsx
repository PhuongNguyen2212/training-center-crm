import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "@/store/auth-store";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import StudentsPage from "@/features/students/StudentsPage";
import SessionsPage from "@/features/sessions/SessionsPage";
import FinancePage from "@/features/finance/FinancePage";
import KpiPage from "@/features/kpi/KpiPage";
import HomeworkPage from "@/features/kpi/HomeworkPage";
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
        <Route path="/sessions" element={<SessionsPage />} />
        {/* Old pages merged into /sessions */}
        <Route path="/classes" element={<Navigate to="/sessions" replace />} />
        <Route
          path="/schedule"
          element={<Navigate to="/sessions" replace />}
        />
        <Route path="/attendance" element={<Navigate to="/sessions" replace />} />
        <Route path="/homework" element={<HomeworkPage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/kpi" element={<KpiPage />} />
        <Route path="/staff" element={<StaffPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
