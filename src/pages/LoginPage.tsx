import { useState } from "react";
import { GraduationCap, LogIn } from "lucide-react";
import { useAuthStore } from "@/store/auth-store";
import { seedUsers } from "@/data/seed";
import { ROLE_LABELS } from "@/lib/labels";

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await login(email, password);
    setBusy(false);
    if (!res.ok) setError(res.error);
    // On success the auth store sets currentUser and App re-routes automatically.
  };

  const quickFill = (em: string, pw: string) => {
    setEmail(em);
    setPassword(pw);
    setError("");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-700 to-brand-900 p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl md:grid-cols-2">
        {/* Brand panel */}
        <div className="hidden flex-col justify-between bg-brand-600 p-8 text-white md:flex">
          <div className="flex items-center gap-2">
            <GraduationCap size={28} />
            <span className="text-lg font-semibold">CRM Trung tâm</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold leading-snug">
              Quản lý học viên, lịch học, điểm danh & tài chính
            </h2>
            <p className="mt-3 text-sm text-brand-100">
              Hệ thống quản lý trung tâm đào tạo — hoạt động offline, đồng bộ
              lịch học qua Google Calendar.
            </p>
          </div>
          <p className="text-xs text-brand-200">Phiên bản MVP · 2026</p>
        </div>

        {/* Form */}
        <div className="p-8">
          <h1 className="text-xl font-semibold text-slate-900">Đăng nhập</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sử dụng tài khoản nhân viên của bạn.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ten@trungtam.vn"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Mật khẩu</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              <LogIn size={16} /> {busy ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Tài khoản demo (nhấn để điền)
            </p>
            <div className="grid grid-cols-2 gap-2">
              {seedUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => quickFill(u.email, u.password ?? "")}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-left text-xs hover:border-brand-300 hover:bg-brand-50"
                >
                  <span className="block font-medium text-slate-700">
                    {ROLE_LABELS[u.role]}
                  </span>
                  <span className="block truncate text-slate-400">
                    {u.email}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
