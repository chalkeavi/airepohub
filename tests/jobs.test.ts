import { describe, expect, it } from "vitest";
import type { GithubApi, GithubRepo } from "@/lib/jobs/github";
import { GithubClient, RateLimitError } from "@/lib/jobs/github";
import { starGrowth } from "@/lib/jobs/growth";
import { buildRankings, runDiscover, runRank, runSnapshot } from "@/lib/jobs/jobs";
import { scoreRelevance } from "@/lib/jobs/relevance";
import type { JobStore, NewRepoRow, Period, QueueRow, RankingRow, RunResult, TrackedRepo } from "@/lib/jobs/store";
import { categorize, importEligible, runImport, starBands, uniqueSlug } from "@/lib/jobs/importer";
import { FileSummarizer, validateSummary } from "@/lib/jobs/summarize";
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
  inserted: NewRepoRow[] = [];
  repoCategories: { repository_id: string; category_id: string; is_primary: boolean }[] = [];
  noindex: string[] = [];
  approved: number[] = [];
  async knownSlugs() { return new Set(this.repos.map((r) => r.slug)); }
  async categoryIds() { return new Map([["ai-agents", "c-agents"], ["developer-tools", "c-dev"], ["coding-assistants", "c-code"]]); }
  async insertRepositories(rows: NewRepoRow[]) {
    this.inserted.push(...rows);
    return rows.map((r) => ({ id: `new${r.github_id}`, github_id: r.github_id }));
  }
  async insertRepoCategories(rows: { repository_id: string; category_id: string; is_primary: boolean }[]) { this.repoCategories.push(...rows); }
  async setNoindex(ids: string[]) { this.noindex.push(...ids); }
  async markQueueApproved(ids: number[]) { this.approved.push(...ids); }
  summaries = new Map<string, string>();
  publishedAt = new Map<string, string>();
  async saveSummaries(rows: { id: string; summary: string }[], at?: string) {
    for (const r of rows) {
      this.summaries.set(r.id, r.summary);
      if (at) this.publishedAt.set(r.id, at);
    }
  }
  async listUnsummarized() { return []; }
  guides = new Map<string, unknown>();
  async repoIdsByFullName(names: string[]) { return new Map(names.map((n) => [n.toLowerCase(), `id-${n.toLowerCase()}`])); }
  async saveGuide(id: string, content: unknown) { this.guides.set(id, content); }
  listPendingQueue = async (): Promise<{ github_id: number; full_name: string; payload: Record<string, unknown> }[]> => [];
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

describe("import job", () => {
  const search = (pages: Record<string, GithubRepo[]>): GithubApi => ({
    calls: 0,
    async getRepoById() { return null; },
    async searchRepos() { return []; },
    async searchPage(q: string) {
      this.calls++;
      const items = Object.entries(pages).find(([k]) => q.includes(k))?.[1] ?? [];
      return { total: items.length, items };
    },
  });
  const opts = { target: 2, minStars: 500, pushedSince: "2025-06-01", noindex: true, topics: ["llm"], sleep: async () => {}, searchDelayMs: 0 };

  it("splits searches into star bands from the most popular down", () => {
    expect(starBands(500)[0]).toBe("stars:>=50000");
    expect(starBands(500).at(-1)).toBe("stars:500..699");
    expect(starBands(100000)).toEqual(["stars:>=100000"]);
  });

  it("only takes real tools with a GitHub description", () => {
    expect(importEligible(gh(1), 500)).toBe(true);
    expect(importEligible(gh(2, { description: null }), 500)).toBe(false);
    expect(importEligible(gh(3, { name: "awesome-agents" }), 500)).toBe(false);
    expect(importEligible(gh(4, { description: "A curated list of LLM tools" }), 500)).toBe(false);
    expect(importEligible(gh(5, { fork: true }), 500)).toBe(false);
    expect(importEligible(gh(6, { stargazers_count: 499 }), 500)).toBe(false);
  });

  it("assigns categories from topics, with a catch-all", () => {
    expect(categorize(gh(1, { topics: ["claude-code", "ai-agents"] }))).toEqual(["coding-assistants", "ai-agents"]);
    expect(categorize(gh(2, { topics: ["pytorch"], description: "Tensors" }))).toEqual(["developer-tools"]);
    expect(categorize(gh(3, { topics: [], description: "A tool for unrelated things" }))).toEqual(["developer-tools"]);
  });

  it("never reuses a slug", () => {
    const taken = new Set(["r1"]);
    expect(uniqueSlug(gh(1), taken)).toBe("o-r1");
    expect(uniqueSlug(gh(2, { name: "My.Repo_X" }), taken)).toBe("my-repo-x");
  });

  it("publishes the most-starred new repos once, with real GitHub fields, noindex and approved queue rows", async () => {
    const store = new MemStore();
    store.repos = [tracked(1)];
    store.queue.set(3, { github_id: 3, full_name: "o/r3", github_url: "", payload: {}, relevance_score: 0.5, relevance_reasons: [], run_id: null });
    const results = [gh(1, { stargazers_count: 90000 }), gh(2, { stargazers_count: 800 }), gh(3, { stargazers_count: 60000 }), gh(4, { stargazers_count: 70000 }), gh(5, { fork: true, stargazers_count: 99000 })];
    const summary = await runImport({ store, github: search({ "stars:": results }), now: NOW }, opts);
    expect(summary.status).toBe("succeeded");
    expect(store.inserted.map((r) => r.github_id)).toEqual([4, 3]); // known #1 and the fork skipped; top 2 by stars
    expect(store.inserted.every((r) => r.status === "published" && r.published_at === NOW.toISOString())).toBe(true);
    expect(store.inserted[0]).toMatchObject({ stars: 70000, description: gh(4).description, full_name: "o/r4", slug: "r4" });
    expect(store.repoCategories.filter((c) => c.is_primary)).toHaveLength(2);
    expect(store.noindex).toEqual(["new4", "new3"]);
    expect(store.approved).toEqual([3]);
    expect(store.stats.map((s) => s.stars)).toEqual([70000, 60000]);
  });

  it("writes nothing in dry-run mode", async () => {
    const store = new MemStore();
    const summary = await runImport({ store, github: search({ "stars:": [gh(7)] }), now: NOW, dryRun: true }, opts);
    expect(summary.processed).toBe(1);
    expect(store.inserted).toHaveLength(0);
    expect(store.runs).toHaveLength(0);
  });
});

