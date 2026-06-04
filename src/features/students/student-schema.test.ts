import { describe, it, expect } from "vitest";
import { studentSchema } from "@/features/students/student-schema";

const base = { name: "Nguyễn Văn A", enrollmentStatus: "prospect" as const };

describe("Quy tắc CCCD khi xác nhận học (business rule chính)", () => {
  it("học viên tiềm năng (prospect) không bắt buộc CCCD", () => {
    expect(studentSchema.safeParse(base).success).toBe(true);
  });

  it("BUG GUARD: confirmed mà thiếu CCCD phải bị từ chối", () => {
    const r = studentSchema.safeParse({
      ...base,
      enrollmentStatus: "confirmed",
    });
    expect(r.success).toBe(false);
  });

  it("confirmed với CCCD đúng 12 chữ số là hợp lệ", () => {
    const r = studentSchema.safeParse({
      ...base,
      enrollmentStatus: "confirmed",
      cccdNumber: "012345678901",
    });
    expect(r.success).toBe(true);
  });

  it("CCCD 11 chữ số bị từ chối", () => {
    const r = studentSchema.safeParse({
      ...base,
      enrollmentStatus: "confirmed",
      cccdNumber: "01234567890",
    });
    expect(r.success).toBe(false);
  });

  it("CCCD chứa chữ cái bị từ chối", () => {
    const r = studentSchema.safeParse({
      ...base,
      enrollmentStatus: "confirmed",
      cccdNumber: "01234567890x",
    });
    expect(r.success).toBe(false);
  });

  it("tên quá ngắn bị từ chối", () => {
    expect(studentSchema.safeParse({ ...base, name: "A" }).success).toBe(false);
  });

  it("số điện thoại sai định dạng bị từ chối", () => {
    expect(
      studentSchema.safeParse({ ...base, phone: "123" }).success,
    ).toBe(false);
  });

  it("số điện thoại hợp lệ (0 + 9-10 số) được chấp nhận", () => {
    expect(
      studentSchema.safeParse({ ...base, phone: "0901234567" }).success,
    ).toBe(true);
  });
});
