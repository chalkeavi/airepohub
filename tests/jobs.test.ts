import { describe, expect, it } from "vitest";
import type { GithubApi, GithubRepo } from "@/lib/jobs/github";
import { RateLimitError } from "@/lib/jobs/github";
import { starGrowth } from "@/lib/jobs/growth";
import { buildRankings, runDiscover, runRank, runSnapshot } from "@/lib/jobs/jobs";
import { scoreRelevance } from "@/lib/jobs/relevance";
import type { JobStore, Period, QueueRow, RankingRow, RunResult, TrackedRepo } from "@/lib/jobs/store";
import type { StatPoint } from "@/lib/jobs/growth";

const NOW = new Date("2026-12-10T05:17:00Z");

function gh(id: number, over: Partial<GithubRepo> = {}): GithubRepo {
  return {
    id, full_name: `o/r${id}`, name: `r${id}`, owner: { login: "o", avatar_url: "https://a" }, html_url: `https://github.com/o/r${id}`,
    homepage: null, description: "An LLM agent framework for building AI apps", language: "Python", license: { spdx_id: "MIT" },
    topics: ["llm", "ai-agents"], stargazers_count: 1500, forks_count: 100, open_issues_count: 5, archived: false, fork: false,
    default_branch: "main", created_at: "2025-01-01T00:00:00Z", updated_at: "2026-12-09T00:00:00Z", pushed_at: "2026-12-09T00:00:00Z", ...over,
  };
}

class MemStore implements JobStore {
  repos: TrackedRepo[] = [];
  stats: StatPoint[] = [];
  rankings: RankingRow[] = [];
  queue = new Map<number, QueueRow & { last_seen_at?: string }>();
  aliases: string[] = [];
  updates: Record<string, unknown>[] = [];
  runs: { job: string; result?: RunResult }[] = [];
  async listTrackedRepos() { return this.repos; }
  async updateRepo(id: string, u: never) { this.updates.push({ id, ...(u as object) }); }
  async addAlias(_id: string, old: string) { this.aliases.push(old); }
  async upsertStats(rows: { repository_id: string; recorded_on: string; stars: number }[]) {
    for (const r of rows) {
      this.stats = this.stats.filter((s) => !(s.repositoryId === r.repository_id && s.recordedOn === r.recorded_on));
      this.stats.push({ repositoryId: r.repository_id, recordedOn: r.recorded_on, stars: r.stars });
    }
  }
  async statsSince(day: string) { return this.stats.filter((s) => s.recordedOn >= day); }
  async latestRanking(period: Period, cat: string | null) {
    const rows = this.rankings.filter((r) => r.period === period && r.category_id === cat);
    const latest = rows.map((r) => r.calculated_at).sort().at(-1);
    return new Map(rows.filter((r) => r.calculated_at === latest).map((r) => [r.repository_id, r.rank]));
  }
  async insertRankings(rows: RankingRow[]) { this.rankings.push(...rows); }
  async knownGithubIds() { return { repositories: new Set(this.repos.map((r) => r.githubId)), queue: new Set(this.queue.keys()) }; }
  async insertQueue(rows: QueueRow[]) { for (const r of rows) if (!this.queue.has(r.github_id)) this.queue.set(r.github_id, r); }
  async touchQueue(ids: number[], at: string) { for (const id of ids) this.queue.get(id)!.last_seen_at = at; }
  async startRun(job: string) { this.runs.push({ job }); return String(this.runs.length); }
  async finishRun(id: string | null, result: RunResult) { this.runs[Number(id) - 1].result = result; }
}

function fakeGithub(byId: Record<number, GithubRepo | null>, search: GithubRepo[] = [], limitAfter = Infinity): GithubApi {
  return {
    calls: 0,
    async getRepoById(id) { if (++this.calls > limitAfter) throw new RateLimitError("limit"); return byId[id] ?? null; },
    async searchRepos() { this.calls++; return search; },
  };
}

const tracked = (i: number, over: Partial<TrackedRepo> = {}): TrackedRepo => ({
  id: `id${i}`, githubId: i, owner: "o", name: `r${i}`, fullName: `o/r${i}`, slug: `r${i}`, status: "published",
  stars: 1000 * i, forks: 10 * i, lastPushedAt: "2026-12-01T00:00:00Z", docsQuality: null, categoryIds: ["cat"], ...over,
});

describe("star growth", () => {
  const points: StatPoint[] = [
    { repositoryId: "a", recordedOn: "2026-12-02", stars: 900 },
    { repositoryId: "a", recordedOn: "2026-12-03", stars: 950 },
  ];
  it("uses the latest snapshot at or before the window start", () => {
    expect(starGrowth(points, 1000, NOW, 7)).toBe(50); // baseline 2026-12-03
  });
  it("is unknown (not zero) without old enough history", () => {
    expect(starGrowth(points, 1000, NOW, 30)).toBeUndefined();
    expect(starGrowth([], 1000, NOW, 7)).toBeUndefined();
  });
});

