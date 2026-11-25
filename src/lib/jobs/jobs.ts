// The three scheduled jobs. Each is idempotent for a given day and logs one automation_runs row.
//  - snapshot: refresh GitHub metadata for tracked repos and store today's star counts
//  - rank:     write weekly / monthly / all-time ranking snapshots (global + per category)
//  - discover: search GitHub for AI repos and queue new ones for admin review (never publishes)
import { rankRepositories, type RankingInput } from "../ranking.ts";
import { RateLimitError, type GithubApi, type GithubRepo } from "./github.ts";
import { isoDay, starGrowth, type StatPoint } from "./growth.ts";
import { discoveryQueries, scoreRelevance } from "./relevance.ts";
import { withoutKeys, type JobStore, type Period, type QueueRow, type RankingRow, type RepoUpdate, type TrackedRepo } from "./store.ts";

export interface JobContext {
  store: JobStore;
  github: GithubApi;
  now: Date;
  dryRun?: boolean;
  log?: (msg: string) => void;
}

export interface JobSummary {
  job: string;
  status: "succeeded" | "failed" | "partial";
  processed: number;
  failed: number;
  apiCalls: number;
  details: Record<string, unknown>;
  error?: string;
}

export async function runLogged(
  ctx: JobContext,
  job: string,
  body: (details: Record<string, unknown>) => Promise<{ processed: number; failed: number }>,
): Promise<JobSummary> {
  const runId = ctx.dryRun ? null : await ctx.store.startRun(job);
  const startCalls = ctx.github.calls;
  const details: Record<string, unknown> = {};
  let summary: JobSummary;
  try {
    const { processed, failed } = await body(details);
    summary = { job, status: failed ? "partial" : "succeeded", processed, failed, apiCalls: ctx.github.calls - startCalls, details };
  } catch (e) {
    const partial = e instanceof RateLimitError;
    summary = {
      job,
      status: partial ? "partial" : "failed",
      processed: Number(details.processed ?? 0),
      failed: Number(details.failed ?? 0),
      apiCalls: ctx.github.calls - startCalls,
      details,
      error: e instanceof Error ? e.message : String(e),
    };
  }
  if (!ctx.dryRun) {
    await ctx.store.finishRun(runId, {
      status: summary.status,
      items_processed: summary.processed,
      items_failed: summary.failed,
      api_calls: summary.apiCalls,
      error: summary.error ?? null,
      details: summary.details,
    });
  }
  ctx.log?.(`${job}: ${summary.status} (${summary.processed} ok, ${summary.failed} failed, ${summary.apiCalls} API calls)${summary.error ? ` — ${summary.error}` : ""}`);
  return summary;
}

export function toRepoUpdate(g: GithubRepo, checkedAt: string): RepoUpdate {
  return {
    owner: g.owner.login,
    name: g.name,
    full_name: g.full_name,
    github_url: g.html_url,
    homepage_url: g.homepage || null,
    description: g.description,
    primary_language: g.language,
    license_key: g.license?.spdx_id ?? null,
    topics: g.topics ?? [],
    stars: g.stargazers_count,
    forks: g.forks_count,
    open_issues: g.open_issues_count,
    avatar_url: g.owner.avatar_url,
    is_archived: g.archived,
    default_branch: g.default_branch,
    updated_at_github: g.updated_at,
    last_pushed_at: g.pushed_at,
    stats_checked_at: checkedAt,
  };
}

