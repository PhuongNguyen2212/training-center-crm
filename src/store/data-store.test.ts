import { describe, it, expect, beforeEach } from "vitest";
import { useDataStore } from "@/store/data-store";

beforeEach(() => {
  localStorage.clear();
  useDataStore.getState().resetData();
});

describe("Điểm danh — append-only / override (bằng chứng tham gia)", () => {
  it("BUG GUARD: sửa điểm danh tạo bản ghi MỚI, KHÔNG sửa bản gốc", () => {
    const s = useDataStore.getState();
    s.markAttendance("s-1", "ses-2", "present", "u-teacher-1");
    s.markAttendance("s-1", "ses-2", "absent", "u-teacher-1");

    const rows = useDataStore
      .getState()
      .attendance.filter((a) => a.studentId === "s-1" && a.sessionId === "ses-2");

    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.isOverride)).toHaveLength(1);
    // Bản ghi gốc vẫn giữ nguyên trạng thái ban đầu.
    const original = rows.find((r) => !r.isOverride)!;
    expect(original.status).toBe("present");
  });

  it("lần điểm danh đầu tiên KHÔNG phải override", () => {
    useDataStore.getState().markAttendance("s-2", "ses-3", "late", "u-teacher-1");
    const row = useDataStore
      .getState()
      .attendance.find((a) => a.studentId === "s-2" && a.sessionId === "ses-3")!;
    expect(row.isOverride).toBe(false);
  });
});

describe("Học viên — soft delete & audit", () => {
  it("xóa học viên là soft delete (giữ dữ liệu, gắn deletedAt)", () => {
    useDataStore.getState().softDeleteStudent("s-1", "u-admin");
    const st = useDataStore.getState().students.find((x) => x.id === "s-1")!;
    expect(st.deletedAt).not.toBeNull();
  });

  it("đổi trạng thái ghi danh sinh audit log student.status_change", () => {
    useDataStore
      .getState()
      .updateStudent("s-3", { enrollmentStatus: "confirmed" }, "u-admin");
    const logs = useDataStore.getState().auditLogs;
    expect(logs.some((l) => l.action === "student.status_change")).toBe(true);
  });
});

describe("Nhân sự (HR) — tạo tài khoản an toàn", () => {
  it("không cho tạo trùng email", async () => {
    const res = await useDataStore.getState().addStaff(
      { name: "Trùng", email: "admin@trungtam.vn", role: "teacher", password: "abcd1234" },
      "u-admin",
    );
    expect(res.ok).toBe(false);
  });

  it("BUG GUARD: tài khoản mới lưu hash, KHÔNG lưu plaintext", async () => {
    await useDataStore.getState().addStaff(
      { name: "GV Mới", email: "moi@trungtam.vn", role: "teacher", password: "abcd1234" },
      "u-admin",
    );
    const u = useDataStore
      .getState()
      .users.find((x) => x.email === "moi@trungtam.vn")!;
    expect(u.passwordHash).toBeTruthy();
    expect(u.salt).toBeTruthy();
    expect(u.password).toBeUndefined();
  });

  it("treo rồi kích hoạt lại cập nhật đúng trạng thái", () => {
    useDataStore.getState().setStaffStatus("u-finance", "suspended", "u-admin");
    expect(
      useDataStore.getState().users.find((u) => u.id === "u-finance")!.status,
    ).toBe("suspended");
    useDataStore.getState().setStaffStatus("u-finance", "active", "u-admin");
    expect(
      useDataStore.getState().users.find((u) => u.id === "u-finance")!.status,
    ).toBe("active");
  });
});

describe("Học viên — thêm mới (store action)", () => {
  it("addStudent tạo học viên với id sinh tự động và ghi audit student.create", async () => {
    const before = useDataStore.getState().students.length;
    await useDataStore.getState().addStudent(
      {
        name: "Đỗ Thị Mai",
        age: 22,
        phone: "0900000000",
        jobTitle: "Sinh viên",
        goal: "IELTS 7.0",
        enrollmentStatus: "prospect",
        cccdNumber: null,
        salespersonId: "u-sales-1",
      },
      "u-admin",
    );
    const students = useDataStore.getState().students;
    expect(students.length).toBe(before + 1);
    const created = students.find((s) => s.name === "Đỗ Thị Mai")!;
    expect(created.id).toBeTruthy();
    expect(created.deletedAt).toBeNull();
    expect(
      useDataStore.getState().auditLogs.some((l) => l.action === "student.create"),
    ).toBe(true);
  });
});

describe("Lớp học — ghi danh / rút học viên", () => {
  it("tạo lớp mới có sĩ số rỗng và trạng thái active", () => {
    useDataStore.getState().addClass(
      { name: "Lớp Mới", courseName: "Khóa X", teacherId: "u-teacher-1" },
      "u-admin",
    );
    const cls = useDataStore.getState().classes.find((c) => c.name === "Lớp Mới")!;
    expect(cls.studentIds).toEqual([]);
    expect(cls.status).toBe("active");
  });

  it("BUG GUARD: ghi danh không tạo trùng học viên trong lớp", () => {
    useDataStore.getState().enrollStudent("lop-ielts-b", "s-1", "u-admin");
    useDataStore.getState().enrollStudent("lop-ielts-b", "s-1", "u-admin");
    const cls = useDataStore.getState().classes.find((c) => c.id === "lop-ielts-b")!;
    expect(cls.studentIds.filter((id) => id === "s-1")).toHaveLength(1);
  });

  it("rút học viên khỏi lớp", () => {
    useDataStore.getState().unenrollStudent("lop-a", "s-1", "u-admin");
    const cls = useDataStore.getState().classes.find((c) => c.id === "lop-a")!;
    expect(cls.studentIds).not.toContain("s-1");
  });

  it("đổi trạng thái lớp ghi audit", () => {
    useDataStore.getState().setClassStatus("lop-toeic-c", "completed", "u-admin");
    expect(
      useDataStore.getState().classes.find((c) => c.id === "lop-toeic-c")!.status,
    ).toBe("completed");
    expect(
      useDataStore.getState().auditLogs.some((l) => l.action === "class.status_change"),
    ).toBe(true);
  });
});

describe("Đồng bộ Google Calendar — gộp theo google_event_id", () => {
  it("upsert: cập nhật sự kiện đã có, thêm sự kiện mới, không nhân đôi", () => {
    const before = useDataStore.getState().sessions.length;
    useDataStore.getState().upsertSessionsFromGoogle(
      [
        // đã tồn tại (gcal-evt-001) -> cập nhật tiêu đề, không tạo mới
        {
          googleEventId: "gcal-evt-001",
          title: "Lớp A - Buổi 12 (đã sửa)",
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          teacherId: "u-teacher-1",
          classId: "lop-a",
        },
        // mới hoàn toàn
        {
          googleEventId: "gcal-evt-new",
          title: "Lớp mới",
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          teacherId: null,
          classId: null,
        },
      ],
      "u-admin",
    );
    const sessions = useDataStore.getState().sessions;
    expect(sessions.filter((s) => s.googleEventId === "gcal-evt-001")).toHaveLength(1);
    expect(sessions.find((s) => s.googleEventId === "gcal-evt-001")!.title).toContain("đã sửa");
    expect(sessions.some((s) => s.googleEventId === "gcal-evt-new")).toBe(true);
    expect(sessions.length).toBe(before + 1);
  });
});
