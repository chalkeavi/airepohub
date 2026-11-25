import type { Category, Leaderboard } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import type { LeaderboardData } from "./leaderboard";

/** Slim, serializable rows for the client leaderboard. */
export function toLeaderboardData(boards: Leaderboard[], categories: Category[], asOf: string): LeaderboardData[] {
  const names = new Map(categories.map((c) => [c.slug, c.name]));
  return boards.map((b) => ({
    period: b.period,
    emptyReason: b.emptyReason,
    rows: b.entries.map((e) => ({
      rank: e.rank,
      slug: e.repository.slug,
      name: e.repository.name,
      owner: e.repository.owner,
      avatarUrl: e.repository.avatarUrl,
      summary: e.repository.summary ?? "",
      stars: e.repository.stars,
      categoryName: names.get(e.repository.categorySlugs[0]) ?? null,
      language: e.repository.primaryLanguage,
      updated: timeAgo(e.repository.lastPushedAt, asOf),
      starGrowth: e.starGrowth,
      movement: e.movement,
    })),
  }));
}
