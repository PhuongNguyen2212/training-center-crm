import { useState } from "react";
import {
  DatabaseBackup,
  KeyRound,
  Pencil,
  Plus,
  ShieldBan,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import { useDataStore } from "@/store/data-store";
import { useAuthStore } from "@/store/auth-store";
import { can } from "@/lib/permissions";
import { ROLE_LABELS, USER_STATUS_LABELS, formatDate } from "@/lib/labels";
import { Badge, EmptyState, NoAccess, PageHeader } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { checkPasswordStrength } from "@/lib/crypto";
import { errorMessage } from "@/lib/error";
import { notify } from "@/store/toast-store";
import type { Role, User } from "@/types";

const ROLES: Role[] = ["admin", "teacher", "salesperson", "finance_staff"];

function PasswordField({
  value,
  onChange,
  label = "Mật khẩu",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const strength = checkPasswordStrength(value);
  const bars = ["bg-rose-400", "bg-amber-400", "bg-amber-400", "bg-emerald-500"];
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="password"
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
      />
      {value && (
        <>
          <div className="mt-1.5 flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  i < strength.score ? bars[strength.score - 1] : "bg-slate-200"
                }`}
              />
            ))}
          </div>
          {!strength.ok && (
            <p className="mt-1 text-xs text-rose-600">
              {strength.issues.join(" · ")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function StaffPage() {
  const me = useAuthStore((s) => s.currentUser)!;
  const users = useDataStore((s) => s.users);
  const addStaff = useDataStore((s) => s.addStaff);
  const updateStaff = useDataStore((s) => s.updateStaff);
  const setStaffStatus = useDataStore((s) => s.setStaffStatus);
  const resetStaffPassword = useDataStore((s) => s.resetStaffPassword);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);

  if (!can(me.role, "users.manage")) return <NoAccess />;

  return (
    <div>
      <PageHeader
        title="Quản lý nhân sự"
        subtitle="Tài khoản nhân viên, phân quyền và trạng thái truy cập"
        actions={
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> Thêm nhân viên
          </button>
        }
      />

      <div className="card overflow-hidden">
        {users.length === 0 ? (
          <EmptyState message="Chưa có tài khoản nào." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-3">Họ và tên</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Vai trò</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Ngày tạo</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === me.id;
                  return (
                    <tr
                      key={u.id}
                      className="border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {u.name}
                        {isSelf && (
                          <span className="ml-2 text-xs text-brand-500">(bạn)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{u.email}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {ROLE_LABELS[u.role]}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          className={
                            u.status === "active"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800"
                          }
                        >
                          {USER_STATUS_LABELS[u.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatDate(u.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            className="btn-ghost p-1.5"
                            title="Sửa vai trò"
                            onClick={() => setEditing(u)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="btn-ghost p-1.5"
                            title="Đặt lại mật khẩu"
                            onClick={() => setResetting(u)}
                          >
                            <KeyRound size={15} />
                          </button>
                          {/* Can't suspend yourself — prevents self-lockout. */}
                          {!isSelf &&
                            (u.status === "active" ? (
                              <button
                                className="btn-ghost p-1.5 text-rose-600 hover:bg-rose-50"
                                title="Treo tài khoản"
                                onClick={() =>
                                  notify(setStaffStatus(u.id, "suspended", me.id))
                                }
                              >
                                <ShieldBan size={15} />
                              </button>
                            ) : (
                              <button
                                className="btn-ghost p-1.5 text-emerald-600 hover:bg-emerald-50"
                                title="Kích hoạt lại"
                                onClick={() =>
                                  notify(setStaffStatus(u.id, "active", me.id))
                                }
                              >
                                <ShieldCheck size={15} />
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BackupRestore />

      {createOpen && (
        <CreateStaff
          onClose={() => setCreateOpen(false)}
          onSubmit={async (data) => {
            const res = await addStaff(data, me.id);
            return res;
          }}
        />
      )}

      {editing && (
        <EditRole
          user={editing}
          onClose={() => setEditing(null)}
          onSubmit={(role) => {
            notify(updateStaff(editing.id, { role }, me.id));
            setEditing(null);
          }}
        />
      )}

      {resetting && (
        <ResetPassword
          user={resetting}
          onClose={() => setResetting(null)}
          onSubmit={async (pw) => {
            await resetStaffPassword(resetting.id, pw, me.id);
            setResetting(null);
          }}
        />
      )}
    </div>
  );
}

function CreateStaff({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    email: string;
    role: Role;
    password: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("teacher");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError("Vui lòng nhập tên và email.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Email không hợp lệ.");
      return;
    }
    if (!checkPasswordStrength(password).ok) {
      setError("Mật khẩu chưa đạt yêu cầu tối thiểu.");
      return;
    }
    setBusy(true);
    const res = await onSubmit({ name, email, role, password });
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Không tạo được tài khoản.");
    else onClose();
  };

  return (
    <Modal
      open
      title="Thêm nhân viên"
      onClose={onClose}
      footer={
        <>
          <button className="btn-outline" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button
            type="submit"
            form="staff-form"
            className="btn-primary"
            disabled={busy}
          >
            {busy ? "Đang tạo..." : "Tạo tài khoản"}
          </button>
        </>
      }
    >
      <form id="staff-form" onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Họ và tên *</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Email *</label>
          <input
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ten@trungtam.vn"
          />
        </div>
        <div>
          <label className="label">Vai trò *</label>
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <PasswordField value={password} onChange={setPassword} />
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </form>
    </Modal>
  );
}

function EditRole({
  user,
  onClose,
  onSubmit,
}: {
  user: User;
  onClose: () => void;
  onSubmit: (role: Role) => void;
}) {
  const [role, setRole] = useState<Role>(user.role);
  return (
    <Modal
      open
      title={`Phân quyền — ${user.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button className="btn-primary" onClick={() => onSubmit(role)}>
            <UserCog size={16} /> Lưu vai trò
          </button>
        </>
      }
    >
      <label className="label">Vai trò</label>
      <select
        className="input"
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
    </Modal>
  );
}

function ResetPassword({
  user,
  onClose,
  onSubmit,
}: {
  user: User;
  onClose: () => void;
  onSubmit: (pw: string) => Promise<void>;
}) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!checkPasswordStrength(pw).ok) {
      setError("Mật khẩu chưa đạt yêu cầu tối thiểu.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit(pw);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={`Đặt lại mật khẩu — ${user.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-outline" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? "Đang lưu..." : "Đặt lại"}
          </button>
        </>
      }
    >
      <PasswordField value={pw} onChange={setPw} label="Mật khẩu mới" />
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </Modal>
  );
}

// Informational card: backups are fully automated (nightly GitHub Actions cron
// dumps Turso to R2 — see docs/backup.md). Nothing to click here by design.
function BackupRestore() {
  return (
    <div className="card mt-6 p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
        <DatabaseBackup size={18} /> Sao lưu dữ liệu
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        Dữ liệu được <strong>tự động sao lưu mỗi đêm (2:00)</strong> lên kho lưu
        trữ riêng (Cloudflare R2), tách khỏi máy chủ dữ liệu chính. Không cần
        thao tác thủ công. Quy trình khôi phục: xem <code>docs/backup.md</code>{" "}
        trong mã nguồn.
      </p>
    </div>
  );
}
