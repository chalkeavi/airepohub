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
  knownGithubIds(): Promise<{ repositories: Set<number>; queue: Set<number> }>;
  insertQueue(rows: QueueRow[]): Promise<void>;
  touchQueue(githubIds: number[], seenAt: string): Promise<void>;
  startRun(job: string): Promise<string | null>;
  finishRun(id: string | null, result: RunResult): Promise<void>;
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

  async listTrackedRepos(): Promise<TrackedRepo[]> {
    const rows = check(
      await this.db
        .from("repositories")
        .select("id, github_id, owner, name, full_name, slug, status, stars, forks, last_pushed_at, docs_quality, repository_categories(category_id)")
        .neq("status", "rejected"),
      "repositories",
    ) as unknown as {
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
    const repos = check(await this.db.from("repositories").select("github_id"), "repo ids") as { github_id: number }[];
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
