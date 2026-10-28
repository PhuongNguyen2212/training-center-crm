import { describe, it, expect } from "vitest";
import { getSessionRoster } from "@/lib/roster";
import type { Session, Student } from "@/types";

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

function session(studentIds: string[]): Session {
  return {
    id: "ses",
    googleEventId: null,
    title: "Buổi",
    startTime: "2026-06-01T10:00:00Z",
    endTime: "2026-06-01T12:00:00Z",
    teacherId: "t1",
    studentIds,
  };
}

describe("getSessionRoster — danh sách học viên theo buổi", () => {
  const students = [
    student("s1"),
    student("s2"),
    student("s3", { enrollmentStatus: "prospect" }),
  ];

  it("trả về đúng học viên của buổi, giữ thứ tự thêm vào", () => {
    const roster = getSessionRoster(session(["s2", "s1"]), students);
    expect(roster.map((s) => s.id)).toEqual(["s2", "s1"]);
  });

  it("loại học viên đã soft-delete", () => {
    const withDeleted = students.map((s) =>
      s.id === "s1" ? { ...s, deletedAt: "2026-05-01T00:00:00Z" } : s,
    );
    const roster = getSessionRoster(session(["s1", "s2"]), withDeleted);
    expect(roster.map((s) => s.id)).toEqual(["s2"]);
  });

  it("buổi chưa có học viên -> rỗng (KHÔNG fallback sang toàn bộ học viên)", () => {
    expect(getSessionRoster(session([]), students)).toEqual([]);
  });

  it("session null -> rỗng", () => {
    expect(getSessionRoster(null, students)).toEqual([]);
  });
});