describe("ranking boards are capped", () => {
  it("stores at most 100 rows per board", () => {
    const pool = Array.from({ length: 150 }, (_, i) => tracked(i + 1));
    expect(buildRankings(pool, new Map(), new Map(), "all_time", null, NOW)).toHaveLength(100);
  });
});

describe("batched GitHub lookups", () => {
  const node = (id: number, name: string) => ({
    databaseId: id, name, nameWithOwner: `o/${name}`, url: `https://github.com/o/${name}`, homepageUrl: "", description: "d",
    isArchived: false, isFork: false, isDisabled: false, owner: { login: "o", avatarUrl: "https://a" }, primaryLanguage: { name: "Go" },
    licenseInfo: { spdxId: "MIT" }, repositoryTopics: { nodes: [{ topic: { name: "llm" } }] }, stargazerCount: 10, forkCount: 2,
    issues: { totalCount: 3 }, pullRequests: { totalCount: 1 }, defaultBranchRef: { name: "main" },
    createdAt: "2025-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", pushedAt: "2026-01-01T00:00:00Z",
  });

  it("maps GraphQL repos to the REST shape and skips ones GitHub can't resolve", async () => {
    let sent = "";
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = String(init.body);
      return new Response(JSON.stringify({ data: { r0: node(1, "a"), r1: null }, errors: [{ type: "NOT_FOUND", message: "x" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const map = await new GithubClient("t", fetchImpl).getReposBatch([{ githubId: 1, fullName: "o/a" }, { githubId: 2, fullName: "o/gone" }]);
    expect(sent).toContain('repository(owner: \\"o\\", name: \\"gone\\")');
    expect([...map.keys()]).toEqual([1]);
    expect(map.get(1)).toMatchObject({ full_name: "o/a", open_issues_count: 4, license: { spdx_id: "MIT" }, topics: ["llm"], homepage: null });
  });

  it("snapshot falls back to REST when the batch call fails", async () => {
    const store = new MemStore();
    store.repos = [tracked(1)];
    const github: GithubApi = {
      calls: 0,
      async getReposBatch() { throw new Error("GraphQL unavailable"); },
      async getRepoById(id) { this.calls++; return gh(id); },
      async searchRepos() { return []; },
    };
    const s = await runSnapshot({ store, github, now: NOW });
    expect(s.processed).toBe(1);
    expect(store.updates).toHaveLength(1);
  });
});

describe("summaries", () => {
  const src = { key: "k", fullName: "o/r", description: "Run Llama 3 and other LLMs locally with one command", topics: ["llm"], language: "Go" };

  it("accepts one plain, sourced sentence", () => {
    expect(validateSummary("Command-line tool for running Llama 3 and other language models on your own computer.", src)).toBeTruthy();
  });

  it("rejects invented numbers, hype, links, markdown, SKIP and multiple sentences", () => {
    expect(validateSummary("Tool that runs 400 models on your own computer quickly.", src)).toBeNull();
    expect(validateSummary("The most powerful tool for running language models on your computer.", src)).toBeNull();
    expect(validateSummary("Runs language models locally, see https://x.io for setup details.", src)).toBeNull();
    expect(validateSummary("**Tool** that runs language models on your own computer.", src)).toBeNull();
    expect(validateSummary("SKIP", src)).toBeNull();
    expect(validateSummary("Runs language models locally. Works offline on your own laptop.", src)).toBeNull();
  });

  it("import publishes only drafts that got a valid summary", async () => {
    const store = new MemStore();
    const github: GithubApi = {
      calls: 0,
      async getRepoById() { return null; },
      async searchRepos() { return []; },
      async searchPage() { return { total: 2, items: [gh(10, { stargazers_count: 9000 }), gh(11, { stargazers_count: 8000 })] }; },
    };
    const summarizer = new FileSummarizer({ "O/R10": "Framework for building AI agent apps with large language models in Python." });
    const s = await runImport(
      { store, github, now: NOW },
      { target: 5, minStars: 500, pushedSince: "2025-06-01", noindex: true, topics: ["llm"], sleep: async () => {}, searchDelayMs: 0, summarizer },
    );
    expect(store.inserted.every((r) => r.status === "draft" && r.published_at === null)).toBe(true);
    expect(store.inserted.map((r) => r.github_id)).toEqual([10]); // file mode only takes repos it has a line for
    expect([...store.summaries.keys()]).toEqual(["new10"]);
    expect(store.publishedAt.get("new10")).toBe(NOW.toISOString());
    expect(s.processed).toBe(1);
    expect(s.details.left_as_draft).toBe(0);
  });
});

describe("daily queue publisher", () => {
  it("publishes queued repos that have a summary and leaves the rest pending", async () => {
    const { runPublishQueue } = await import("@/lib/jobs/importer");
    const { toRepoUpdate } = await import("@/lib/jobs/jobs");
    const store = new MemStore();
    const payload = (g: GithubRepo) => ({ ...toRepoUpdate(g, NOW.toISOString()), github_id: g.id, created_at_github: g.created_at });
    store.listPendingQueue = async () => [
      { github_id: 20, full_name: "o/r20", payload: payload(gh(20)) },
      { github_id: 21, full_name: "o/r21", payload: payload(gh(21)) },
    ];
    for (const id of [20, 21]) store.queue.set(id, { github_id: id, full_name: `o/r${id}`, github_url: "", payload: {}, relevance_score: 0.5, relevance_reasons: [], run_id: null });
    const s = await runPublishQueue(
      { store, github: fakeGithub({}), now: NOW },
      new FileSummarizer({ "o/r20": "Framework for building AI agent apps with large language models in Python." }),
      { noindex: true },
    );
    expect(s.processed).toBe(1);
    expect(store.inserted.map((r) => r.full_name)).toEqual(["o/r20"]);
    expect(store.approved).toEqual([20]);
    expect((s.details.published_list as { slug: string }[])[0].slug).toBe("r20");
  });
});

describe("full guides", () => {
  it("accepts the OpenSEO guide and publishes it", async () => {
    const { openseoContent } = await import("@/lib/data/sample/content/openseo");
    const { checkGuide, runPublishGuides } = await import("@/lib/jobs/guides");
    const guide = { fullName: "vikasswebdev/OpenSEO", content: openseoContent };
    expect(checkGuide(guide)).toEqual([]);
    const store = new MemStore();
    const s = await runPublishGuides({ store, github: fakeGithub({}), now: NOW }, [guide]);
    expect(s.processed).toBe(1);
    expect(store.guides.has("id-vikasswebdev/openseo")).toBe(true);
  });

  it("rejects 'verified' installs and guides without a pinned source", async () => {
    const { openseoContent } = await import("@/lib/data/sample/content/openseo");
    const { checkGuide } = await import("@/lib/jobs/guides");
    const bad = { ...openseoContent, sourceCommitSha: "main", install: { ...openseoContent.install, verification: "verified" as const } };
    const problems = checkGuide({ fullName: "vikasswebdev/OpenSEO", content: bad });
    expect(problems.join(" ")).toMatch(/commit SHA/);
    expect(problems.join(" ")).toMatch(/verified/);
  });
});
