import { describe, expect, it } from "vitest";
import type { GithubApi, GithubRepo } from "@/lib/jobs/github";
import { GithubClient, RateLimitError } from "@/lib/jobs/github";
import { starGrowth } from "@/lib/jobs/growth";
import { buildRankings, runDiscover, runRank, runSnapshot } from "@/lib/jobs/jobs";
import { scoreRelevance } from "@/lib/jobs/relevance";
import type { JobStore, NewRepoRow, Period, QueueRow, RankingRow, RunResult, TrackedRepo } from "@/lib/jobs/store";
import { categorize, importEligible, runImport, starBands, uniqueSlug } from "@/lib/jobs/importer";
import { FileSummarizer, runPublishDrafts, validateSummary } from "@/lib/jobs/summarize";
import type { StatPoint } from "@/lib/jobs/growth";
import { completeWithRetry, isTransientLlmError, editoriallyExcluded, groundingProblems, parseModelJson, runWriter, buildGuide, cleanReadme } from "@/lib/jobs/writer";
import { llmFromEnv, OpenAiCompatibleLlm, type LlmClient } from "@/lib/jobs/llm";

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
  ignored: { github_id: number; notes: string }[] = [];
  async ignoreInQueue(rows: { github_id: number; notes: string }[]) { this.ignored.push(...rows); }
  summaries = new Map<string, string>();
  publishedAt = new Map<string, string>();
  async saveSummaries(rows: { id: string; summary: string }[], at?: string) {
    for (const r of rows) {
      this.summaries.set(r.id, r.summary);
      if (at) this.publishedAt.set(r.id, at);
    }
  }
  async listUnsummarized() { return []; }
  drafts: { id: string; full_name: string; description: string; topics: string[]; primary_language: string | null }[] = [];
  async listDrafts() { return this.drafts; }
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

  it("publishes earlier drafts that now have a summary and leaves the rest as drafts", async () => {
    const store = new MemStore();
    const row = (id: string, full_name: string) => ({ id, full_name, description: "An LLM agent framework for building AI apps", topics: ["llm"], primary_language: "Python" });
    store.drafts = [row("d1", "o/r20"), row("d2", "o/r21")];
    const summarizer = new FileSummarizer({ "o/r20": "Framework for building AI agent apps with large language models in Python." });
    const s = await runPublishDrafts({ store, github: fakeGithub({}), now: NOW }, summarizer);
    expect([...store.summaries.keys()]).toEqual(["d1"]);
    expect(store.publishedAt.get("d1")).toBe(NOW.toISOString());
    expect(store.publishedAt.has("d2")).toBe(false);
    expect(s.details.published_list).toEqual(["o/r20"]);
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

  it("rejects install guides that repeat an os + method pair", async () => {
    const { openseoContent } = await import("@/lib/data/sample/content/openseo");
    const { checkGuide } = await import("@/lib/jobs/guides");
    const g = openseoContent.install.guides[0];
    const dup = { ...openseoContent, install: { ...openseoContent.install, guides: [g, { ...g, label: "Other" }] } };
    expect(checkGuide({ fullName: "vikasswebdev/OpenSEO", content: dup }).join(" ")).toMatch(/unique os \+ method/);
  });

  it("keeps publishing other guides when one save fails", async () => {
    const { openseoContent } = await import("@/lib/data/sample/content/openseo");
    const { runPublishGuides } = await import("@/lib/jobs/guides");
    const store = new MemStore();
    const real = store.saveGuide.bind(store);
    store.saveGuide = async (id: string, c: unknown) => {
      if (id === "id-vikasswebdev/openseo") throw new Error("duplicate key");
      return real(id, c);
    };
    const s = await runPublishGuides({ store, github: fakeGithub({}), now: NOW }, [
      { fullName: "vikasswebdev/OpenSEO", content: openseoContent },
      { fullName: "acme/other", content: { ...openseoContent, sourceUrls: [`https://github.com/acme/other/blob/${openseoContent.sourceCommitSha}/README.md`] } },
    ]);
    expect(s.processed).toBe(1);
    expect(s.failed).toBe(1);
    expect(store.guides.has("id-acme/other")).toBe(true);
  });

  it("every guide in data/guides passes the checks", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { checkGuide } = await import("@/lib/jobs/guides");
    const files = readdirSync("data/guides").filter((f) => f.endsWith(".json"));
    for (const f of files) {
      const g = JSON.parse(readFileSync(`data/guides/${f}`, "utf8"));
      expect([f, checkGuide(g)]).toEqual([f, []]);
      expect(f).toBe(`${g.fullName.replace("/", "__")}.json`);
    }
  });
});


