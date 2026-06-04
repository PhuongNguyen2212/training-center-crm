// Seed data for the presentation prototype. Realistic Vietnamese content so the
// demo looks like a real training center. Dates are generated relative to "now"
// so the schedule/attendance always have current sessions to show.

import type {
  Attendance,
  AuditLog,
  Class,
  Homework,
  PaymentDoc,
  Session,
  Student,
  User,
} from "@/types";

const now = new Date();

// Build an ISO datetime for a day offset from today at a given hour.
function at(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function daysAgo(n: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export const seedUsers: User[] = [
  {
    id: "u-admin",
    name: "Nguyễn Thị Lan",
    email: "admin@trungtam.vn",
    role: "admin",
    status: "active",
    password: "admin123",
    createdAt: daysAgo(400),
  },
  {
    id: "u-teacher-1",
    name: "Trần Văn Minh",
    email: "minh.gv@trungtam.vn",
    role: "teacher",
    status: "active",
    password: "teacher123",
    createdAt: daysAgo(300),
  },
  {
    id: "u-teacher-2",
    name: "Lê Thu Hà",
    email: "ha.gv@trungtam.vn",
    role: "teacher",
    status: "active",
    password: "teacher123",
    createdAt: daysAgo(250),
  },
  {
    id: "u-sales-1",
    name: "Phạm Quốc Bảo",
    email: "bao.tv@trungtam.vn",
    role: "salesperson",
    status: "active",
    password: "sales123",
    createdAt: daysAgo(200),
  },
  {
    id: "u-finance",
    name: "Đỗ Mỹ Linh",
    email: "linh.tc@trungtam.vn",
    role: "finance_staff",
    status: "active",
    password: "finance123",
    createdAt: daysAgo(180),
  },
];

export const seedStudents: Student[] = [
  {
    id: "s-1",
    name: "Hoàng Anh Tuấn",
    age: 24,
    phone: "0901234567",
    jobTitle: "Nhân viên văn phòng",
    goal: "Giao tiếp tiếng Anh công việc",
    enrollmentStatus: "confirmed",
    cccdNumber: "012345678901",
    salespersonId: "u-sales-1",
    createdAt: daysAgo(120),
    updatedAt: daysAgo(110),
    deletedAt: null,
  },
  {
    id: "s-2",
    name: "Vũ Thị Ngọc Mai",
    age: 19,
    phone: "0912345678",
    jobTitle: "Sinh viên",
    goal: "Luyện thi IELTS 6.5",
    enrollmentStatus: "confirmed",
    cccdNumber: "012345678902",
    salespersonId: "u-sales-1",
    createdAt: daysAgo(95),
    updatedAt: daysAgo(20),
    deletedAt: null,
  },
  {
    id: "s-3",
    name: "Đặng Hữu Phước",
    age: 31,
    phone: "0923456789",
    jobTitle: "Kỹ sư phần mềm",
    goal: "Tiếng Anh phỏng vấn công ty nước ngoài",
    enrollmentStatus: "prospect",
    cccdNumber: null,
    salespersonId: "u-sales-1",
    createdAt: daysAgo(12),
    updatedAt: daysAgo(12),
    deletedAt: null,
  },
  {
    id: "s-4",
    name: "Bùi Khánh Vy",
    age: 22,
    phone: "0934567890",
    jobTitle: "Nhân viên bán hàng",
    goal: "Giao tiếp cơ bản",
    enrollmentStatus: "prospect",
    cccdNumber: null,
    salespersonId: "u-sales-1",
    createdAt: daysAgo(6),
    updatedAt: daysAgo(6),
    deletedAt: null,
  },
  {
    id: "s-5",
    name: "Ngô Gia Hân",
    age: 27,
    phone: "0945678901",
    jobTitle: "Kế toán",
    goal: "Luyện thi TOEIC 750",
    enrollmentStatus: "confirmed",
    cccdNumber: "012345678905",
    salespersonId: "u-sales-1",
    createdAt: daysAgo(60),
    updatedAt: daysAgo(15),
    deletedAt: null,
  },
  {
    id: "s-6",
    name: "Trương Minh Khôi",
    age: 20,
    phone: "0956789012",
    jobTitle: "Sinh viên",
    goal: "Tiếng Anh học thuật",
    enrollmentStatus: "dropped",
    cccdNumber: null,
    salespersonId: "u-sales-1",
    createdAt: daysAgo(150),
    updatedAt: daysAgo(40),
    deletedAt: null,
  },
];

// Class IDs match the classId used on the seed sessions so the schedule and
// attendance line up with each class roster.
export const seedClasses: Class[] = [
  {
    id: "lop-a",
    name: "Lớp Giao tiếp A",
    courseName: "Giao tiếp tiếng Anh",
    teacherId: "u-teacher-1",
    studentIds: ["s-1", "s-2", "s-5"],
    status: "active",
    createdAt: daysAgo(130),
    updatedAt: daysAgo(10),
  },
  {
    id: "lop-ielts-b",
    name: "Lớp IELTS B",
    courseName: "Luyện thi IELTS",
    teacherId: "u-teacher-2",
    studentIds: ["s-2"],
    status: "active",
    createdAt: daysAgo(80),
    updatedAt: daysAgo(8),
  },
  {
    id: "lop-toeic-c",
    name: "Lớp TOEIC C",
    courseName: "Luyện thi TOEIC",
    teacherId: "u-teacher-2",
    studentIds: ["s-5"],
    status: "active",
    createdAt: daysAgo(70),
    updatedAt: daysAgo(12),
  },
];

export const seedSessions: Session[] = [
  {
    id: "ses-1",
    googleEventId: "gcal-evt-001",
    title: "Lớp A - Buổi 12",
    startTime: at(-2, 18, 0),
    endTime: at(-2, 20, 0),
    teacherId: "u-teacher-1",
    classId: "lop-a",
  },
  {
    id: "ses-2",
    googleEventId: "gcal-evt-002",
    title: "Lớp A - Buổi 13",
    startTime: at(0, 18, 0),
    endTime: at(0, 20, 0),
    teacherId: "u-teacher-1",
    classId: "lop-a",
  },
  {
    id: "ses-3",
    googleEventId: "gcal-evt-003",
    title: "Lớp A - Buổi 14",
    startTime: at(2, 18, 0),
    endTime: at(2, 20, 0),
    teacherId: "u-teacher-1",
    classId: "lop-a",
  },
  {
    id: "ses-4",
    googleEventId: "gcal-evt-004",
    title: "Lớp IELTS B - Buổi 5",
    startTime: at(0, 9, 0),
    endTime: at(0, 11, 30),
    teacherId: "u-teacher-2",
    classId: "lop-ielts-b",
  },
  {
    id: "ses-5",
    googleEventId: "gcal-evt-005",
    title: "Lớp IELTS B - Buổi 6",
    startTime: at(3, 9, 0),
    endTime: at(3, 11, 30),
    teacherId: "u-teacher-2",
    classId: "lop-ielts-b",
  },
  {
    id: "ses-6",
    googleEventId: "gcal-evt-006",
    title: "Lớp TOEIC C - Buổi 8",
    startTime: at(1, 19, 0),
    endTime: at(1, 21, 0),
    teacherId: "u-teacher-2",
    classId: "lop-toeic-c",
  },
];

export const seedAttendance: Attendance[] = [
  {
    id: "att-1",
    studentId: "s-1",
    sessionId: "ses-1",
    status: "present",
    markedBy: "u-teacher-1",
    markedAt: at(-2, 18, 5),
    isOverride: false,
  },
  {
    id: "att-2",
    studentId: "s-2",
    sessionId: "ses-1",
    status: "late",
    markedBy: "u-teacher-1",
    markedAt: at(-2, 18, 20),
    isOverride: false,
  },
  {
    id: "att-3",
    studentId: "s-5",
    sessionId: "ses-1",
    status: "absent",
    markedBy: "u-teacher-1",
    markedAt: at(-2, 18, 5),
    isOverride: false,
  },
  // An override correcting att-3 (absent -> excused) — demonstrates the
  // append-only rule: the original row stays, a new isOverride row is added.
  {
    id: "att-4",
    studentId: "s-5",
    sessionId: "ses-1",
    status: "excused",
    markedBy: "u-teacher-1",
    markedAt: at(-1, 9, 0),
    isOverride: true,
  },
];

export const seedHomework: Homework[] = [
  {
    id: "hw-1",
    studentId: "s-1",
    sessionId: "ses-1",
    status: "completed",
    recordedBy: "u-teacher-1",
  },
  {
    id: "hw-2",
    studentId: "s-2",
    sessionId: "ses-1",
    status: "not_completed",
    recordedBy: "u-teacher-1",
  },
  {
    id: "hw-3",
    studentId: "s-5",
    sessionId: "ses-1",
    status: "completed",
    recordedBy: "u-teacher-1",
  },
];

export const seedPaymentDocs: PaymentDoc[] = [
  {
    id: "pay-1",
    studentId: "s-1",
    amount: 6000000,
    paymentDate: daysAgo(110),
    fileName: "bien-lai-hoang-anh-tuan.pdf",
    fileType: "application/pdf",
    note: "Học phí khóa giao tiếp 3 tháng",
    uploadedBy: "u-finance",
    uploadedAt: daysAgo(110),
    deletedAt: null,
  },
  {
    id: "pay-2",
    studentId: "s-2",
    amount: 9500000,
    paymentDate: daysAgo(90),
    fileName: "chuyen-khoan-ngoc-mai.png",
    fileType: "image/png",
    note: "Học phí khóa IELTS",
    uploadedBy: "u-finance",
    uploadedAt: daysAgo(90),
    deletedAt: null,
  },
  {
    id: "pay-3",
    studentId: "s-5",
    amount: 7200000,
    paymentDate: daysAgo(55),
    fileName: "bien-lai-gia-han.jpg",
    fileType: "image/jpeg",
    note: "Học phí khóa TOEIC",
    uploadedBy: "u-finance",
    uploadedAt: daysAgo(55),
    deletedAt: null,
  },
];

export const seedAuditLogs: AuditLog[] = [
  {
    id: "log-1",
    userId: "u-admin",
    action: "login",
    detail: "Đăng nhập hệ thống",
    createdAt: daysAgo(1),
  },
  {
    id: "log-2",
    userId: "u-sales-1",
    action: "student.status_change",
    detail: "Học viên Ngô Gia Hân: prospect → confirmed",
    createdAt: daysAgo(15),
  },
  {
    id: "log-3",
    userId: "u-finance",
    action: "payment_doc.upload",
    detail: "Tải lên biên lai cho Vũ Thị Ngọc Mai",
    createdAt: daysAgo(90),
  },
];
