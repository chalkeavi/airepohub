import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Category, Repository, RepositoryContent, RepoKind, RepoStatus, Difficulty, OsTarget } from "@/lib/types";

// Supabase backend for src/lib/data. Reads with the publishable key, so Row Level Security
// decides what is visible: anonymous visitors only ever see published rows.

let client: SupabaseClient | null = null;

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

function db(): SupabaseClient {
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Supabase ${what}: ${res.error.message}`);
  return res.data as T;
}

const REPO_COLUMNS =
  "id, github_id, owner, name, full_name, slug, github_url, homepage_url, description, summary, kind, primary_language, license_key, topics, stars, forks, open_issues, avatar_url, is_archived, created_at_github, updated_at_github, last_pushed_at, stats_checked_at, published_at, status, difficulty, featured, repository_categories(is_primary, categories(slug)), repository_content(repository_id)";

interface RepoRow {
  id: string;
  github_id: number;
  owner: string;
  name: string;
  full_name: string;
  slug: string;
  github_url: string;
  homepage_url: string | null;
  description: string | null;
  summary: string | null;
  kind: RepoKind | null;
  primary_language: string | null;
  license_key: string | null;
  topics: string[];
  stars: number;
  forks: number;
  open_issues: number;
  avatar_url: string | null;
  is_archived: boolean;
  created_at_github: string | null;
  updated_at_github: string | null;
  last_pushed_at: string | null;
  stats_checked_at: string | null;
  published_at: string | null;
  status: RepoStatus;
  difficulty: Difficulty | null;
  featured: boolean;
  repository_categories: { is_primary: boolean; categories: { slug: string } | null }[];
  repository_content: { repository_id: string } | { repository_id: string }[] | null;
}

function toRepository(r: RepoRow): Repository {
  const content = Array.isArray(r.repository_content) ? r.repository_content[0] : r.repository_content;
  return {
    id: r.id,
    githubId: Number(r.github_id),
    owner: r.owner,
    name: r.name,
    fullName: r.full_name,
    slug: r.slug,
    githubUrl: r.github_url,
    homepageUrl: r.homepage_url,
    description: r.description,
    summary: r.summary,
    kind: r.kind,
    primaryLanguage: r.primary_language,
    licenseKey: r.license_key,
    topics: r.topics ?? [],
    stars: r.stars,
    forks: r.forks,
    openIssues: r.open_issues,
    avatarUrl: r.avatar_url,
    isArchived: r.is_archived,
    createdAtGithub: r.created_at_github,
    updatedAtGithub: r.updated_at_github,
    lastPushedAt: r.last_pushed_at,
    statsCheckedAt: r.stats_checked_at,
    publishedAt: r.published_at,
    status: r.status,
    difficulty: r.difficulty,
    featured: r.featured,
    categorySlugs: [...(r.repository_categories ?? [])]
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((c) => c.categories?.slug)
      .filter((s): s is string => !!s),
    hasFullContent: Boolean(content),
  };
}

// Every query below fetches only what one page shows. The site never loads the whole catalog:
// at thousands of repos that would exceed the Workers CPU limit and PostgREST's 1,000-row cap.

export async function fetchCategories(): Promise<Category[]> {
  const cats = await db().from("categories").select("slug, name, description, icon").order("sort_order");
  return check(cats, "categories").map((c) => ({ ...c, description: c.description ?? "", icon: c.icon ?? "sparkles" }));
}

export interface RepoQuery {
  category?: string;
  language?: string;
  difficulty?: string;
  featured?: boolean;
  slugs?: string[];
  excludeSlug?: string;
  order?: "stars" | "recent";
  limit: number;
  offset?: number;
  /** One query term per entry; each must match name, summary, description, topics or the full-text index. */
  terms?: string[];
  nameTerms?: string[];
  count?: boolean;
  columns?: string;
}

/** Strip characters that have meaning in PostgREST filter syntax. */
export function safeTerm(t: string): string {
  return t.replace(/[^\p{L}\p{N}.+#_-]/gu, "").slice(0, 40);
}

function repoQuery(q: RepoQuery) {
  const columns = (q.columns ?? REPO_COLUMNS) + (q.category ? ", cat_filter:repository_categories!inner(categories!inner(slug))" : "");
  let query = db()
    .from("repositories")
    .select(columns, q.count ? { count: "exact" } : undefined)
    .eq("status", "published");
  if (q.category) query = query.eq("cat_filter.categories.slug", q.category);
  if (q.language) query = query.eq("primary_language", q.language);
  if (q.difficulty) query = query.eq("difficulty", q.difficulty);
  if (q.featured) query = query.eq("featured", true);
  if (q.slugs) query = query.in("slug", q.slugs);
  if (q.excludeSlug) query = query.neq("slug", q.excludeSlug);
  for (const t of q.nameTerms ?? []) query = query.ilike("name", `%${t}%`);
  for (const t of q.terms ?? []) {
    query = query.or(
      `name.ilike.*${t}*,summary.ilike.*${t}*,description.ilike.*${t}*,topics.cs.{${t}},search_vector.wfts(english).${t}`,
    );
  }
  query =
    q.order === "recent"
      ? query.order("published_at", { ascending: false }).order("created_at_github", { ascending: false })
      : query.order("stars", { ascending: false });
  return query.order("id").range(q.offset ?? 0, (q.offset ?? 0) + q.limit - 1);
}

export async function fetchRepos(q: RepoQuery): Promise<{ total: number; repositories: Repository[] }> {
  const res = await repoQuery(q);
  const rows = check(res, "repositories") as unknown as RepoRow[];
  return { total: res.count ?? rows.length, repositories: rows.map(toRepository) };
}

export async function fetchRepoBySlug(slug: string): Promise<Repository | null> {
  const res = await db().from("repositories").select(REPO_COLUMNS).eq("slug", slug).eq("status", "published").maybeSingle();
  const row = check(res, "repository") as unknown as RepoRow | null;
  return row ? toRepository(row) : null;
}

/** Published repos, optionally within a category (head-only count, no rows transferred). */
export async function fetchPublishedCount(categorySlug?: string): Promise<number> {
  let query = db()
    .from("repositories")
    .select(categorySlug ? "id, cat_filter:repository_categories!inner(categories!inner(slug))" : "id", { count: "exact", head: true })
    .eq("status", "published");
  if (categorySlug) query = query.eq("cat_filter.categories.slug", categorySlug);
  const res = await query;
  if (res.error) throw new Error(`Supabase count: ${res.error.message}`);
  return res.count ?? 0;
}

/** Pages through a light projection of every published repo (sitemap, languages). */
async function allLight<T>(columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = check(
      await db().from("repositories").select(columns).eq("status", "published").order("id").range(from, from + 999),
      "repositories",
    ) as unknown as T[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

/** Most common languages first (the search filter shows only the top ones). */
export async function fetchLanguageCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const r of await allLight<{ primary_language: string | null }>("primary_language")) {
    if (r.primary_language) counts.set(r.primary_language, (counts.get(r.primary_language) ?? 0) + 1);
  }
  return counts;
}

export async function fetchSitemapRows(): Promise<{ slug: string; lastModified: string | null; noindex: boolean }[]> {
  const rows = await allLight<{ slug: string; published_at: string | null; stats_checked_at: string | null; seo_metadata: { noindex: boolean } | { noindex: boolean }[] | null }>(
    "slug, published_at, stats_checked_at, seo_metadata(noindex)",
  );
  return rows.map((r) => {
    const seo = Array.isArray(r.seo_metadata) ? r.seo_metadata[0] : r.seo_metadata;
    const dates = [r.published_at, r.stats_checked_at].filter((d): d is string => !!d).sort();
    return { slug: r.slug, lastModified: dates.at(-1) ?? null, noindex: Boolean(seo?.noindex) };
  });
}

/** Latest GitHub refresh time across published repos. */
export async function fetchLatestStatsCheck(): Promise<string | null> {
  const res = await db()
    .from("repositories")
    .select("stats_checked_at")
    .eq("status", "published")
    .not("stats_checked_at", "is", null)
    .order("stats_checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (check(res, "stats as of") as { stats_checked_at: string } | null)?.stats_checked_at ?? null;
}

/** Latest snapshot of a period's board for a category (null = global), top `limit`. */
export async function fetchRanking(
  period: "weekly" | "monthly" | "all_time",
  categorySlug: string | null,
  limit: number,
): Promise<{ calculatedAt: string | null; signalsUsed: string[]; rows: { slug: string; rank: number; score: number; starGrowth: number | null; previousRank: number | null }[] }> {
  let categoryId: string | null = null;
  if (categorySlug) {
    const cat = check(await db().from("categories").select("id").eq("slug", categorySlug).maybeSingle(), "category") as { id: string } | null;
    if (!cat) return { calculatedAt: null, signalsUsed: [], rows: [] };
    categoryId = cat.id;
  }
  const snapshots = (columns: string) => {
    const base = db().from("ranking_snapshots").select(columns).eq("period", period);
    return categoryId ? base.eq("category_id", categoryId) : base.is("category_id", null);
  };

  const latest = check(
    await snapshots("calculated_at").order("calculated_at", { ascending: false }).limit(1).maybeSingle(),
    "latest ranking",
  ) as unknown as { calculated_at: string } | null;
  if (!latest) return { calculatedAt: null, signalsUsed: [], rows: [] };

  const rows = check(
    await snapshots("rank, ranking_score, star_growth, previous_rank, signals, repositories(slug)")
      .eq("calculated_at", latest.calculated_at)
      .order("rank")
      .limit(limit),
    "ranking",
  ) as unknown as {
    rank: number;
    ranking_score: number;
    star_growth: number | null;
    previous_rank: number | null;
    signals: Record<string, number>;
    repositories: { slug: string } | null;
  }[];

  return {
    calculatedAt: latest.calculated_at,
    signalsUsed: rows[0] ? Object.keys(rows[0].signals ?? {}) : [],
    rows: rows
      .filter((r) => r.repositories)
      .map((r) => ({
        slug: r.repositories!.slug,
        rank: r.rank,
        score: Number(r.ranking_score),
        starGrowth: r.star_growth,
        previousRank: r.previous_rank,
      })),
  };
}

type Json = Record<string, unknown>;

export async function fetchContent(slug: string): Promise<RepositoryContent | null> {
  const res = await db()
    .from("repositories")
    .select(
      "id, repository_content(*), installation_guides(operating_system, method, label, sort_order, prerequisites, instructions, environment, expected_output, verification_status, source_url, status), tutorials(title, content, source_url, status, created_at)",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  const row = check(res, "content") as unknown as {
    repository_content: Json | Json[] | null;
    installation_guides: Json[];
    tutorials: Json[];
  } | null;
  if (!row) return null;
  const c = (Array.isArray(row.repository_content) ? row.repository_content[0] : row.repository_content) as Json | undefined;
  if (!c) return null;

  const guides = (row.installation_guides ?? [])
    .filter((g) => g.status === "published")
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
  const tutorial = (row.tutorials ?? []).filter((t) => t.status === "published").sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
  const meta = (c.install_meta ?? {}) as Json;
  const first = guides[0];
  const tc = (tutorial?.content ?? {}) as Json;

  return {
    sourceUrls: (c.source_urls as string[]) ?? [],
    sourceCommitSha: (c.source_commit_sha as string | null) ?? null,
    lastReviewedAt: (c.last_reviewed_at as string) ?? "",
    heroCommands: (c.hero_commands as RepositoryContent["heroCommands"]) ?? [],
    sixtySeconds: c.sixty_seconds as RepositoryContent["sixtySeconds"],
    overview: (c.overview as string[]) ?? [],
    features: (c.features as RepositoryContent["features"]) ?? [],
    strengths: (c.strengths as string[]) ?? [],
    limitations: (c.limitations as string[]) ?? [],
    useCases: (c.use_cases as RepositoryContent["useCases"]) ?? [],
    install: {
      // Shown as the weakest status across guides, so one unverified guide is never hidden.
      verification: guides.some((g) => g.verification_status === "awaiting_verification")
        ? "awaiting_verification"
        : guides.some((g) => g.verification_status === "official_docs")
          ? "official_docs"
          : first
            ? "verified"
            : "awaiting_verification",
      verificationNote: (meta.verificationNote as string) ?? "",
      sourceUrl: (meta.sourceUrl as string) ?? (first?.source_url as string) ?? "",
      prerequisites: (first?.prerequisites as string[]) ?? [],
      supportedOs: (meta.supportedOs as string[]) ?? [],
      guides: guides.map((g) => ({
        os: g.operating_system as OsTarget,
        label: (g.label as string) ?? String(g.operating_system),
        method: g.method as string,
        steps: (g.instructions as RepositoryContent["install"]["guides"][number]["steps"]) ?? [],
      })),
      environment: (first?.environment as RepositoryContent["install"]["environment"]) ?? [],
      firstRun: (meta.firstRun as RepositoryContent["install"]["firstRun"]) ?? [],
      expectedOutput: (first?.expected_output as string | null) ?? null,
    },
    tutorial: {
      title: (tutorial?.title as string) ?? "",
      useCase: (tc.useCase as string) ?? "",
      setup: (tc.setup as string[]) ?? [],
      steps: (tc.steps as RepositoryContent["tutorial"]["steps"]) ?? [],
      expected: (tc.expected as string) ?? "",
      nextSteps: (tc.nextSteps as string[]) ?? [],
      sourceUrl: (tutorial?.source_url as string) ?? "",
    },
    costs: (Array.isArray(c.costs) ? c.costs : []) as RepositoryContent["costs"],
    troubleshooting: (c.troubleshooting as RepositoryContent["troubleshooting"]) ?? [],
    bestFor: (c.best_for as string[]) ?? [],
    facts: (c.facts as RepositoryContent["facts"]) ?? [],
  };
}


export interface SeoOverride {
  title: string | null;
  description: string | null;
  noindex: boolean;
}

/** Editor-set title/description/noindex for a published repo (seo_metadata), if any. */
export async function fetchSeoOverride(slug: string): Promise<SeoOverride | null> {
  const res = await db()
    .from("repositories")
    .select("seo_metadata(title, description, noindex)")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  const row = check(res, "seo") as unknown as { seo_metadata: SeoOverride | SeoOverride[] | null } | null;
  const seo = Array.isArray(row?.seo_metadata) ? row?.seo_metadata[0] : row?.seo_metadata;
  return seo ?? null;
}
