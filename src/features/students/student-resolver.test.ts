import { describe, it, expect } from "vitest";
import { zodResolver } from "@hookform/resolvers/zod";
import { studentSchema } from "@/features/students/student-schema";

// The schema tests cover the RULES; this file covers the WIRING — that
// react-hook-form's zodResolver still bridges our Zod schema to form errors.
// Type-checking alone does not prove this at runtime, so a major bump of
// @hookform/resolvers (3 -> 5) could silently break form validation without
// any other test noticing.

const resolve = (values: Record<string, unknown>) =>
  zodResolver(studentSchema)(values, undefined, {
    fields: {},
    shouldUseNativeValidation: false,
  });

describe("zodResolver ↔ studentSchema (wiring)", () => {
  it("dữ liệu hợp lệ: không lỗi, trả về values đã parse", async () => {
    const result = await resolve({
      name: "Nguyễn Văn A",
      enrollmentStatus: "prospect",
    });
    expect(result.errors).toEqual({});
    expect((result.values as { name: string }).name).toBe("Nguyễn Văn A");
  });

  it("BUG GUARD: vi phạm quy tắc CCCD phải sinh lỗi ĐÚNG TRƯỜNG cccdNumber", async () => {
    const result = await resolve({
      name: "Nguyễn Văn A",
      enrollmentStatus: "confirmed", // confirmed mà thiếu CCCD
    });
    // Lỗi phải gắn vào đúng field thì UI mới hiển thị được dưới ô nhập.
    expect(result.errors.cccdNumber).toBeDefined();
    expect(result.errors.cccdNumber?.message).toContain("CCCD");
    expect(result.values).toEqual({});
  });

  it("tên quá ngắn sinh lỗi ở field name", async () => {
    const result = await resolve({ name: "A", enrollmentStatus: "prospect" });
    expect(result.errors.name).toBeDefined();
  });
});
