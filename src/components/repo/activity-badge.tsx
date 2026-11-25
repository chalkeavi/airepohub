import { Badge } from "@/components/ui/badge";
import { ACTIVITY_HINT, ACTIVITY_LABEL, activityStatus } from "@/lib/activity";
import type { Repository } from "@/lib/types";

const TONE = { active: "success", slowing: "warning", inactive: "danger", archived: "muted" } as const;

export function ActivityBadge({ repo, asOf }: { repo: Repository; asOf: string }) {
  const status = activityStatus(repo.lastPushedAt, repo.isArchived, new Date(asOf));
  return (
    <Badge tone={TONE[status]} title={ACTIVITY_HINT[status]}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {ACTIVITY_LABEL[status]}
    </Badge>
  );
}
