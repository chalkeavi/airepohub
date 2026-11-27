import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { rankRepositories } from "@/lib/ranking";
import type {
  Category,
  Leaderboard,
  RankingPeriod,
  Repository,
  RepositoryContent,
} from "@/lib/types";
import { sampleCategories } from "./sample/categories";
import { sampleRepositories } from "./sample/repositories";
import { openseoContent } from "./sample/content/openseo";
import {
  fetchCategories,
  fetchContent,
  fetchLanguageCounts,
  fetchLatestStatsCheck,
  fetchPublishedCount,
  fetchRanking,
  fetchRepoBySlug,
  fetchRepos,
  fetchSeoOverride,
  fetchSitemapRows,
  safeTerm,
  supabaseConfigured,
  type SeoOverride,
} from "./supabase";

// Data access layer. UI imports only from here.
// Backed by Supabase when NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set
// (RLS limits reads to published rows); otherwise by the sample data in ./sample (tests, local
// preview without a database). Both backends return the same shapes.
// With Supabase every function queries only the rows its page shows (decision #31): the catalog
// has thousands of repos, too many to load whole on a Cloudflare Worker.

/** Capture time of the sample data (fallback when no stats timestamp exists). Use getDataAsOf() in pages. */
export const DATA_AS_OF = "2026-11-24T23:43:00Z";

const SAMPLE_CONTENT: Record<string, RepositoryContent> = { openseo: openseoContent };

/** Sample backend only: the 24 sample repos, small enough to filter in memory. */
function published(): Repository[] {
  return sampleRepositories.filter((r) => r.status === "published");
}

const byStars = (a: Repository, b: Repository) => b.stars - a.stars;

async function contentFor(slug: string): Promise<RepositoryContent | null> {
  if (supabaseConfigured()) return fetchContent(slug);
  return SAMPLE_CONTENT[slug] ?? null;
}

export async function getCategories(): Promise<Category[]> {
  "use cache";
  cacheLife("days");
  cacheTag("categories");
  return supabaseConfigured() ? fetchCategories() : sampleCategories;
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  "use cache";
  cacheLife("days");
  return (await getCategories()).find((c) => c.slug === slug) ?? null;
}

export async function getCategoryCounts(): Promise<Record<string, number>> {
  "use cache";
  cacheLife("hours");
  const counts: Record<string, number> = {};
  if (supabaseConfigured()) {
    const cats = await getCategories();
    const n = await Promise.all(cats.map((c) => fetchPublishedCount(c.slug)));
    cats.forEach((c, i) => (counts[c.slug] = n[i]));
    return counts;
  }
  for (const r of published()) for (const c of r.categorySlugs) counts[c] = (counts[c] ?? 0) + 1;
  return counts;
}

/** Number of published repositories on the site. */
export async function getPublishedCount(): Promise<number> {
  "use cache";
  cacheLife("catalogCount");
  cacheTag("catalog");
  return supabaseConfigured() ? fetchPublishedCount() : published().length;
}

/** The most-starred repos in a category (`limit` of them) and how many the category has in total. */
export async function getRepositoriesByCategory(slug: string, limit = 60): Promise<{ total: number; repositories: Repository[] }> {
  "use cache";
  cacheLife("hours");
  cacheTag(`category:${slug}`);
  if (supabaseConfigured()) return fetchRepos({ category: slug, limit, count: true });
  const all = published().filter((r) => r.categorySlugs.includes(slug)).sort(byStars);
  return { total: all.length, repositories: all.slice(0, limit) };
}

/** Repos by slug, keeping only published ones. */
async function reposBySlugs(slugs: string[]): Promise<Map<string, Repository>> {
  if (!slugs.length) return new Map();
  const list = supabaseConfigured()
    ? (await fetchRepos({ slugs, limit: slugs.length })).repositories
    : published().filter((r) => slugs.includes(r.slug));
  return new Map(list.map((r) => [r.slug, r]));
}

/**
 * Leaderboards for each period, from precomputed ranking_snapshots (written daily by the rank job).
 * Weekly/monthly exist only once there is enough star history; until then they are empty with a
 * reason instead of inventing growth. The sample backend has no history, so it only has all-time.
 */
export async function getLeaderboards(categorySlug: string | null = null): Promise<Leaderboard[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("rankings");
  return Promise.all((["weekly", "monthly", "all_time"] as RankingPeriod[]).map((p) => board(p, categorySlug)));
}

