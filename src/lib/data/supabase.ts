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

export async function fetchCatalog(): Promise<{ categories: Category[]; repositories: Repository[] }> {
  const [cats, repos] = await Promise.all([
    db().from("categories").select("slug, name, description, icon").order("sort_order"),
    db().from("repositories").select(REPO_COLUMNS).eq("status", "published"),
  ]);
  return {
    categories: check(cats, "categories").map((c) => ({ ...c, description: c.description ?? "", icon: c.icon ?? "sparkles" })),
    repositories: (check(repos, "repositories") as unknown as RepoRow[]).map(toRepository),
  };
}

/** Slugs of published repos whose full-text vector matches the query (websearch syntax). */
export async function fetchSearchMatches(q: string): Promise<Set<string>> {
  const res = await db()
    .from("repositories")
    .select("slug")
    .eq("status", "published")
    .textSearch("search_vector", q, { type: "websearch", config: "english" });
  return new Set(check(res, "search").map((r) => r.slug));
}

/** Latest all-time snapshot for a category (null = global), top `limit`. */
export async function fetchAllTimeRanking(
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
    const base = db().from("ranking_snapshots").select(columns).eq("period", "all_time");
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
