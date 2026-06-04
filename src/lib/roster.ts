import type { Class, Session, Student } from "@/types";

// Resolve the student roster for a session: the enrolled students of the
// session's class. Falls back to all confirmed students when the session isn't
// linked to a known class (e.g. a session pulled from Google with no class).
export function getSessionRoster(
  session: Session | null,
  classes: Class[],
  students: Student[],
): Student[] {
  const active = students.filter((s) => !s.deletedAt);
  if (!session) return [];

  const cls = session.classId
    ? classes.find((c) => c.id === session.classId)
    : undefined;

  if (cls) {
    // Preserve enrollment order.
    return cls.studentIds
      .map((id) => active.find((s) => s.id === id))
      .filter((s): s is Student => Boolean(s));
  }

  return active.filter((s) => s.enrollmentStatus === "confirmed");
}
