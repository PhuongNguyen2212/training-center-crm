import type { Session, Student } from "@/types";

// Resolve the student roster for a session: the students added to that session,
// in the order they were added. Soft-deleted students are left out.
export function getSessionRoster(
  session: Session | null,
  students: Student[],
): Student[] {
  if (!session) return [];
  return (session.studentIds ?? [])
    .map((id) => students.find((s) => s.id === id && !s.deletedAt))
    .filter((s): s is Student => Boolean(s));
}
