// Sidebar navigation, each item gated by a capability from the permission matrix.

import {
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  Receipt,
  Target,
  UserCog,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Capability } from "@/lib/permissions";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  cap: Capability | null; // null = always visible to any logged-in user
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Tổng quan", icon: LayoutDashboard, cap: null },
  { to: "/students", label: "Học viên", icon: Users, cap: "students.view" },
  {
    to: "/classes",
    label: "Lớp học",
    icon: GraduationCap,
    cap: "classes.view",
  },
  {
    to: "/schedule",
    label: "Lịch học",
    icon: CalendarDays,
    cap: "schedule.view",
  },
  {
    to: "/attendance",
    label: "Điểm danh",
    icon: ClipboardCheck,
    cap: "attendance.view",
  },
  { to: "/finance", label: "Tài chính", icon: Receipt, cap: "payment.view" },
  { to: "/kpi", label: "KPI", icon: Target, cap: null },
  { to: "/staff", label: "Nhân sự", icon: UserCog, cap: "users.manage" },
];
