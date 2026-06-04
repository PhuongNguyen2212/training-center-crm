import { useCallback, useEffect, useState } from "react";
import { GraduationCap, KeyRound, LogOut } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth-store";
import { useDataStore } from "@/store/data-store";
import { NAV_ITEMS } from "@/lib/nav";
import { can } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/labels";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
import { backend, isTauri } from "@/lib/backend";

export default function AppLayout() {
  const user = useAuthStore((s) => s.currentUser)!;
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [pwOpen, setPwOpen] = useState(false);

  const items = NAV_ITEMS.filter((i) => i.cap === null || can(user.role, i.cap));

  // Auto-logout on inactivity; App re-routes to /login when currentUser clears.
  const onExpire = useCallback(() => navigate("/login"), [navigate]);
  useSessionTimeout(onExpire);

  const handleLogout = useCallback(() => {
    logout();
    navigate("/login");
  }, [logout, navigate]);

  // Desktop: backend sessions are in-memory, so a persisted login must be
  // revalidated on startup. If the token is stale, force re-login; otherwise
  // refresh data from SQLite.
  useEffect(() => {
    if (!isTauri()) return;
    const token = useAuthStore.getState().token;
    if (!token) {
      handleLogout();
      return;
    }
    backend
      .me(token)
      .then(() => useDataStore.getState().hydrateFromBackend(token))
      .catch(() => handleLogout());
  }, [handleLogout]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <GraduationCap size={20} />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-800">CRM Trung tâm</p>
            <p className="text-xs text-slate-400">Quản lý đào tạo</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-600 hover:bg-slate-100"
                  }`
                }
              >
                <Icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="mb-2 flex items-center gap-3 rounded-lg px-3 py-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {user.name.charAt(0)}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium text-slate-800">
                {user.name}
              </p>
              <p className="truncate text-xs text-slate-400">
                {ROLE_LABELS[user.role]}
              </p>
            </div>
          </div>
          <button
            onClick={() => setPwOpen(true)}
            className="btn-ghost w-full justify-start"
          >
            <KeyRound size={16} /> Đổi mật khẩu
          </button>
          <button onClick={handleLogout} className="btn-ghost w-full justify-start">
            <LogOut size={16} /> Đăng xuất
          </button>
        </div>
      </aside>

      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-slate-100 p-8">
        <Outlet />
      </main>
    </div>
  );
}
