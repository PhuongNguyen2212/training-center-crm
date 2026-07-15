import { useState } from "react";
import { Modal } from "./Modal";
import { useAuthStore } from "@/store/auth-store";
import { useDataStore } from "@/store/data-store";
import { checkPasswordStrength, verifyPassword } from "@/lib/crypto";
import { hasRemoteBackend } from "@/lib/backend";
import { errorMessage } from "@/lib/error";

// Self-service password change. Requires the current password (verified against
// the stored hash or legacy demo plaintext) before setting a new hashed one.
// `forced` blocks dismissal until the password is actually changed — used when
// the account still carries a default/temporary password (mustChangePassword).
export function ChangePasswordModal({
  onClose,
  forced = false,
}: {
  onClose: () => void;
  forced?: boolean;
}) {
  const me = useAuthStore((s) => s.currentUser)!;
  const users = useDataStore((s) => s.users);
  const changeOwnPassword = useDataStore((s) => s.changeOwnPassword);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // In the browser we verify the current password locally; on desktop the
    // backend verifies it server-side (and throws if wrong).
    if (!hasRemoteBackend()) {
      const fresh = users.find((u) => u.id === me.id) ?? me;
      const ok =
        fresh.passwordHash && fresh.salt
          ? await verifyPassword(current, fresh.salt, fresh.passwordHash)
          : fresh.password === current;
      if (!ok) {
        setError("Mật khẩu hiện tại không đúng.");
        return;
      }
    }
    if (!checkPasswordStrength(next).ok) {
      setError("Mật khẩu mới chưa đạt yêu cầu (≥8 ký tự, có chữ và số).");
      return;
    }
    if (next !== confirm) {
      setError("Xác nhận mật khẩu không khớp.");
      return;
    }
    setBusy(true);
    try {
      await changeOwnPassword(me.id, next, current);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // While forced and not yet done, every dismiss path is a no-op.
  const requestClose = () => {
    if (forced && !done) return;
    onClose();
  };

  return (
    <Modal
      open
      title="Đổi mật khẩu"
      onClose={requestClose}
      footer={
        done ? (
          <button className="btn-primary" onClick={onClose}>
            Đóng
          </button>
        ) : (
          <>
            {!forced && (
              <button className="btn-outline" onClick={onClose} disabled={busy}>
                Hủy
              </button>
            )}
            <button
              type="submit"
              form="change-pw-form"
              className="btn-primary"
              disabled={busy}
            >
              {busy ? "Đang lưu..." : "Cập nhật"}
            </button>
          </>
        )
      }
    >
      {done ? (
        <p className="text-sm text-emerald-700">
          Đã đổi mật khẩu thành công. Lần đăng nhập sau hãy dùng mật khẩu mới.
        </p>
      ) : (
        <form id="change-pw-form" onSubmit={submit} className="space-y-4">
          {forced && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Tài khoản đang dùng mật khẩu mặc định/tạm thời. Vì lý do bảo mật,
              bạn phải đặt mật khẩu mới trước khi tiếp tục.
            </p>
          )}
          <div>
            <label className="label">Mật khẩu hiện tại</label>
            <input
              type="password"
              className="input"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="label">Mật khẩu mới</label>
            <input
              type="password"
              className="input"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="label">Xác nhận mật khẩu mới</label>
            <input
              type="password"
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </form>
      )}
    </Modal>
  );
}
