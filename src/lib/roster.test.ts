import { describe, it, expect } from "vitest";
import { getSessionRoster } from "@/lib/roster";
import type { Class, Session, Student } from "@/types";

function student(id: string, over: Partial<Student> = {}): Student {
  return {
    id,
    name: `HV ${id}`,
    age: null,
    phone: null,
    jobTitle: null,
    goal: null,
    enrollmentStatus: "confirmed",
    cccdNumber: null,
    salespersonId: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    ...over,
  };
}

const cls: Class = {
  id: "lop-a",
  name: "Lớp A",
  courseName: "Giao tiếp",
  teacherId: "t1",
  studentIds: ["s2", "s1"], // thứ tự ghi danh cố ý đảo
  status: "active",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function session(classId: string | null): Session {
  return {
    id: "ses",
    googleEventId: null,
    title: "Buổi",
    startTime: "2026-06-01T10:00:00Z",
    endTime: "2026-06-01T12:00:00Z",
    teacherId: "t1",
    classId,
  };
}

describe("getSessionRoster — sĩ số theo lớp", () => {
  const students = [
    student("s1"),
    student("s2"),
    student("s3", { enrollmentStatus: "prospect" }),
  ];

  it("trả về đúng học viên đã ghi danh, giữ thứ tự ghi danh", () => {
    const roster = getSessionRoster(session("lop-a"), [cls], students);
    expect(roster.map((s) => s.id)).toEqual(["s2", "s1"]);
  });

  it("loại học viên đã soft-delete khỏi sĩ số", () => {
    const withDeleted = students.map((s) =>
      s.id === "s1" ? { ...s, deletedAt: "2026-05-01T00:00:00Z" } : s,
    );
    const roster = getSessionRoster(session("lop-a"), [cls], withDeleted);
    expect(roster.map((s) => s.id)).toEqual(["s2"]);
  });

  it("buổi không gắn lớp -> fallback về học viên đã xác nhận", () => {
    const roster = getSessionRoster(session(null), [cls], students);
    expect(roster.map((s) => s.id).sort()).toEqual(["s1", "s2"]);
    expect(roster.some((s) => s.id === "s3")).toBe(false); // prospect bị loại
  });

  it("session null -> rỗng", () => {
    expect(getSessionRoster(null, [cls], students)).toEqual([]);
  });
});
