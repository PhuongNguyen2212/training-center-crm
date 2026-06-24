import { useCallback, useEffect, useState } from "react";
import { GraduationCap, KeyRound, LogOut, Menu, X } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth-store";
import { useDataStore } from "@/store/data-store";
import { NAV_ITEMS } from "@/lib/nav";
import { can } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/labels";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
import { NotificationBell } from "@/components/NotificationBell";
import { backend, hasRemoteBackend } from "@/lib/backend";

export default function AppLayout() {
  const user = useAuthStore((s) => s.currentUser)!;
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [pwOpen, setPwOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer

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
    if (!hasRemoteBackend()) return;
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
      {/* Sidebar — static on desktop, slide-in drawer on mobile */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:z-auto lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <GraduationCap size={20} />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-800">CRM Trung tâm</p>
            <p className="text-xs text-slate-400">Quản lý đào tạo</p>
          </div>
          <button
            className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setSidebarOpen(false)}
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

      {/* Backdrop behind the mobile drawer */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <main className="flex flex-1 flex-col overflow-hidden bg-slate-100">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 lg:px-8">
          <button
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            title="Menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1" />
          <NotificationBell />
        </div>
        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