/** Refresh metadata and record today's stars for every tracked repository. */
export function runSnapshot(ctx: JobContext): Promise<JobSummary> {
  return runLogged(ctx, "snapshot", async (details) => {
    const repos = await ctx.store.listTrackedRepos();
    const checkedAt = ctx.now.toISOString();
    const today = isoDay(ctx.now);
    const stats: Parameters<JobStore["upsertStats"]>[0] = [];
    let processed = 0;
    let failed = 0;
    const missing: string[] = [];
    const renamed: string[] = [];
    const updates: (RepoUpdate & { id: string; github_id: number; slug: string })[] = [];
    try {
      // GraphQL fetches 100 repos per call (thousands of tracked repos would exhaust REST's
      // 1,000/hour Actions limit). Anything GraphQL can't resolve falls back to REST by id.
      for (let i = 0; i < repos.length; i += 100) {
        const chunk = repos.slice(i, i + 100);
        let batch = new Map<number, GithubRepo>();
        if (ctx.github.getReposBatch) {
          try {
            batch = await ctx.github.getReposBatch(chunk.map((r) => ({ githubId: r.githubId, fullName: r.fullName })));
          } catch (e) {
            if (e instanceof RateLimitError) throw e;
            ctx.log?.(`snapshot batch ${i}: ${e instanceof Error ? e.message : e}; falling back to REST`);
          }
        }
        for (const repo of chunk) {
          try {
            const g = batch.get(repo.githubId) ?? (await ctx.github.getRepoById(repo.githubId));
            if (!g) {
              missing.push(repo.fullName); // deleted, private or blocked: keep the row, flag it
              failed++;
              continue;
            }
            if (g.full_name.toLowerCase() !== repo.fullName.toLowerCase()) {
              renamed.push(`${repo.fullName} → ${g.full_name}`);
              if (!ctx.dryRun) await ctx.store.addAlias(repo.id, repo.fullName);
            }
            updates.push({ ...toRepoUpdate(g, checkedAt), id: repo.id, github_id: repo.githubId, slug: repo.slug });
            stats.push({ repository_id: repo.id, recorded_on: today, recorded_at: checkedAt, stars: g.stargazers_count, forks: g.forks_count, open_issues: g.open_issues_count });
            processed++;
          } catch (e) {
            if (e instanceof RateLimitError) throw e;
            failed++;
            ctx.log?.(`snapshot ${repo.fullName}: ${e instanceof Error ? e.message : e}`);
          }
        }
      }
    } finally {
      // Keep what we fetched even if the rate limit stopped us part-way.
      if (!ctx.dryRun) {
        if (ctx.store.updateRepos) await ctx.store.updateRepos(updates);
        else for (const row of updates) await ctx.store.updateRepo(row.id, withoutKeys(row));
        await ctx.store.upsertStats(stats);
      }
      Object.assign(details, { processed, failed, tracked: repos.length, missing, renamed, recorded_on: today });
    }
    return { processed, failed };
  });
}

export const BOARD_SIZE = 100;

const WINDOW: Record<Exclude<Period, "all_time">, number> = { weekly: 7, monthly: 30 };

/**
 * Build ranking rows for one candidate pool. Weekly/monthly only include repos with a snapshot
 * old enough to measure real growth; with fewer than 3 such repos the board is not written and
 * the site keeps its "not enough history" empty state.
 */
export function buildRankings(
  pool: TrackedRepo[],
  history: Map<string, StatPoint[]>,
  previous: Map<string, number>,
  period: Period,
  categoryId: string | null,
  now: Date,
): RankingRow[] {
  const calculatedAt = now.toISOString();
  let inputs: (RankingInput & { growth?: number })[] = pool.map((r) => ({
    id: r.id,
    stars: r.stars,
    forks: r.forks,
    lastPushedAt: r.lastPushedAt,
    docsQuality: r.docsQuality ?? undefined,
  }));
  if (period !== "all_time") {
    inputs = inputs
      .map((i) => ({ ...i, starGrowth: starGrowth(history.get(i.id) ?? [], i.stars, now, WINDOW[period]) }))
      .filter((i) => i.starGrowth !== undefined);
    if (inputs.length < 3) return [];
  }
  // Only the top of each board is stored: pages show 10 (Trending reads up to 100), and storing
  // every repo daily on every board would fill the free database within months.
  const results = rankRepositories(inputs, now).results.slice(0, BOARD_SIZE);
  const growthById = new Map(inputs.map((i) => [i.id, i.starGrowth]));
  return results.map((r) => ({
    repository_id: r.id,
    period,
    category_id: categoryId,
    calculated_at: calculatedAt,
    ranking_score: r.score,
    rank: r.rank,
    previous_rank: previous.get(r.id) ?? null,
    star_growth: growthById.get(r.id) ?? null,
    signals: r.signals as Record<string, number>,
    methodology_version: "v1",
  }));
}

