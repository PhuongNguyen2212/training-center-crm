import { useMemo, useState } from "react";
import { Download, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useDataStore } from "@/store/data-store";
import { useAuthStore } from "@/store/auth-store";
import { can } from "@/lib/permissions";
import {
  ENROLLMENT_BADGE,
  ENROLLMENT_LABELS,
  formatDate,
} from "@/lib/labels";
import { exportCsv, dateStamp, type CsvColumn } from "@/lib/csv";
import { errorMessage } from "@/lib/error";
import { Badge, EmptyState, NoAccess, PageHeader } from "@/components/ui";
import { Modal } from "@/components/Modal";
import type { EnrollmentStatus, Student } from "@/types";
import { StudentForm } from "./StudentForm";
import type { StudentFormValues } from "./student-schema";

export default function StudentsPage() {
  const user = useAuthStore((s) => s.currentUser)!;
  const allStudents = useDataStore((s) => s.students);
  const addStudent = useDataStore((s) => s.addStudent);
  const updateStudent = useDataStore((s) => s.updateStudent);
  const softDeleteStudent = useDataStore((s) => s.softDeleteStudent);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EnrollmentStatus | "all">(
    "all",
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState<Student | null>(null);
  const [submitError, setSubmitError] = useState("");

  const canView = can(user.role, "students.view");
  const canEdit = can(user.role, "students.edit");
  const isSalesperson = user.role === "salesperson";

  const students = useMemo(() => {
    return allStudents
      .filter((s) => !s.deletedAt)
      // Salesperson sees only their own referrals ("own" scoping).
      .filter((s) => (isSalesperson ? s.salespersonId === user.id : true))
      .filter((s) =>
        statusFilter === "all" ? true : s.enrollmentStatus === statusFilter,
      )
      .filter((s) =>
        search.trim()
          ? s.name.toLowerCase().includes(search.toLowerCase()) ||
            (s.phone ?? "").includes(search)
          : true,
      )
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [allStudents, statusFilter, search, isSalesperson, user.id]);

  if (!canView) return <NoAccess />;

  const exportStudents = () => {
    const columns: CsvColumn<Student>[] = [
      { header: "Họ và tên", value: (s) => s.name },
      { header: "Tuổi", value: (s) => s.age },
      { header: "Điện thoại", value: (s) => s.phone },
      { header: "Vị trí công việc", value: (s) => s.jobTitle },
      { header: "Nguyện vọng", value: (s) => s.goal },
      {
        header: "Trạng thái",
        value: (s) => ENROLLMENT_LABELS[s.enrollmentStatus],
      },
      { header: "CCCD", value: (s) => s.cccdNumber },
      { header: "Ngày tạo", value: (s) => formatDate(s.createdAt) },
    ];
    exportCsv(`hoc-vien-${dateStamp()}.csv`, students, columns);
  };

  const openCreate = () => {
    setEditing(null);
    setSubmitError("");
    setFormOpen(true);
  };
  const openEdit = (s: Student) => {
    setEditing(s);
    setSubmitError("");
    setFormOpen(true);
  };

  const handleSubmit = async (values: StudentFormValues) => {
    setSubmitError("");
    const normalized = {
      name: values.name,
      age: values.age ? Number(values.age) : null,
      phone: values.phone || null,
      jobTitle: values.jobTitle || null,
      goal: values.goal || null,
      enrollmentStatus: values.enrollmentStatus,
      cccdNumber: values.cccdNumber || null,
    };
    try {
      if (editing) {
        await updateStudent(editing.id, normalized, user.id);
      } else {
        // Only attribute the referral when the creator is a salesperson; an
        // admin creating a student shouldn't be counted as the referrer.
        const salespersonId = user.role === "salesperson" ? user.id : null;
        await addStudent({ ...normalized, salespersonId }, user.id);
      }
      setFormOpen(false);
    } catch (e) {
      setSubmitError(errorMessage(e));
    }
  };

  return (
    <div>
      <PageHeader
        title="Quản lý học viên"
        subtitle="Thông tin học viên, trạng thái ghi danh và CCCD"
        actions={
          <div className="flex gap-2">
            <button
              className="btn-outline"
              onClick={exportStudents}
              disabled={students.length === 0}
              title="Xuất danh sách đang hiển thị ra CSV"
            >
              <Download size={16} /> Xuất CSV
            </button>
            {canEdit && (
              <button className="btn-primary" onClick={openCreate}>
                <Plus size={16} /> Thêm học viên
              </button>
            )}
          </div>
        }
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input pl-9"
            placeholder="Tìm theo tên hoặc số điện thoại..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input w-48"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as EnrollmentStatus | "all")
          }
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="prospect">Tiềm năng</option>
          <option value="confirmed">Đã xác nhận</option>
          <option value="dropped">Đã nghỉ</option>
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {students.length === 0 ? (
          <EmptyState message="Chưa có học viên nào." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-3">Họ và tên</th>
                  <th className="px-4 py-3">Tuổi</th>
                  <th className="px-4 py-3">Điện thoại</th>
                  <th className="px-4 py-3">Nguyện vọng</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">CCCD</th>
                  <th className="px-4 py-3">Ngày tạo</th>
                  {canEdit && <th className="px-4 py-3 text-right">Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr
                    key={s.id}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {s.name}
                      <span className="block text-xs font-normal text-slate-400">
                        {s.jobTitle}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.age ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{s.phone ?? "—"}</td>
                    <td className="px-4 py-3 max-w-[200px] truncate text-slate-600">
                      {s.goal ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={ENROLLMENT_BADGE[s.enrollmentStatus]}>
                        {ENROLLMENT_LABELS[s.enrollmentStatus]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {s.cccdNumber ? (
                        <code className="text-xs">{s.cccdNumber}</code>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(s.createdAt)}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            className="btn-ghost p-1.5"
                            onClick={() => openEdit(s)}
                            title="Sửa"
                          >
                            <Pencil size={15} />
                          </button>
                          {user.role === "admin" && (
                            <button
                              className="btn-ghost p-1.5 text-rose-600 hover:bg-rose-50"
                              onClick={() => setDeleting(s)}
                              title="Ẩn (soft delete)"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <StudentForm
          open={formOpen}
          student={editing}
          onClose={() => setFormOpen(false)}
          onSubmit={handleSubmit}
          submitError={submitError}
        />
      )}

      {/* Soft-delete confirm */}
      <Modal
        open={Boolean(deleting)}
        title="Ẩn học viên"
        onClose={() => setDeleting(null)}
        footer={
          <>
            <button className="btn-outline" onClick={() => setDeleting(null)}>
              Hủy
            </button>
            <button
              className="btn-danger"
              onClick={async () => {
                if (deleting) await softDeleteStudent(deleting.id, user.id);
                setDeleting(null);
              }}
            >
              Xác nhận ẩn
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Học viên <strong>{deleting?.name}</strong> sẽ được ẩn (soft delete) —
          dữ liệu vẫn được lưu để đảm bảo lịch sử, không bị xóa vĩnh viễn.
        </p>
      </Modal>
    </div>
  );
}
