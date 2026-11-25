// Storage used by the scheduled jobs. The Supabase implementation uses the service-role key
// (bypasses RLS) and only runs inside GitHub Actions. Tests use an in-memory implementation.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { StatPoint } from "./growth.ts";

export type Period = "weekly" | "monthly" | "all_time";

export interface TrackedRepo {
  id: string;
  githubId: number;
  owner: string;
  name: string;
  fullName: string;
  slug: string;
  status: string;
  stars: number;
  forks: number;
  lastPushedAt: string | null;
  docsQuality: number | null;
  categoryIds: string[];
}

export interface RepoUpdate {
  owner: string;
  name: string;
  full_name: string;
  github_url: string;
  homepage_url: string | null;
  description: string | null;
  primary_language: string | null;
  license_key: string | null;
  topics: string[];
  stars: number;
  forks: number;
  open_issues: number;
  avatar_url: string;
  is_archived: boolean;
  default_branch: string;
  updated_at_github: string;
  last_pushed_at: string | null;
  stats_checked_at: string;
}

export interface RankingRow {
  repository_id: string;
  period: Period;
  category_id: string | null;
  calculated_at: string;
  ranking_score: number;
  rank: number;
  previous_rank: number | null;
  star_growth: number | null;
  signals: Record<string, number>;
  methodology_version: string;
}

export interface QueueRow {
  github_id: number;
  full_name: string;
  github_url: string;
  payload: Record<string, unknown>;
  relevance_score: number;
  relevance_reasons: string[];
  run_id: string | null;
}

/** A new published repository row written by the import job (real GitHub fields only). */
export interface NewRepoRow extends RepoUpdate {
  github_id: number;
  slug: string;
  created_at_github: string | null;
  status: "published";
  published_at: string;
  discovered_at: string;
}

export interface RunResult {
  status: "succeeded" | "failed" | "partial";
  items_processed: number;
  items_failed: number;
  api_calls: number;
  error?: string | null;
  details?: Record<string, unknown>;
}

export interface JobStore {
  listTrackedRepos(): Promise<TrackedRepo[]>;
  updateRepo(id: string, update: RepoUpdate): Promise<void>;
  addAlias(repositoryId: string, oldFullName: string): Promise<void>;
  upsertStats(rows: { repository_id: string; recorded_on: string; recorded_at: string; stars: number; forks: number; open_issues: number }[]): Promise<void>;
  statsSince(sinceDay: string): Promise<StatPoint[]>;
  latestRanking(period: Period, categoryId: string | null): Promise<Map<string, number>>;
  insertRankings(rows: RankingRow[]): Promise<void>;
  /** Batched metadata refresh (one request per chunk instead of one per repo). Optional for tests. */
  updateRepos?(rows: (RepoUpdate & { id: string; github_id: number; slug: string })[]): Promise<void>;
  knownGithubIds(): Promise<{ repositories: Set<number>; queue: Set<number> }>;
  insertQueue(rows: QueueRow[]): Promise<void>;
  touchQueue(githubIds: number[], seenAt: string): Promise<void>;
  knownSlugs(): Promise<Set<string>>;
  categoryIds(): Promise<Map<string, string>>;
  insertRepositories(rows: NewRepoRow[]): Promise<{ id: string; github_id: number }[]>;
  insertRepoCategories(rows: { repository_id: string; category_id: string; is_primary: boolean }[]): Promise<void>;
  /** Hide pages from search engines (seo_metadata.noindex) until they get reviewed content. */
  setNoindex(repositoryIds: string[]): Promise<void>;
  markQueueApproved(githubIds: number[]): Promise<void>;
  startRun(job: string): Promise<string | null>;
  finishRun(id: string | null, result: RunResult): Promise<void>;
}