export function runRank(ctx: JobContext): Promise<JobSummary> {
  return runLogged(ctx, "rank", async (details) => {
    const all = await ctx.store.listTrackedRepos();
    const published = all.filter((r) => r.status === "published");
    const since = isoDay(new Date(ctx.now.getTime() - 40 * 86_400_000));
    const history = new Map<string, StatPoint[]>();
    for (const p of await ctx.store.statsSince(since)) {
      const list = history.get(p.repositoryId) ?? [];
      list.push(p);
      history.set(p.repositoryId, list);
    }
    const categoryIds = [...new Set(published.flatMap((r) => r.categoryIds))];
    const scopes: (string | null)[] = [null, ...categoryIds];
    const rows: RankingRow[] = [];
    const written: Record<string, number> = {};
    for (const period of ["weekly", "monthly", "all_time"] as Period[]) {
      for (const cat of scopes) {
        const pool = cat ? published.filter((r) => r.categoryIds.includes(cat)) : published;
        if (!pool.length) continue;
        const previous = await ctx.store.latestRanking(period, cat);
        const board = buildRankings(pool, history, previous, period, cat, ctx.now);
        rows.push(...board);
        if (board.length) written[`${period}:${cat ?? "global"}`] = board.length;
      }
    }
    if (!ctx.dryRun) await ctx.store.insertRankings(rows);
    Object.assign(details, { boards: written, published: published.length });
    return { processed: rows.length, failed: 0 };
  });
}

export function runDiscover(ctx: JobContext, maxNew = 50): Promise<JobSummary> {
  return runLogged(ctx, "discover", async (details) => {
    const known = await ctx.store.knownGithubIds();
    const since = isoDay(new Date(ctx.now.getTime() - 90 * 86_400_000));
    const seenInQueue = new Set<number>();
    const fresh = new Map<number, QueueRow>();
    let skipped = 0;
    let searched = 0;
    try {
      for (const q of discoveryQueries(since)) {
        const items = await ctx.github.searchRepos(q, 50);
        searched++;
        for (const g of items) {
          if (known.repositories.has(g.id)) continue; // already on the site (or a draft)
          if (known.queue.has(g.id)) {
            seenInQueue.add(g.id);
            continue;
          }
          if (fresh.has(g.id)) continue;
          const rel = scoreRelevance(g, ctx.now);
          if (!rel.eligible) {
            skipped++;
            continue;
          }
          fresh.set(g.id, {
            github_id: g.id,
            full_name: g.full_name,
            github_url: g.html_url,
            payload: { ...toRepoUpdate(g, ctx.now.toISOString()), github_id: g.id, created_at_github: g.created_at },
            relevance_score: rel.score,
            relevance_reasons: rel.reasons,
            run_id: null,
          });
        }
      }
    } finally {
      // Highest relevance first, capped per run so reviewers aren't flooded.
      const toInsert = [...fresh.values()].sort((a, b) => b.relevance_score - a.relevance_score).slice(0, maxNew);
      if (!ctx.dryRun) {
        await ctx.store.insertQueue(toInsert);
        await ctx.store.touchQueue([...seenInQueue], ctx.now.toISOString());
      }
      Object.assign(details, {
        processed: toInsert.length,
        queries: searched,
        queued: toInsert.map((r) => `${r.full_name} (${r.relevance_score})`),
        already_queued: seenInQueue.size,
        not_relevant: skipped,
      });
    }
    return { processed: Number(details.processed), failed: 0 };
  });
}
