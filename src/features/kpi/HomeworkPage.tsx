import { useAuthStore } from "@/store/auth-store";
import { can } from "@/lib/permissions";
import { NoAccess, PageHeader } from "@/components/ui";
import HomeworkTracker from "./HomeworkTracker";

// Bài tập về nhà — feature riêng cho giáo viên giao/theo dõi bài tập.
export default function HomeworkPage() {
  const user = useAuthStore((s) => s.currentUser)!;
  if (!can(user.role, "homework.record")) return <NoAccess />;

  return (
    <div>
      <PageHeader
        title="Bài tập về nhà"
        subtitle="Giáo viên giao và theo dõi bài tập theo từng buổi học"
      />
      <HomeworkTracker />
    </div>
  );
}