const NO_HISTORY: Record<RankingPeriod, string> = {
  weekly:
    "We started recording daily star counts on Nov 24, 2026. The weekly ranking appears once we have 7 days of history to measure real growth.",
  monthly:
    "We started recording daily star counts on Nov 24, 2026. The monthly ranking appears once we have 30 days of history to measure real growth.",
  all_time: "The first ranking hasn't been calculated yet.",
};

async function board(period: RankingPeriod, categorySlug: string | null): Promise<Leaderboard> {
  const noneYet = "No published repositories in this category yet.";
  const empty = (reason: string): Leaderboard => ({ period, categorySlug, calculatedAt: null, signalsUsed: [], entries: [], emptyReason: reason });

  if (supabaseConfigured()) {
    const snap = await fetchRanking(period, categorySlug, 10);
    const bySlug = await reposBySlugs(snap.rows.map((r) => r.slug));
    const entries = snap.rows
      .filter((row) => bySlug.has(row.slug))
      .map((row) => ({
        rank: row.rank,
        score: row.score,
        repository: bySlug.get(row.slug)!,
        starGrowth: row.starGrowth,
        movement: row.previousRank == null ? null : row.previousRank - row.rank,
      }));
    if (!entries.length) return empty(period === "all_time" && snap.calculatedAt ? noneYet : NO_HISTORY[period]);
    return { period, categorySlug, calculatedAt: snap.calculatedAt, signalsUsed: snap.signalsUsed, entries, emptyReason: null };
  }

  if (period !== "all_time") return empty(NO_HISTORY[period]);
  const pool = published().filter((r) => !categorySlug || r.categorySlugs.includes(categorySlug));
  if (!pool.length) return empty(noneYet);
  const { results, signalsUsed } = rankRepositories(
    pool.map((r) => ({ id: r.id, stars: r.stars, forks: r.forks, lastPushedAt: r.lastPushedAt })),
    new Date(DATA_AS_OF),
  );
  const byId = new Map(pool.map((r) => [r.id, r]));
  return {
    period,
    categorySlug,
    calculatedAt: DATA_AS_OF,
    signalsUsed,
    emptyReason: null,
    entries: results.slice(0, 10).map((r) => ({ rank: r.rank, score: r.score, repository: byId.get(r.id)!, starGrowth: null, movement: null })),
  };
}

/** Fastest-growing repos over the last 7 days (latest weekly snapshot). Empty until history exists. */
export async function getTrendingRepositories(limit = 6): Promise<Repository[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("rankings");
  if (!supabaseConfigured()) return [];
  const snap = await fetchRanking("weekly", null, 100);
  const top = snap.rows
    .filter((r) => (r.starGrowth ?? 0) > 0)
    .sort((a, b) => (b.starGrowth ?? 0) - (a.starGrowth ?? 0))
    .slice(0, limit * 2);
  const bySlug = await reposBySlugs(top.map((r) => r.slug));
  return top
    .filter((r) => bySlug.has(r.slug))
    .slice(0, limit)
    .map((r) => bySlug.get(r.slug)!);
}

/** When the stats shown were last fetched from GitHub (latest stats_checked_at). */
export async function getDataAsOf(): Promise<string> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  if (supabaseConfigured()) return (await fetchLatestStatsCheck()) ?? DATA_AS_OF;
  const dates = published().map((r) => r.statsCheckedAt).filter((d): d is string => !!d).sort();
  return dates.at(-1) ?? DATA_AS_OF;
}

export async function getRecentlyAdded(limit = 6): Promise<Repository[]> {
  "use cache";
  cacheLife("catalogCount");
  if (supabaseConfigured()) return (await fetchRepos({ order: "recent", limit })).repositories;
  return published()
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || (b.createdAtGithub ?? "").localeCompare(a.createdAtGithub ?? ""))
    .slice(0, limit);
}

export async function getFeaturedRepository(): Promise<{ repository: Repository; content: RepositoryContent | null } | null> {
  "use cache";
  cacheLife("hours");
  const repo = supabaseConfigured()
    ? (await fetchRepos({ featured: true, limit: 1 })).repositories[0]
    : published().find((r) => r.featured);
  if (!repo) return null;
  return { repository: repo, content: await contentFor(repo.slug) };
}

