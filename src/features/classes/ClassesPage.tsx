import { useMemo, useState } from "react";
import {
  CalendarDays,
  GraduationCap,
  Pencil,
  Plus,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { useDataStore } from "@/store/data-store";
import { useAuthStore } from "@/store/auth-store";
import { notify, toastError } from "@/store/toast-store";
import { can } from "@/lib/permissions";
import {
  CLASS_STATUS_BADGE,
  CLASS_STATUS_LABELS,
  ENROLLMENT_BADGE,
  ENROLLMENT_LABELS,
  formatDate,
  formatTime,
} from "@/lib/labels";
import { Badge, EmptyState, NoAccess, PageHeader } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { seedUsers } from "@/data/seed";
import type { Class, ClassStatus } from "@/types";

const teachers = seedUsers.filter((u) => u.role === "teacher");
const STATUSES: ClassStatus[] = ["active", "completed", "archived"];

export default function ClassesPage() {
  const user = useAuthStore((s) => s.currentUser)!;
  const classes = useDataStore((s) => s.classes);
  const students = useDataStore((s) => s.students);
  const sessions = useDataStore((s) => s.sessions);
  const addClass = useDataStore((s) => s.addClass);
  const updateClass = useDataStore((s) => s.updateClass);
  const enrollStudent = useDataStore((s) => s.enrollStudent);
  const unenrollStudent = useDataStore((s) => s.unenrollStudent);
  const setClassStatus = useDataStore((s) => s.setClassStatus);
  const deleteClass = useDataStore((s) => s.deleteClass);

  const canView = can(user.role, "classes.view");
  const canEdit = can(user.role, "classes.edit"); // admin: create/status/enroll
  // Teachers may edit info of their OWN classes (visible already scopes to own).
  const canEditInfo = canEdit || user.role === "teacher";

  const visible = useMemo(
    () =>
      classes.filter((c) =>
        user.role === "teacher" ? c.teacherId === user.id : true,
      ),
    [classes, user.role, user.id],
  );

  const [selectedId, setSelectedId] = useState<string | null>(
    visible[0]?.id ?? null,
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Class | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [deletingClass, setDeletingClass] = useState<Class | null>(null);

  if (!canView) return <NoAccess />;

  const selected =
    visible.find((c) => c.id === selectedId) ?? visible[0] ?? null;

  const teacherName = (id: string | null) =>
    teachers.find((t) => t.id === id)?.name ?? "Chưa phân công";

  const rosterStudents = (cls: Class) =>
    cls.studentIds
      .map((id) => students.find((s) => s.id === id && !s.deletedAt))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const classSessions = (cls: Class) =>
    sessions
      .filter((s) => s.classId === cls.id)
      .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));

  const enrollable = selected
    ? students.filter(
        (s) => !s.deletedAt && !selected.studentIds.includes(s.id),
      )
    : [];

  return (
    <div>
      <PageHeader
        title="Quản lý lớp học"
        subtitle="Lớp, giáo viên phụ trách, sĩ số ghi danh và buổi học"
        actions={
          canEdit ? (
            <button
              className="btn-primary"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus size={16} /> Tạo lớp
            </button>
          ) : undefined
        }
      />

      {visible.length === 0 ? (
        <div className="card">
          <EmptyState message="Chưa có lớp học nào." />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* Class list */}
          <div className="space-y-2">
            {visible.map((c) => {
              const count = c.studentIds.filter((id) =>
                students.some((s) => s.id === id && !s.deletedAt),
              ).length;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`card w-full p-4 text-left transition ${
                    selected?.id === c.id
                      ? "ring-2 ring-brand-400"
                      : "hover:border-brand-200"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-slate-800">{c.name}</p>
                      <p className="text-xs text-slate-400">{c.courseName}</p>
                    </div>
                    <Badge className={CLASS_STATUS_BADGE[c.status]}>
                      {CLASS_STATUS_LABELS[c.status]}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Users size={13} /> {count} học viên
                    </span>
                    <span className="flex items-center gap-1">
                      <GraduationCap size={13} /> {teacherName(c.teacherId)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail */}
          {selected && (
            <div className="space-y-6">
              <div className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800">
                      {selected.name}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {selected.courseName} · GV: {teacherName(selected.teacherId)}
                    </p>
                  </div>
                  {canEditInfo && (
                    <div className="flex items-center gap-2">
                      {canEdit && (
                        <select
                          className="input w-40"
                          value={selected.status}
                          onChange={(e) =>
                            notify(
                              setClassStatus(
                                selected.id,
                                e.target.value as ClassStatus,
                                user.id,
                              ),
                            )
                          }
                        >
                          {STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {CLASS_STATUS_LABELS[st]}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        className="btn-outline"
                        onClick={() => {
                          setEditing(selected);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil size={15} /> Sửa
                      </button>
                      {canEdit && (
                        <button
                          className="btn-outline text-rose-600 hover:bg-rose-50"
                          onClick={() => setDeletingClass(selected)}
                        >
                          <Trash2 size={15} /> Xóa
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Roster */}
              <div className="card p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800">
                    <Users size={17} className="text-brand-500" /> Sĩ số lớp (
                    {rosterStudents(selected).length})
                  </h3>
                  {canEdit && (
                    <button
                      className="btn-outline"
                      onClick={() => setEnrollOpen(true)}
                    >
                      <UserPlus size={15} /> Ghi danh
                    </button>
                  )}
                </div>
                {rosterStudents(selected).length === 0 ? (
                  <EmptyState message="Lớp chưa có học viên." />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {rosterStudents(selected).map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between py-2"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                            {s.name.charAt(0)}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-slate-800">
                              {s.name}
                            </p>
                            <p className="text-xs text-slate-400">{s.phone}</p>
                          </div>
                          <Badge className={ENROLLMENT_BADGE[s.enrollmentStatus]}>
                            {ENROLLMENT_LABELS[s.enrollmentStatus]}
                          </Badge>
                        </div>
                        {canEdit && (
                          <button
                            className="btn-ghost p-1.5 text-rose-600 hover:bg-rose-50"
                            title="Rút khỏi lớp"
                            onClick={() =>
                              notify(unenrollStudent(selected.id, s.id, user.id))
                            }
                          >
                            <UserMinus size={15} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Sessions */}
              <div className="card p-5">
                <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-800">
                  <CalendarDays size={17} className="text-brand-500" /> Buổi học (
                  {classSessions(selected).length})
                </h3>
                {classSessions(selected).length === 0 ? (
                  <p className="text-sm text-slate-400">
                    Chưa có buổi học gắn với lớp này.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {classSessions(selected).map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-slate-700">
                          {s.title}
                        </span>
                        <span className="text-xs text-slate-400">
                          {formatDate(s.startTime)} · {formatTime(s.startTime)}–
                          {formatTime(s.endTime)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {formOpen && (
        <ClassForm
          cls={editing}
          canAssignTeacher={user.role === "admin"}
          onClose={() => setFormOpen(false)}
          onSubmit={(data) => {
            if (editing) notify(updateClass(editing.id, data, user.id));
            else notify(addClass(data, user.id));
            setFormOpen(false);
          }}
        />
      )}

      {enrollOpen && selected && (
        <EnrollModal
          enrollable={enrollable}
          onClose={() => setEnrollOpen(false)}
          onEnroll={(studentId) =>
            notify(enrollStudent(selected.id, studentId, user.id))
          }
        />
      )}

      <Modal
        open={Boolean(deletingClass)}
        title="Xóa lớp học"
        onClose={() => setDeletingClass(null)}
        footer={
          <>
            <button className="btn-outline" onClick={() => setDeletingClass(null)}>
              Hủy
            </button>
            <button
              className="btn-danger"
              onClick={async () => {
                if (deletingClass) {
                  try {
                    await deleteClass(deletingClass.id, user.id);
                    setSelectedId(null);
                  } catch (e) {
                    toastError(e);
                  }
                }
                setDeletingClass(null);
              }}
            >
              Xác nhận xóa
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Xóa lớp <strong>{deletingClass?.name}</strong>? Lớp và danh sách ghi
          danh sẽ bị xóa vĩnh viễn. Các buổi học của lớp được giữ lại nhưng gỡ
          liên kết. Thao tác không thể hoàn tác.
        </p>
      </Modal>
    </div>
  );
}

function ClassForm({
  cls,
  canAssignTeacher,
  onClose,
  onSubmit,
}: {
  cls: Class | null;
  canAssignTeacher: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    courseName: string;
    teacherId: string | null;
  }) => void;
}) {
  const [name, setName] = useState(cls?.name ?? "");
  const [courseName, setCourseName] = useState(cls?.courseName ?? "");
  const [teacherId, setTeacherId] = useState(cls?.teacherId ?? "");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !courseName.trim()) {
      setError("Vui lòng nhập tên lớp và khóa học.");
      return;
    }
    onSubmit({ name, courseName, teacherId: teacherId || null });
  };

  return (
    <Modal
      open
      title={cls ? "Sửa lớp học" : "Tạo lớp học"}
      onClose={onClose}
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" form="class-form" className="btn-primary">
            Lưu
          </button>
        </>
      }
    >
      <form id="class-form" onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Tên lớp *</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Lớp Giao tiếp A"
          />
        </div>
        <div>
          <label className="label">Khóa học *</label>
          <input
            className="input"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            placeholder="Giao tiếp tiếng Anh"
          />
        </div>
        {canAssignTeacher && (
          <div>
            <label className="label">Giáo viên phụ trách</label>
            <select
              className="input"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
            >
              <option value="">— Chọn giáo viên —</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </form>
    </Modal>
  );
}

function EnrollModal({
  enrollable,
  onClose,
  onEnroll,
}: {
  enrollable: { id: string; name: string; enrollmentStatus: string }[];
  onClose: () => void;
  onEnroll: (studentId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const list = enrollable.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Modal open title="Ghi danh học viên vào lớp" onClose={onClose}>
      <input
        className="input mb-3"
        placeholder="Tìm học viên..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          Không có học viên phù hợp.
        </p>
      ) : (
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
          {list.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-700">{s.name}</span>
              <button
                className="btn-outline px-2 py-1 text-xs"
                onClick={() => onEnroll(s.id)}
              >
                <UserPlus size={13} /> Ghi danh
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