describe("local writer", () => {
  const SHA = "a".repeat(40);
  const README = [
    "# AgentKit",
    "AgentKit is a Python framework for building LLM agents that call tools. It runs on Python 3.10 or newer.",
    "",
    "## Install",
    "```bash",
    "pip install agentkit",
    "```",
    "## Quick start",
    "```bash",
    "agentkit run hello",
    "```",
    "It prints a greeting from the agent. Set OPENAI_API_KEY to use OpenAI models.",
    "See https://agentkit.dev/docs for more. ".repeat(10),
  ].join("\n");
  const page = (over: Record<string, unknown> = {}) => ({
    summary: "Python framework for building LLM agents that can call tools.",
    type: "Python library",
    whatItDoes: "Lets you build AI agents in Python that call tools.",
    problem: "Wiring a language model to tools by hand takes a lot of glue code.",
    whoFor: ["Python developers", "People learning about AI agents"],
    whyChoose: "It keeps agent code small and readable.",
    requirements: ["Python 3.10 or newer"],
    overview: ["AgentKit is a Python framework for building agents.", "You install it with pip and start an agent from the command line."],
    features: [{ title: "Tools", body: "Agents can call tools." }, { title: "CLI", body: "Run agents from a terminal." }, { title: "OpenAI models", body: "Works with OpenAI when you set a key." }],
    strengths: ["Small API"], limitations: [],
    useCases: [{ title: "Learn agents", body: "Try a first agent in minutes." }],
    prerequisites: ["Python 3.10+"], supportedOs: ["Windows", "macOS", "Linux"],
    install: [{ os: "all", label: "Install with pip", method: "pip", steps: [{ title: "Install", code: "pip install agentkit" }] }],
    environment: [{ name: "OPENAI_API_KEY", required: false, description: "Needed for OpenAI models." }],
    firstRun: [{ title: "Run the hello agent", code: "agentkit run hello" }],
    tutorial: { title: "Your first agent", useCase: "Say hello", setup: ["Install AgentKit"], steps: [{ title: "Run it", code: "agentkit run hello" }], expected: "A greeting from the agent.", nextSteps: ["Read the docs"] },
    costs: [{ label: "Software", value: "Free and open source under MIT.", tone: "free" }],
    troubleshooting: [], bestFor: ["Learning agents"], heroCommands: [{ comment: "Install", command: "pip install agentkit" }],
    ...over,
  });
  const github = (repos: GithubRepo[], readme = README): GithubApi => ({
    calls: 0,
    async getRepoById() { return null; },
    async searchRepos() { return []; },
    async searchPage() { return { total: repos.length, items: repos }; },
    async getHeadSha() { return SHA; },
    async getReadme() { return { path: "README.md", text: readme }; },
  });
  const model = (...replies: unknown[]): LlmClient & { prompts: string[] } => {
    const prompts: string[] = [];
    return { label: "fake", prompts, async complete(_s, u) { prompts.push(u); const r = replies[Math.min(prompts.length - 1, replies.length - 1)]; return typeof r === "string" ? r : JSON.stringify(r); } };
  };
  const opts = (llm: LlmClient) => ({ llm, limit: 5, minStars: 500, pushedSince: "2026-06-01", sleep: async () => {}, searchDelayMs: 0 });

  it("publishes a checked page and skips repos already in the system", async () => {
    const store = new MemStore();
    store.repos = [tracked(1)];
    store.queue.set(2, { github_id: 2, full_name: "o/r2", github_url: "", payload: {}, relevance_score: 0.5, relevance_reasons: [], run_id: null });
    const llm = model("```json\n" + JSON.stringify(page()) + "\n```");
    const res = await runWriter({ store, github: github([gh(1), gh(2), gh(3)]), now: NOW }, opts(llm));
    expect(res.status).toBe("succeeded");
    expect(store.inserted.map((r) => r.github_id)).toEqual([3]); // 1 has a page, 2 was looked at before
    expect(store.inserted[0].status).toBe("draft");
    const guide = store.guides.get("new3") as { sourceCommitSha: string; install: { verification: string }; sourceUrls: string[] };
    expect(guide.sourceCommitSha).toBe(SHA);
    expect(guide.install.verification).toBe("official_docs");
    expect(guide.sourceUrls[0]).toBe(`https://github.com/o/r3/blob/${SHA}/README.md`);
    expect(store.publishedAt.get("new3")).toBe(NOW.toISOString());
    expect(store.repoCategories.some((c) => c.repository_id === "new3")).toBe(true);
    expect(res.details.model).toBe("fake");
  });

  it("asks again with the problems, then remembers a repo whose commands aren't in the README", async () => {
    const store = new MemStore();
    const bad = page({ install: [{ os: "all", label: "Install", method: "pip", steps: [{ title: "Install", code: "pip install agentkit[all]==9.9" }] }] });
    const llm = model(bad);
    const res = await runWriter({ store, github: github([gh(3)]), now: NOW }, opts(llm));
    expect(llm.prompts).toHaveLength(2);
    expect(llm.prompts[1]).toContain("command not in the README: pip install agentkit[all]==9.9");
    expect(store.inserted).toHaveLength(0);
    expect(store.ignored[0].github_id).toBe(3);
    expect(store.ignored[0].notes).toContain("command not in the README");
    expect(res.processed).toBe(0);
  });

  it("fixes a page on the second try", async () => {
    const store = new MemStore();
    const llm = model(page({ overview: ["The best agent framework, used by 10,000 teams."] }), page());
    await runWriter({ store, github: github([gh(3)]), now: NOW }, opts(llm));
    expect(llm.prompts[1]).toMatch(/numbers not in the README: 10,000/);
    expect(llm.prompts[1]).toMatch(/marketing word "best"/);
    expect(store.inserted.map((r) => r.github_id)).toEqual([3]);
  });

  it("remembers a repo the model declined, and leaves model errors for the next run", async () => {
    const store = new MemStore();
    const res = await runWriter({ store, github: github([gh(3)]), now: NOW }, opts(model({ skip: "only a list of papers" })));
    expect(store.ignored[0].notes).toBe("writer: model skipped it: only a list of papers");
    expect(res.processed).toBe(0);

    const store2 = new MemStore();
    const broken: LlmClient = { label: "down", async complete() { throw new Error("connect ECONNREFUSED"); } };
    const res2 = await runWriter({ store: store2, github: github([gh(3), gh(4), gh(5), gh(6)]), now: NOW }, opts(broken));
    expect(store2.ignored).toHaveLength(0);
    expect(res2.status).toBe("partial");
    expect(res2.details.stopped).toMatch(/3 model errors/);
  });

  it("dry run writes nothing to the database and hands the page back", async () => {
    const store = new MemStore();
    const previews: string[] = [];
    const res = await runWriter({ store, github: github([gh(3)]), now: NOW, dryRun: true }, { ...opts(model(page())), onPreview: (g) => previews.push(g.fullName) });
    expect(previews).toEqual(["o/r3"]);
    expect(store.inserted).toHaveLength(0);
    expect(store.runs).toHaveLength(0);
    expect(res.processed).toBe(1);
  });

  it("checks links, OS values and commands line by line", () => {
    const g = buildGuide(gh(3), SHA, "README.md", page({
      overview: ["Docs live at https://agentkit.dev/docs and https://example.com/made-up."],
      install: [{ os: "Ubuntu", label: "Install", method: "pip", steps: [{ title: "Install", code: "$ pip install agentkit\n# then\nagentkit run hello" }] }],
    }), "2026-12-10");
    const p = groundingProblems(g, README, "An LLM agent framework");
    expect(p).toContain("links not in the README: https://example.com/made-up.");
    expect(p.some((x) => x.startsWith("install os must be one of"))).toBe(true);
    expect(p.some((x) => x.startsWith("command not in the README"))).toBe(false);
  });

  it("keeps going with what it found when GitHub search stays rate limited", async () => {
    const store = new MemStore();
    store.listPendingQueue = async () => [{ github_id: 7, full_name: "o/r7", payload: { ...gh(7), owner: "o", github_url: "https://github.com/o/r7", stars: 1500, primary_language: "Python" } as unknown as Record<string, unknown> }];
    const gith = { ...github([]), async searchPage(): Promise<never> { throw new RateLimitError("search"); } };
    const res = await runWriter({ store, github: gith, now: NOW }, opts(model(page())));
    expect(res.details.search_stopped).toMatch(/continuing/);
    expect(store.inserted.map((r) => r.github_id)).toEqual([7]);
  });

  it("doesn't stop early on the per-minute search budget", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ total_count: 0, items: [] }), { status: 200, headers: { "x-ratelimit-remaining": "5", "x-ratelimit-resource": "search" } })) as unknown as typeof fetch;
    await expect(new GithubClient("t", fakeFetch).searchPage("q", 1)).resolves.toEqual({ total: 0, items: [] });
    expect(new GithubClient(undefined).searchesPerMinute).toBe(10);
  });

  it("writes each repo as soon as it's found instead of searching for everything first", async () => {
    const store = new MemStore();
    let searchCalls = 0;
    const gith = { ...github([]), async searchPage() { searchCalls++; return { total: 1, items: [gh(100 + searchCalls)] }; } };
    const res = await runWriter({ store, github: gith, now: NOW }, { ...opts(model(page())), limit: 2 });
    expect(res.processed).toBe(2);
    expect(searchCalls).toBe(2); // stopped searching once 2 pages were published
  });

  it("retries a model call when the connection drops, but not on other errors", async () => {
    let calls = 0;
    const flaky: LlmClient = { label: "flaky", async complete() { if (++calls < 3) throw new TypeError("terminated"); return "ok"; } };
    expect(await completeWithRetry(flaky, "u", async () => {})).toBe("ok");
    expect(calls).toBe(3);
    expect(isTransientLlmError(new Error("LLM 502: bad gateway"))).toBe(true);
    expect(isTransientLlmError(new Error("model ran out of tokens (raise LLM_MAX_TOKENS)"))).toBe(false);
    expect(isTransientLlmError(new Error("LLM 401: invalid key"))).toBe(false);
    const dead: LlmClient = { label: "dead", async complete() { throw new TypeError("terminated"); } };
    await expect(completeWithRetry(dead, "u", async () => {})).rejects.toThrow("terminated");
  });

  it("never picks excluded kinds of repos", () => {
    expect(editoriallyExcluded(gh(1, { full_name: "asgeirtj/system_prompts_leaks", name: "system_prompts_leaks", description: "Collection of system prompts" }))).toBe(true);
    expect(editoriallyExcluded(gh(2, { description: "Free GPT-4 access via reverse engineered API" }))).toBe(true);
    expect(editoriallyExcluded(gh(3, { topics: ["deepfake"] }))).toBe(true);
    expect(editoriallyExcluded(gh(4))).toBe(false);
  });

  it("parses model JSON with chatter around it and cleans READMEs", () => {
    expect(parseModelJson('Sure! Here it is:\n```json\n{"skip":"x"}\n```')).toEqual({ skip: "x" });
    expect(parseModelJson("no json")).toBeNull();
    expect(cleanReadme('[![b](https://x/b.svg)](https://x) <img src="a.png"> Hello\n\n\n\n<p>World</p>', 100)).toBe("Hello\n\nWorld");
  });

  it("reads a streamed OpenAI-compatible answer and picks the provider from the env", async () => {
    const sse = ['data: {"choices":[{"delta":{"content":"{\\"a\\":"}}]}', 'data: {"choices":[{"delta":{"content":"1}"},"finish_reason":"stop"}]}', "data: [DONE]", ""].join("\n");
    let seen: { url: string; auth: string | null; body: { model: string; stream: boolean } } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, auth: new Headers(init.headers).get("authorization"), body: JSON.parse(String(init.body)) };
      return new Response(sse, { status: 200 });
    }) as unknown as typeof fetch;
    const llm = new OpenAiCompatibleLlm("qwen3:32b", "http://localhost:11434/v1/", undefined, 100, fakeFetch);
    expect(await llm.complete("s", "u")).toBe('{"a":1}');
    expect(seen!.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(seen!.auth).toBeNull();
    expect(seen!.body).toMatchObject({ model: "qwen3:32b", stream: true });

    expect(llmFromEnv({ LLM_MODEL: "qwen3", LLM_BASE_URL: "http://localhost:11434/v1" }).label).toBe("openai-compatible:qwen3@localhost:11434");
    expect(llmFromEnv({ LLM_MODEL: "claude-opus-5-5", LLM_API_KEY: "k" }).label).toBe("anthropic:claude-opus-5-5");
    expect(() => llmFromEnv({ LLM_MODEL: "claude-opus-5-5" })).toThrow(/LLM_API_KEY/);
    expect(() => llmFromEnv({})).toThrow(/LLM_MODEL/);
    expect(() => llmFromEnv({ LLM_MODEL: "x", LLM_PROVIDER: "gemini" })).toThrow(/Unknown LLM_PROVIDER/);
  });
});