export async function getBeginnerFriendly(limit = 4): Promise<Repository[]> {
  "use cache";
  cacheLife("hours");
  if (supabaseConfigured()) return (await fetchRepos({ difficulty: "beginner", limit })).repositories;
  return published()
    .filter((r) => r.difficulty === "beginner")
    .sort(byStars)
    .slice(0, limit);
}

/**
 * Slugs to prerender at build time: the most-starred repos. Every other published repo page is
 * rendered on its first visit and then cached (building thousands of pages per deploy is too slow).
 */
export async function getPrerenderSlugs(limit = 100): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  const repos = supabaseConfigured() ? (await fetchRepos({ limit, columns: "slug" })).repositories : published().sort(byStars).slice(0, limit);
  return repos.map((r) => r.slug);
}

export async function getRepositoryBySlug(slug: string): Promise<Repository | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(`repo:${slug}`);
  if (supabaseConfigured()) return fetchRepoBySlug(slug);
  return published().find((r) => r.slug === slug) ?? null;
}

export async function getRepositoryContent(slug: string): Promise<RepositoryContent | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(`repo:${slug}`);
  if (supabaseConfigured()) return fetchContent(slug); // published-only filter is in the query
  return published().some((r) => r.slug === slug) ? (SAMPLE_CONTENT[slug] ?? null) : null;
}

