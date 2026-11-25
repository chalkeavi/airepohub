import { describe, expect, it } from "vitest";
import { activityScore, rankRepositories } from "@/lib/ranking";

const now = new Date("2026-11-24T00:00:00Z");

describe("rankRepositories", () => {
  it("drops growth and docs when any candidate lacks them, and re-normalizes", () => {
    const { results, signalsUsed } = rankRepositories(
      [
        { id: "a", stars: 100, forks: 10, lastPushedAt: "2026-11-23T00:00:00Z" },
        { id: "b", stars: 10, forks: 1, lastPushedAt: "2026-11-23T00:00:00Z", starGrowth: 50 },
      ],
      now,
    );
    expect(signalsUsed).toEqual(["stars", "activity", "community"]);
    expect(results[0].id).toBe("a");
    expect(results[0].score).toBeCloseTo(1, 5); // top on every used signal
  });

  it("uses growth when every candidate has history", () => {
    const { results, signalsUsed } = rankRepositories(
      [
        { id: "giant", stars: 200_000, forks: 20_000, lastPushedAt: "2026-11-23T00:00:00Z", starGrowth: 10 },
        { id: "rising", stars: 20_000, forks: 2_000, lastPushedAt: "2026-11-23T00:00:00Z", starGrowth: 5_000 },
      ],
      now,
    );
    expect(signalsUsed).toContain("growth");
    expect(results[0].id).toBe("rising");
  });

  it("log-scales stars so a 10x gap is not a 10x score gap", () => {
    const { results } = rankRepositories(
      [
        { id: "big", stars: 100_000, forks: 0, lastPushedAt: null },
        { id: "small", stars: 10_000, forks: 0, lastPushedAt: null },
      ],
      now,
    );
    const small = results.find((r) => r.id === "small")!;
    expect(small.signals.stars).toBeGreaterThan(0.75);
  });

  it("returns ranks 1..n and handles an empty list", () => {
    expect(rankRepositories([], now).results).toEqual([]);
    const { results } = rankRepositories(
      ["x", "y", "z"].map((id, i) => ({ id, stars: i * 10, forks: 0, lastPushedAt: null })),
      now,
    );
    expect(results.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
});

describe("activityScore", () => {
  it("is 1 within a week and 0 after a year", () => {
    expect(activityScore("2026-11-20T00:00:00Z", now)).toBe(1);
    expect(activityScore("2025-11-01T00:00:00Z", now)).toBe(0);
    expect(activityScore(null, now)).toBe(0);
  });
});