/** The RepoUpdate part of a batched row (drops the keys used only for the upsert). */
export function withoutKeys(row: RepoUpdate & { id: string; github_id: number; slug: string }): RepoUpdate {
  const update: Partial<typeof row> = { ...row };
  delete update.id;
  delete update.github_id;
  delete update.slug;
  return update as RepoUpdate;
}

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Supabase ${what}: ${res.error.message}`);
  return res.data as T;
}

export class SupabaseJobStore implements JobStore {
  private db: SupabaseClient;
  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  /** PostgREST returns at most 1,000 rows per request, so every full-table read pages. */
  private async all<T>(what: string, page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += 1000) {
      const rows = check((await page(from, from + 999)) as { data: T[] | null; error: { message: string } | null }, what);
      out.push(...rows);
      if (rows.length < 1000) return out;
    }
  }

  async listTrackedRepos(): Promise<TrackedRepo[]> {
    const rows = (await this.all("repositories", (from, to) =>
      this.db
        .from("repositories")
        .select("id, github_id, owner, name, full_name, slug, status, stars, forks, last_pushed_at, docs_quality, repository_categories(category_id)")
        .neq("status", "rejected")
        .order("id")
        .range(from, to),
    )) as unknown as {
      id: string; github_id: number; owner: string; name: string; full_name: string; slug: string; status: string;
      stars: number; forks: number; last_pushed_at: string | null; docs_quality: number | null;
      repository_categories: { category_id: string }[];
    }[];
    return rows.map((r) => ({
      id: r.id,
      githubId: Number(r.github_id),
      owner: r.owner,
      name: r.name,
      fullName: r.full_name,
      slug: r.slug,
      status: r.status,
      stars: r.stars,
      forks: r.forks,
      lastPushedAt: r.last_pushed_at,
      docsQuality: r.docs_quality == null ? null : Number(r.docs_quality),
      categoryIds: (r.repository_categories ?? []).map((c) => c.category_id),
    }));
  }

  async updateRepo(id: string, update: RepoUpdate) {
    check(await this.db.from("repositories").update(update).eq("id", id), "update repository");
  }

  async updateRepos(rows: (RepoUpdate & { id: string; github_id: number; slug: string })[]) {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const res = await this.db.from("repositories").upsert(chunk, { onConflict: "id" });
      if (res.error) {
        // One bad row (e.g. a name swap hitting a unique key) shouldn't lose the whole chunk.
        for (const row of chunk) await this.updateRepo(row.id, withoutKeys(row));
      }
    }
  }

  async addAlias(repositoryId: string, oldFullName: string) {
    check(
      await this.db
        .from("repository_aliases")
        .upsert({ repository_id: repositoryId, alias_full_name: oldFullName }, { onConflict: "alias_full_name", ignoreDuplicates: true }),
      "alias",
    );
  }

  async upsertStats(rows: Parameters<JobStore["upsertStats"]>[0]) {
    if (!rows.length) return;
    check(await this.db.from("repository_stats").upsert(rows, { onConflict: "repository_id,recorded_on" }), "stats");
  }

  async statsSince(sinceDay: string): Promise<StatPoint[]> {
    const out: StatPoint[] = [];
    for (let from = 0; ; from += 1000) {
      const rows = check(
        await this.db
          .from("repository_stats")
          .select("repository_id, recorded_on, stars")
          .gte("recorded_on", sinceDay)
          .order("id")
          .range(from, from + 999),
        "stats history",
      ) as { repository_id: string; recorded_on: string; stars: number }[];
      out.push(...rows.map((r) => ({ repositoryId: r.repository_id, recordedOn: r.recorded_on, stars: r.stars })));
      if (rows.length < 1000) return out;
    }
  }

  async latestRanking(period: Period, categoryId: string | null): Promise<Map<string, number>> {
    const scoped = (cols: string) => {
      const q = this.db.from("ranking_snapshots").select(cols).eq("period", period);
      return categoryId ? q.eq("category_id", categoryId) : q.is("category_id", null);
    };
    const latest = check(
      await scoped("calculated_at").order("calculated_at", { ascending: false }).limit(1).maybeSingle(),
      "latest ranking",
    ) as unknown as { calculated_at: string } | null;
    if (!latest) return new Map();
    const rows = check(await scoped("repository_id, rank").eq("calculated_at", latest.calculated_at), "ranking") as unknown as {
      repository_id: string;
      rank: number;
    }[];
    return new Map(rows.map((r) => [r.repository_id, r.rank]));
  }

  async insertRankings(rows: RankingRow[]) {
    for (let i = 0; i < rows.length; i += 500) {
      check(await this.db.from("ranking_snapshots").insert(rows.slice(i, i + 500)), "insert rankings");
    }
  }

  async knownGithubIds() {
    const repos = await this.all<{ github_id: number }>("repo ids", (from, to) =>
      this.db.from("repositories").select("github_id").order("github_id").range(from, to),
    );
    const queue: { github_id: number }[] = [];
    for (let from = 0; ; from += 1000) {
      const page = check(await this.db.from("discovery_queue").select("github_id").order("github_id").range(from, from + 999), "queue ids") as {
        github_id: number;
      }[];
      queue.push(...page);
      if (page.length < 1000) break;
    }
    return { repositories: new Set(repos.map((r) => Number(r.github_id))), queue: new Set(queue.map((r) => Number(r.github_id))) };
  }

  async insertQueue(rows: QueueRow[]) {
    if (!rows.length) return;
    check(await this.db.from("discovery_queue").upsert(rows, { onConflict: "github_id", ignoreDuplicates: true }), "queue insert");
  }

  async touchQueue(githubIds: number[], seenAt: string) {
    if (!githubIds.length) return;
    check(await this.db.from("discovery_queue").update({ last_seen_at: seenAt }).in("github_id", githubIds), "queue touch");
  }

  async knownSlugs() {
    const repos = await this.all<{ slug: string }>("slugs", (from, to) => this.db.from("repositories").select("slug").order("slug").range(from, to));
    const aliases = await this.all<{ alias_slug: string | null }>("alias slugs", (from, to) =>
      this.db.from("repository_aliases").select("alias_slug").order("id").range(from, to),
    );
    return new Set([...repos.map((r) => r.slug), ...aliases.map((a) => a.alias_slug).filter((s): s is string => !!s)]);
  }

  async categoryIds() {
    const rows = check(await this.db.from("categories").select("id, slug"), "categories") as { id: string; slug: string }[];
    return new Map(rows.map((r) => [r.slug, r.id]));
  }

  async insertRepositories(rows: NewRepoRow[]) {
    const out: { id: string; github_id: number }[] = [];
    for (let i = 0; i < rows.length; i += 500) {
      const res = check(await this.db.from("repositories").insert(rows.slice(i, i + 500)).select("id, github_id"), "insert repositories") as {
        id: string;
        github_id: number;
      }[];
      out.push(...res.map((r) => ({ id: r.id, github_id: Number(r.github_id) })));
    }
    return out;
  }

  async insertRepoCategories(rows: { repository_id: string; category_id: string; is_primary: boolean }[]) {
    for (let i = 0; i < rows.length; i += 1000) {
      check(
        await this.db.from("repository_categories").upsert(rows.slice(i, i + 1000), { onConflict: "repository_id,category_id", ignoreDuplicates: true }),
        "repository categories",
      );
    }
  }

  async setNoindex(repositoryIds: string[]) {
    for (let i = 0; i < repositoryIds.length; i += 1000) {
      const rows = repositoryIds.slice(i, i + 1000).map((repository_id) => ({ repository_id, noindex: true }));
      check(await this.db.from("seo_metadata").upsert(rows, { onConflict: "repository_id" }), "seo noindex");
    }
  }

  async markQueueApproved(githubIds: number[]) {
    for (let i = 0; i < githubIds.length; i += 500) {
      check(await this.db.from("discovery_queue").update({ status: "approved" }).in("github_id", githubIds.slice(i, i + 500)), "queue approve");
    }
  }

  async startRun(job: string) {
    const row = check(await this.db.from("automation_runs").insert({ job }).select("id").single(), "start run") as { id: string };
    return row.id;
  }

  async finishRun(id: string | null, result: RunResult) {
    if (!id) return;
    check(
      await this.db
        .from("automation_runs")
        .update({ ...result, details: result.details ?? {}, finished_at: new Date().toISOString() })
        .eq("id", id),
      "finish run",
    );
  }
}
