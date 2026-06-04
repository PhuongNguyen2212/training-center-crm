// Role permission matrix from CLAUDE.md, encoded as a single source of truth.
//
// In production these checks are RE-VERIFIED inside every Tauri command after
// re-reading the role from the DB session — the frontend copy here is only for
// hiding/disabling UI. Never trust the frontend's role for an actual write.

import type { Role } from "@/types";

export type Capability =
  | "schedule.view"
  | "schedule.edit"
  | "classes.view"
  | "classes.edit"
  | "students.view"
  | "students.edit"
  | "attendance.mark"
  | "attendance.view"
  | "payment.upload"
  | "payment.edit"
  | "payment.view"
  | "payment.delete"
  | "homework.record"
  | "sales.view"
  | "users.manage";

// "own" scoping (e.g. teacher sees only their classes) is handled at the data
// layer; this matrix answers the coarse "can this role touch the feature at all".
const MATRIX: Record<Role, Capability[]> = {
  admin: [
    "schedule.view",
    "schedule.edit",
    "classes.view",
    "classes.edit",
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
  ],
  teacher: [
    "schedule.view",
    "classes.view",
    "students.view",
    "attendance.mark",
    "attendance.view",
    "homework.record",
  ],
  salesperson: ["students.view", "students.edit", "payment.view", "sales.view"],
  finance_staff: [
    "students.view",
    "payment.upload",
    "payment.edit",
    "payment.view",
  ],
};

export const can = (role: Role, cap: Capability): boolean =>
  MATRIX[role].includes(cap);
