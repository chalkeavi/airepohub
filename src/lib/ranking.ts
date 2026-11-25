// Ranking methodology v1 — see docs/architecture.md#ranking-methodology-v1.
// Pure functions: used by the ranking job (Milestone 4) and, in Milestone 1,
// for the provisional all-time board from sample data.

export const WEIGHTS = {
  stars: 0.3,
  growth: 0.3,
  activity: 0.2,
  docs: 0.1,
  community: 0.1,
} as const;

export type Signal = keyof typeof WEIGHTS;

export interface RankingInput {
  id: string;
  stars: number;
  forks: number;
  lastPushedAt: string | null;
  /** stars gained in the window; undefined = unknown (no history) */
  starGrowth?: number;
  /** editorial 0–1; undefined = not assessed */
  docsQuality?: number;
}

export interface RankingResult {
  id: string;
  score: number;
  rank: number;
  signals: Partial<Record<Signal, number>>;
}

const DAY = 86_400_000;

function logNorm(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.log10(Math.max(0, value) + 1) / Math.log10(max + 1);
}

/** 1 when pushed within 7 days, linear decay to 0 at 365 days. */
export function activityScore(lastPushedAt: string | null, now: Date): number {
  if (!lastPushedAt) return 0;
  const days = (now.getTime() - new Date(lastPushedAt).getTime()) / DAY;
  if (days <= 7) return 1;
  if (days >= 365) return 0;
  return 1 - (days - 7) / (365 - 7);
}

/**
 * Score and rank candidates. A signal is used only if every candidate has it;
 * unused signals are dropped and the remaining weights re-normalized.
 */
export function rankRepositories(
  items: RankingInput[],
  now: Date,
): { results: RankingResult[]; signalsUsed: Signal[] } {
  if (items.length === 0) return { results: [], signalsUsed: [] };

  const used: Signal[] = ["stars", "activity", "community"];
  if (items.every((i) => i.starGrowth !== undefined)) used.push("growth");
  if (items.every((i) => i.docsQuality !== undefined)) used.push("docs");

  const totalWeight = used.reduce((s, k) => s + WEIGHTS[k], 0);
  const maxStars = Math.max(...items.map((i) => i.stars));
  const maxForks = Math.max(...items.map((i) => i.forks));
  const maxGrowth = Math.max(0, ...items.map((i) => i.starGrowth ?? 0));

  const scored = items.map((item) => {
    const signals: Partial<Record<Signal, number>> = {
      stars: logNorm(item.stars, maxStars),
      activity: activityScore(item.lastPushedAt, now),
      community: logNorm(item.forks, maxForks),
    };
    if (used.includes("growth")) signals.growth = logNorm(item.starGrowth ?? 0, maxGrowth);
    if (used.includes("docs")) signals.docs = Math.min(1, Math.max(0, item.docsQuality ?? 0));
    const score = used.reduce((s, k) => s + (signals[k] ?? 0) * WEIGHTS[k], 0) / totalWeight;
    return { id: item.id, score: Math.round(score * 100000) / 100000, signals };
  });

  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return {
    results: scored.map((s, i) => ({ ...s, rank: i + 1 })),
    signalsUsed: used,
  };
}
