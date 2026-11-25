// Star growth from our own daily snapshots (GitHub's API has no star history).

export interface StatPoint {
  repositoryId: string;
  recordedOn: string; // YYYY-MM-DD (UTC)
  stars: number;
}

const DAY = 86_400_000;

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Stars gained over `days`, measured from the latest snapshot on or before (today − days),
 * allowing up to `toleranceDays` extra so one missed daily run doesn't erase the board.
 * Returns undefined when we have no snapshot old enough: growth is then unknown, never 0.
 */
export function starGrowth(
  points: StatPoint[],
  currentStars: number,
  today: Date,
  days: number,
  toleranceDays = 2,
): number | undefined {
  const target = isoDay(new Date(today.getTime() - days * DAY));
  const earliest = isoDay(new Date(today.getTime() - (days + toleranceDays) * DAY));
  const baseline = points
    .filter((p) => p.recordedOn <= target && p.recordedOn >= earliest)
    .sort((a, b) => b.recordedOn.localeCompare(a.recordedOn))[0];
  return baseline ? currentStars - baseline.stars : undefined;
}
