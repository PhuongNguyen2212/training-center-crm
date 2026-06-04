import { useMemo, useRef, useState } from "react";
import {
  FileImage,
  FileText,
  Lock,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { useDataStore } from "@/store/data-store";
import { useAuthStore } from "@/store/auth-store";
import { can } from "@/lib/permissions";
import { formatDate, formatVND } from "@/lib/labels";
import { EmptyState, NoAccess, PageHeader } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { verifyPassword } from "@/lib/crypto";
import type { PaymentDoc } from "@/types";

const MAX_FILE_SIZE_MB = 5;
const ACCEPTED = ["image/jpeg", "image/png", "application/pdf"] as const;

export default function FinancePage() {
  const user = useAuthStore((s) => s.currentUser)!;
  const students = useDataStore((s) => s.students);
  const users = useDataStore((s) => s.users);
  const docs = useDataStore((s) => s.paymentDocs);
  const addPaymentDoc = useDataStore((s) => s.addPaymentDoc);
  const softDeletePaymentDoc = useDataStore((s) => s.softDeletePaymentDoc);

  const canView = can(user.role, "payment.view");
  const canUpload = can(user.role, "payment.upload");
  const canDelete = can(user.role, "payment.delete");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState<PaymentDoc | null>(null);

  const visible = useMemo(
    () =>
      [...docs]
        .filter((d) => !d.deletedAt)
        .sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt)),
    [docs],
  );

  if (!canView) return <NoAccess />;

  const studentName = (id: string) =>
    students.find((s) => s.id === id)?.name ?? "—";
  const uploaderName = (id: string) =>
    users.find((u) => u.id === id)?.name ?? "—";

  const total = visible.reduce((sum, d) => sum + d.amount, 0);

  return (
    <div>
      <PageHeader
        title="Tài chính"
        subtitle="Chứng từ thanh toán (ảnh hoặc PDF) gắn với học viên"
        actions={
          canUpload ? (
            <button className="btn-primary" onClick={() => setUploadOpen(true)}>
              <Plus size={16} /> Tải lên chứng từ
            </button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap gap-4">
        <div className="card flex-1 p-4">
          <p className="text-sm text-slate-500">Tổng chứng từ</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {visible.length}
          </p>
        </div>
        <div className="card flex-1 p-4">
          <p className="text-sm text-slate-500">Tổng giá trị</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatVND(total)}
          </p>
        </div>
      </div>

      {!canUpload && (
        <p className="mb-3 flex items-center gap-1 text-xs text-slate-400">
          <Lock size={12} /> Bạn chỉ có quyền xem chứng từ.
        </p>
      )}

      <div className="card overflow-hidden">
        {visible.length === 0 ? (
          <EmptyState message="Chưa có chứng từ thanh toán." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-3">Tệp</th>
                  <th className="px-4 py-3">Học viên</th>
                  <th className="px-4 py-3">Số tiền</th>
                  <th className="px-4 py-3">Ngày TT</th>
                  <th className="px-4 py-3">Ghi chú</th>
                  <th className="px-4 py-3">Người tải</th>
                  {canDelete && <th className="px-4 py-3 text-right">Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((d) => (
                  <tr
                    key={d.id}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 text-slate-700">
                        {d.fileType === "application/pdf" ? (
                          <FileText size={16} className="text-rose-500" />
                        ) : (
                          <FileImage size={16} className="text-sky-500" />
                        )}
                        <span className="max-w-[160px] truncate">
                          {d.fileName}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {studentName(d.studentId)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {formatVND(d.amount)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(d.paymentDate)}
                    </td>
                    <td className="px-4 py-3 max-w-[180px] truncate text-slate-500">
                      {d.note ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {uploaderName(d.uploadedBy)}
                    </td>
                    {canDelete && (
                      <td className="px-4 py-3 text-right">
                        <button
                          className="btn-ghost p-1.5 text-rose-600 hover:bg-rose-50"
                          onClick={() => setDeleting(d)}
                          title="Xóa (cần xác thực admin)"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {uploadOpen && (
        <UploadForm
          onClose={() => setUploadOpen(false)}
          onSubmit={(data) => {
            addPaymentDoc({ ...data, uploadedBy: user.id }, user.id);
            setUploadOpen(false);
          }}
        />
      )}

      {deleting && (
        <DeleteWithReauth
          doc={deleting}
          studentName={studentName(deleting.studentId)}
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            softDeletePaymentDoc(deleting.id, user.id);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}

function UploadForm({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: {
    studentId: string;
    amount: number;
    paymentDate: string;
    fileName: string;
    fileType: PaymentDoc["fileType"];
    note: string | null;
  }) => void;
}) {
  const students = useDataStore((s) => s.students).filter((s) => !s.deletedAt);
  const fileRef = useRef<HTMLInputElement>(null);
  const [studentId, setStudentId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<{
    name: string;
    type: PaymentDoc["fileType"];
  } | null>(null);
  const [error, setError] = useState("");

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!ACCEPTED.includes(f.type as (typeof ACCEPTED)[number])) {
      setError("Chỉ chấp nhận JPEG, PNG hoặc PDF.");
      return;
    }
    if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`Tệp vượt quá ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }
    setError("");
    setFile({ name: f.name, type: f.type as PaymentDoc["fileType"] });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !amount || !paymentDate || !file) {
      setError("Vui lòng điền đầy đủ và chọn tệp chứng từ.");
      return;
    }
    onSubmit({
      studentId,
      amount: Number(amount),
      paymentDate: new Date(paymentDate).toISOString(),
      fileName: file.name,
      fileType: file.type,
      note: note.trim() || null,
    });
  };

  return (
    <Modal
      open
      title="Tải lên chứng từ thanh toán"
      onClose={onClose}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" form="upload-form" className="btn-primary">
            Tải lên
          </button>
        </>
      }
    >
      <form id="upload-form" onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Học viên *</label>
          <select
            className="input"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          >
            <option value="">— Chọn học viên —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Số tiền (VND) *</label>
            <input
              type="number"
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="6000000"
            />
          </div>
          <div>
            <label className="label">Ngày thanh toán *</label>
            <input
              type="date"
              className="input"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">Ghi chú</label>
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Học phí khóa..."
          />
        </div>
        <div>
          <label className="label">Tệp chứng từ (JPEG/PNG/PDF, ≤ 5MB) *</label>
          <input
            ref={fileRef}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            className="hidden"
            onChange={onPickFile}
          />
          <button
            type="button"
            className="btn-outline w-full"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={16} /> {file ? file.name : "Chọn tệp..."}
          </button>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </form>
    </Modal>
  );
}

// Payment document deletion requires admin re-authentication (CLAUDE.md).
function DeleteWithReauth({
  doc,
  studentName,
  onClose,
  onConfirm,
}: {
  doc: PaymentDoc;
  studentName: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const user = useAuthStore((s) => s.currentUser)!;
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    const ok =
      user.passwordHash && user.salt
        ? await verifyPassword(password, user.salt, user.passwordHash)
        : user.password === password;
    setBusy(false);
    if (!ok) {
      setError("Mật khẩu không đúng.");
      return;
    }
    onConfirm();
  };

  return (
    <Modal
      open
      title="Xác thực để xóa chứng từ"
      onClose={onClose}
      footer={
        <>
          <button className="btn-outline" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button className="btn-danger" onClick={confirm} disabled={busy}>
            {busy ? "Đang xác thực..." : "Xác nhận xóa"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <Lock size={15} /> Xóa chứng từ yêu cầu nhập lại mật khẩu quản trị viên.
        </p>
        <p className="text-sm text-slate-600">
          Chứng từ <strong>{doc.fileName}</strong> của học viên{" "}
          <strong>{studentName}</strong> sẽ được ẩn (soft delete).
        </p>
        <div>
          <label className="label">Mật khẩu quản trị viên</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}
