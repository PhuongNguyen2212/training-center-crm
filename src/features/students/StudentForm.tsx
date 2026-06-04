import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle } from "lucide-react";
import { Modal } from "@/components/Modal";
import { ENROLLMENT_LABELS } from "@/lib/labels";
import type { Student } from "@/types";
import { studentSchema, type StudentFormValues } from "./student-schema";

interface Props {
  open: boolean;
  student: Student | null; // null = create
  onClose: () => void;
  onSubmit: (values: StudentFormValues) => void;
  submitError?: string;
}

export function StudentForm({
  open,
  student,
  onClose,
  onSubmit,
  submitError,
}: Props) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<StudentFormValues>({
    resolver: zodResolver(studentSchema),
    defaultValues: {
      name: student?.name ?? "",
      age: student?.age ?? ("" as unknown as number),
      phone: student?.phone ?? "",
      jobTitle: student?.jobTitle ?? "",
      goal: student?.goal ?? "",
      enrollmentStatus: student?.enrollmentStatus ?? "prospect",
      cccdNumber: student?.cccdNumber ?? "",
    },
  });

  const status = watch("enrollmentStatus");
  const cccdRequired = status === "confirmed";

  return (
    <Modal
      open={open}
      title={student ? "Sửa thông tin học viên" : "Thêm học viên"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" form="student-form" className="btn-primary">
            Lưu
          </button>
        </>
      }
    >
      <form
        id="student-form"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <div>
          <label className="label">Họ và tên *</label>
          <input className="input" {...register("name")} />
          {errors.name && (
            <p className="mt-1 text-xs text-rose-600">{errors.name.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Tuổi</label>
            <input className="input" type="number" {...register("age")} />
          </div>
          <div>
            <label className="label">Số điện thoại</label>
            <input className="input" {...register("phone")} placeholder="0901234567" />
            {errors.phone && (
              <p className="mt-1 text-xs text-rose-600">{errors.phone.message}</p>
            )}
          </div>
        </div>

        <div>
          <label className="label">Vị trí công việc</label>
          <input className="input" {...register("jobTitle")} />
        </div>

        <div>
          <label className="label">Nguyện vọng</label>
          <textarea className="input" rows={2} {...register("goal")} />
        </div>

        <div>
          <label className="label">Trạng thái</label>
          <select className="input" {...register("enrollmentStatus")}>
            {(["prospect", "confirmed", "dropped"] as const).map((v) => (
              <option key={v} value={v}>
                {ENROLLMENT_LABELS[v]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">
            Số CCCD {cccdRequired && <span className="text-rose-600">*</span>}
          </label>
          <input
            className="input"
            {...register("cccdNumber")}
            placeholder="12 chữ số"
            inputMode="numeric"
            maxLength={12}
          />
          {cccdRequired && (
            <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
              <AlertCircle size={13} />
              Học viên xác nhận theo học bắt buộc cung cấp CCCD (12 chữ số).
            </p>
          )}
          {errors.cccdNumber && (
            <p className="mt-1 text-xs text-rose-600">
              {errors.cccdNumber.message}
            </p>
          )}
        </div>

        {submitError && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {submitError}
          </p>
        )}
      </form>
    </Modal>
  );
}