/** Same category first, then same language, then same kind; by stars. */
export async function getRelatedRepositories(slug: string, limit = 4): Promise<Repository[]> {
  "use cache";
  cacheLife("hours");
  const repo = await getRepositoryBySlug(slug);
  if (!repo) return [];
  const score = (r: Repository) =>
    (r.categorySlugs.some((c) => repo.categorySlugs.includes(c)) ? 4 : 0) +
    (r.primaryLanguage && r.primaryLanguage === repo.primaryLanguage ? 2 : 0) +
    (r.kind && r.kind === repo.kind ? 1 : 0);
  // Candidates: the most-starred repos in the same primary category (else same language).
  const pool = supabaseConfigured()
    ? (
        await fetchRepos(
          repo.categorySlugs[0]
            ? { category: repo.categorySlugs[0], excludeSlug: slug, limit: 24 }
            : { language: repo.primaryLanguage ?? undefined, excludeSlug: slug, limit: 24 },
        )
      ).repositories
    : published();
  return pool
    .filter((r) => r.slug !== slug)
    .map((r) => ({ r, s: score(r) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.r.stars - a.r.stars)
    .slice(0, limit)
    .map((x) => x.r);
}

export interface SearchParams {
  q?: string;
  category?: string;
  language?: string;
  difficulty?: string;
  page?: number;
}

/**
 * Every term must match the name, summary, description, a topic or (with Supabase) the stemmed
 * full-text index, so "agents" finds "agent". Name hits rank first, then stars.
 * With Supabase, filtering happens in Postgres and only one page of full rows is fetched.
 */
export async function searchRepositories(params: SearchParams, pageSize = 12) {
  const q = (params.q ?? "").trim().toLowerCase();
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const filters = { category: params.category, language: params.language, difficulty: params.difficulty };

  if (supabaseConfigured()) {
    const terms = q.split(/\s+/).map(safeTerm).filter(Boolean).slice(0, 6);
    if (!terms.length) {
      const res = await fetchRepos({ ...filters, limit: pageSize, offset: (page - 1) * pageSize, count: true });
      return { total: res.total, page, pageCount: Math.max(1, Math.ceil(res.total / pageSize)), results: res.repositories };
    }
    // Light pass over the matches (slug + name), ranked here; then full rows for one page only.
    const [nameHits, all] = await Promise.all([
      fetchRepos({ ...filters, nameTerms: terms, limit: 200, columns: "slug, name, stars" }),
      fetchRepos({ ...filters, terms, limit: 1000, count: true, columns: "slug, name, stars" }),
    ]);
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const r of [...nameHits.repositories, ...all.repositories]) {
      if (!seen.has(r.slug)) {
        seen.add(r.slug);
        ordered.push(r.slug);
      }
    }
    const total = Math.max(all.total, ordered.length);
    const pageSlugs = ordered.slice((page - 1) * pageSize, page * pageSize);
    const rows = await reposBySlugs(pageSlugs);
    return {
      total,
      page,
      pageCount: Math.max(1, Math.ceil(Math.min(total, ordered.length) / pageSize)),
      results: pageSlugs.map((s) => rows.get(s)).filter((r): r is Repository => !!r),
    };
  }

  const terms = q.split(/\s+/).filter(Boolean);
  const matches = published()
    .filter((r) => !params.category || r.categorySlugs.includes(params.category))
    .filter((r) => !params.language || r.primaryLanguage === params.language)
    .filter((r) => !params.difficulty || r.difficulty === params.difficulty)
    .map((r) => {
      if (!terms.length) return { r, s: 1 };
      const name = r.name.toLowerCase();
      const hay = [r.summary, r.description, r.topics.join(" "), r.categorySlugs.join(" "), r.primaryLanguage]
        .join(" ")
        .toLowerCase();
      let s = 0;
      for (const t of terms) {
        if (name.includes(t)) s += 5;
        else if (hay.includes(t)) s += 1;
        else return { r, s: 0 };
      }
      return { r, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.r.stars - a.r.stars)
    .map((x) => x.r);
  return {
    total: matches.length,
    page,
    pageCount: Math.max(1, Math.ceil(matches.length / pageSize)),
    results: matches.slice((page - 1) * pageSize, page * pageSize),
  };
}

/**
 * Names + slugs for the instant suggestion dropdown, embedded in every page: only the most-starred
 * repos, so the page stays small. The search page itself covers the full catalog.
 */
export async function getSearchSuggestions(limit = 150): Promise<{ slug: string; name: string; owner: string; summary: string }[]> {
  "use cache";
  cacheLife("hours");
  const repos = supabaseConfigured()
    ? (await fetchRepos({ limit, columns: "slug, name, owner, summary, description, stars" })).repositories
    : published().sort(byStars).slice(0, limit);
  return repos.map((r) => ({ slug: r.slug, name: r.name, owner: r.owner, summary: r.summary ?? r.description ?? "" }));
}

/**
 * Live suggestions for what the visitor is typing, across the whole catalog (the embedded list
 * above only holds the most-starred repos). Name matches first, then summary/description/topic
 * matches, by stars. Cached per query, so repeated keystrokes don't hit the database.
 */
export async function suggestRepositories(query: string, limit = 6): Promise<{ slug: string; name: string; owner: string; summary: string }[]> {
  "use cache";
  cacheLife("hours");
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const columns = "slug, name, owner, summary, description, stars";
  let repos: Repository[];
  if (supabaseConfigured()) {
    const terms = q.split(/\s+/).map(safeTerm).filter(Boolean).slice(0, 4);
    if (!terms.length) return [];
    const byName = (await fetchRepos({ nameTerms: terms, limit, columns })).repositories;
    const rest = byName.length < limit ? (await fetchRepos({ terms, limit, columns })).repositories : [];
    const seen = new Set<string>();
    repos = [...byName, ...rest].filter((r) => !seen.has(r.slug) && !!seen.add(r.slug));
  } else {
    repos = (await searchRepositories({ q }, limit)).results;
  }
  return repos.slice(0, limit).map((r) => ({ slug: r.slug, name: r.name, owner: r.owner, summary: r.summary ?? r.description ?? "" }));
}

/** The most common languages (alphabetical), for the search filter. */
export async function getLanguages(limit = 14): Promise<string[]> {
  "use cache";
  cacheLife("days");
  const counts = new Map<string, number>();
  if (supabaseConfigured()) for (const [l, n] of await fetchLanguageCounts()) counts.set(l, n);
  else for (const r of published()) if (r.primaryLanguage) counts.set(r.primaryLanguage, (counts.get(r.primaryLanguage) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([l]) => l)
    .sort();
}

/** Editor overrides for a repo's title/description/noindex (seo_metadata). Null when none. */
export async function getRepositorySeo(slug: string): Promise<SeoOverride | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(`repo:${slug}`);
  if (!supabaseConfigured()) return null;
  return fetchSeoOverride(slug);
}

/**
 * Published, indexable repos for the sitemap, with the last time their page data changed.
 * Pages marked noindex (basic pages without a reviewed guide) are left out.
 */
export async function getSitemapRepositories(): Promise<{ slug: string; lastModified: string | null }[]> {
  "use cache";
  cacheLife("hours");
  if (supabaseConfigured()) {
    return (await fetchSitemapRows()).filter((r) => !r.noindex).map(({ slug, lastModified }) => ({ slug, lastModified }));
  }
  return published().map((r) => {
    const dates = [r.publishedAt, r.statsCheckedAt].filter((d): d is string => !!d).sort();
    return { slug: r.slug, lastModified: dates.at(-1) ?? null };
  });
}
export type { SeoOverride };