describe("relevance", () => {
  it("queues active AI repos and explains why", () => {
    const r = scoreRelevance(gh(1), NOW);
    expect(r.eligible).toBe(true);
    expect(r.reasons.join(" ")).toMatch(/AI topics/);
  });
  it("rejects forks, archived and non-AI repos", () => {
    expect(scoreRelevance(gh(1, { fork: true }), NOW).eligible).toBe(false);
    expect(scoreRelevance(gh(1, { archived: true }), NOW).eligible).toBe(false);
    expect(scoreRelevance(gh(1, { topics: ["css"], description: "A CSS reset" }), NOW).eligible).toBe(false);
  });
});

describe("snapshot job", () => {
  it("updates metadata, records today's stars once, and aliases renamed repos", async () => {
    const store = new MemStore();
    store.repos = [tracked(1), tracked(2)];
    const github = fakeGithub({ 1: gh(1, { stargazers_count: 1234 }), 2: gh(2, { full_name: "new/name" }) });
    const ctx = { store, github, now: NOW };
    await runSnapshot(ctx);
    await runSnapshot(ctx); // same day again: still one row per repo
    expect(store.stats.filter((s) => s.repositoryId === "id1")).toEqual([{ repositoryId: "id1", recordedOn: "2026-12-10", stars: 1234 }]);
    expect(store.aliases).toContain("o/r2");
    expect(store.runs[0].result?.status).toBe("succeeded");
  });
  it("keeps partial progress and reports 'partial' when rate limited", async () => {
    const store = new MemStore();
    store.repos = [tracked(1), tracked(2), tracked(3)];
    const summary = await runSnapshot({ store, github: fakeGithub({ 1: gh(1), 2: gh(2), 3: gh(3) }, [], 2), now: NOW });
    expect(summary.status).toBe("partial");
    expect(store.stats).toHaveLength(2);
  });
  it("flags repos GitHub no longer returns without deleting them", async () => {
    const store = new MemStore();
    store.repos = [tracked(1)];
    const summary = await runSnapshot({ store, github: fakeGithub({ 1: null }), now: NOW });
    expect(summary.details.missing).toEqual(["o/r1"]);
    expect(store.updates).toHaveLength(0);
  });
  it("writes nothing in dry-run mode", async () => {
    const store = new MemStore();
    store.repos = [tracked(1)];
    await runSnapshot({ store, github: fakeGithub({ 1: gh(1) }), now: NOW, dryRun: true });
    expect(store.stats).toHaveLength(0);
    expect(store.runs).toHaveLength(0);
  });
});

describe("ranking job", () => {
  it("writes only all-time boards until a week of history exists", async () => {
    const store = new MemStore();
    store.repos = [tracked(1), tracked(2), tracked(3)];
    await runRank({ store, github: fakeGithub({}), now: NOW });
    expect(new Set(store.rankings.map((r) => r.period))).toEqual(new Set(["all_time"]));
    expect(store.rankings.every((r) => r.star_growth === null && r.previous_rank === null)).toBe(true);
  });
  it("adds weekly boards with real growth and movement once history exists", async () => {
    const store = new MemStore();
    store.repos = [tracked(1), tracked(2), tracked(3)];
    store.stats = store.repos.map((r, i) => ({ repositoryId: r.id, recordedOn: "2026-12-03", stars: r.stars - (i === 0 ? 500 : 10) }));
    await runRank({ store, github: fakeGithub({}), now: NOW });
    const weekly = store.rankings.filter((r) => r.period === "weekly" && r.category_id === null);
    expect(weekly).toHaveLength(3);
    expect(weekly.find((r) => r.repository_id === "id1")?.star_growth).toBe(500);
    // Second run: previous_rank comes from the first run's snapshot.
    await runRank({ store, github: fakeGithub({}), now: new Date(NOW.getTime() + 86_400_000) });
    const latest = store.rankings.filter((r) => r.period === "all_time" && r.category_id === null && r.previous_rank !== null);
    expect(latest).toHaveLength(3);
  });
  it("ignores unpublished repos", () => {
    const rows = buildRankings([tracked(1)], new Map(), new Map(), "all_time", null, NOW);
    expect(rows).toHaveLength(1);
  });
});

describe("discovery job", () => {
  it("queues new relevant repos once, skips known ones, and never touches published data", async () => {
    const store = new MemStore();
    store.repos = [tracked(1)];
    const results = [gh(1), gh(2), gh(3, { topics: ["css"], description: "CSS reset" }), gh(4)];
    const ctx = { store, github: fakeGithub({}, results), now: NOW };
    await runDiscover(ctx);
    expect([...store.queue.keys()].sort()).toEqual([2, 4]);
    await runDiscover(ctx); // idempotent: already-queued repos are only marked as seen
    expect(store.queue.size).toBe(2);
    expect(store.queue.get(2)?.last_seen_at).toBe(NOW.toISOString());
    expect(store.updates).toHaveLength(0);
  });
});

describe("relevance scoring is graded", () => {
  it("ranks a popular, freshly pushed AI repo above a small, stale one and skips curated lists", () => {
    const big = scoreRelevance(gh(1, { stargazers_count: 50000, pushed_at: "2026-12-09T00:00:00Z" }), NOW);
    const small = scoreRelevance(gh(2, { stargazers_count: 150, pushed_at: "2026-10-01T00:00:00Z" }), NOW);
    expect(big.score).toBeGreaterThan(small.score);
    expect(big.score).toBeLessThan(1);
    expect(scoreRelevance(gh(3, { name: "awesome-llm-apps" }), NOW).eligible).toBe(false);
  });
});
