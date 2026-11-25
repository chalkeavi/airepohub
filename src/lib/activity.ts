import type { ActivityStatus } from "@/lib/types";

const DAY = 86_400_000;

/** Criteria documented in docs/decisions.md #11. */
export const ACTIVITY_RULES = { activeDays: 90, slowingDays: 365 } as const;

export function activityStatus(
  lastPushedAt: string | null,
  isArchived: boolean,
  now: Date,
): ActivityStatus {
  if (isArchived) return "archived";
  if (!lastPushedAt) return "inactive";
  const days = (now.getTime() - new Date(lastPushedAt).getTime()) / DAY;
  if (days <= ACTIVITY_RULES.activeDays) return "active";
  if (days <= ACTIVITY_RULES.slowingDays) return "slowing";
  return "inactive";
}

export const ACTIVITY_LABEL: Record<ActivityStatus, string> = {
  active: "Active",
  slowing: "Slowing down",
  inactive: "Inactive",
  archived: "Archived",
};

export const ACTIVITY_HINT: Record<ActivityStatus, string> = {
  active: `Code pushed in the last ${ACTIVITY_RULES.activeDays} days`,
  slowing: `No pushes for ${ACTIVITY_RULES.activeDays}–${ACTIVITY_RULES.slowingDays} days`,
  inactive: `No pushes for over a year`,
  archived: "Archived by its maintainers",
};
