import { describe, it, expect } from "vitest";
import { can, type Capability } from "@/lib/permissions";

const ALL: Capability[] = [
  "schedule.view",
  "schedule.edit",
  "students.view",
  "students.edit",
  "attendance.mark",
  "attendance.view",
  "payment.upload",
  "payment.edit",
  "payment.view",
  "payment.delete",
  "homework.record",
  "sales.view",
  "users.manage",
];

describe("Ma trận phân quyền (CLAUDE.md)", () => {
  it("admin có toàn bộ quyền", () => {
    for (const cap of ALL) expect(can("admin", cap)).toBe(true);
  });

  it("nhân viên tư vấn KHÔNG truy cập điểm danh và KPI bài tập", () => {
    expect(can("salesperson", "attendance.view")).toBe(false);
    expect(can("salesperson", "attendance.mark")).toBe(false);
    expect(can("salesperson", "homework.record")).toBe(false);
  });

  it("giáo viên xem được lịch nhưng KHÔNG sửa lịch", () => {
    expect(can("teacher", "schedule.view")).toBe(true);
    expect(can("teacher", "schedule.edit")).toBe(false);
  });

  it("chỉ admin được xóa chứng từ thanh toán", () => {
    expect(can("admin", "payment.delete")).toBe(true);
    expect(can("finance_staff", "payment.delete")).toBe(false);
    expect(can("salesperson", "payment.delete")).toBe(false);
  });

  it("nhân viên tài chính: upload/sửa được, KHÔNG xóa", () => {
    expect(can("finance_staff", "payment.upload")).toBe(true);
    expect(can("finance_staff", "payment.edit")).toBe(true);
    expect(can("finance_staff", "payment.delete")).toBe(false);
  });

  it("nhân viên tư vấn chỉ XEM chứng từ (không upload/sửa/xóa)", () => {
    expect(can("salesperson", "payment.view")).toBe(true);
    expect(can("salesperson", "payment.upload")).toBe(false);
    expect(can("salesperson", "payment.edit")).toBe(false);
  });

  it("chỉ admin quản lý nhân sự", () => {
    expect(can("admin", "users.manage")).toBe(true);
    expect(can("teacher", "users.manage")).toBe(false);
    expect(can("salesperson", "users.manage")).toBe(false);
    expect(can("finance_staff", "users.manage")).toBe(false);
  });
});
