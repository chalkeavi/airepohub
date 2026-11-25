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
  fetchRanking,
  fetchCatalog,
  fetchContent,
  fetchSearchMatches,
  fetchSeoOverride,
  supabaseConfigured,
  type SeoOverride,
} from "./supabase";

// Data access layer. UI imports only from here.
// Backed by Supabase when NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set
// (RLS limits reads to published rows); otherwise by the sample data in ./sample (tests, local
// preview without a database). Both backends return the same shapes.

/** Capture time of the sample data (fallback when no stats timestamp exists). Use getDataAsOf() in pages. */
export const DATA_AS_OF = "2026-11-24T23:43:00Z";

const SAMPLE_CONTENT: Record<string, RepositoryContent> = { openseo: openseoContent };

/** Categories plus every published repository. Small enough to load whole and cache. */
async function catalog(): Promise<{ categories: Category[]; repositories: Repository[] }> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  if (supabaseConfigured()) return fetchCatalog();
  return { categories: sampleCategories, repositories: sampleRepositories.filter((r) => r.status === "published") };
}

async function published(): Promise<Repository[]> {
  return (await catalog()).repositories;
}

async function contentFor(slug: string): Promise<RepositoryContent | null> {
  if (supabaseConfigured()) return fetchContent(slug);
  return SAMPLE_CONTENT[slug] ?? null;
}

export async function getCategories(): Promise<Category[]> {
  "use cache";
  cacheLife("days");
  cacheTag("categories");
  return (await catalog()).categories;
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  "use cache";
  cacheLife("days");
  return (await catalog()).categories.find((c) => c.slug === slug) ?? null;
}

export async function getCategoryCounts(): Promise<Record<string, number>> {
  "use cache";
  cacheLife("hours");
  const counts: Record<string, number> = {};
  for (const r of await published()) for (const c of r.categorySlugs) counts[c] = (counts[c] ?? 0) + 1;
  return counts;
}

export async function getRepositoriesByCategory(slug: string): Promise<Repository[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(`category:${slug}`);
  return (await published())
    .filter((r) => r.categorySlugs.includes(slug))
    .sort((a, b) => b.stars - a.stars);
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
  const repos = await published();
  return Promise.all((["weekly", "monthly", "all_time"] as RankingPeriod[]).map((p) => board(p, repos, categorySlug)));
}

const NO_HISTORY: Record<RankingPeriod, string> = {
  weekly:
    "We started recording daily star counts on Nov 24, 2026. The weekly ranking appears once we have 7 days of history to measure real growth.",
  monthly:
    "We started recording daily star counts on Nov 24, 2026. The monthly ranking appears once we have 30 days of history to measure real growth.",
  all_time: "The first ranking hasn't been calculated yet.",
};

async function board(period: RankingPeriod, repos: Repository[], categorySlug: string | null): Promise<Leaderboard> {
  const noneYet = "No published repositories in this category yet.";
  const empty = (reason: string): Leaderboard => ({ period, categorySlug, calculatedAt: null, signalsUsed: [], entries: [], emptyReason: reason });

  if (supabaseConfigured()) {
    const bySlug = new Map(repos.map((r) => [r.slug, r]));
    const snap = await fetchRanking(period, categorySlug, 10);
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
  const pool = repos.filter((r) => !categorySlug || r.categorySlugs.includes(categorySlug));
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
  const repos = await published();
  const bySlug = new Map(repos.map((r) => [r.slug, r]));
  const snap = await fetchRanking("weekly", null, 200);
  return snap.rows
    .filter((r) => (r.starGrowth ?? 0) > 0 && bySlug.has(r.slug))
    .sort((a, b) => (b.starGrowth ?? 0) - (a.starGrowth ?? 0))
    .slice(0, limit)
    .map((r) => bySlug.get(r.slug)!);
}

/** When the stats shown were last fetched from GitHub (latest stats_checked_at). */
export async function getDataAsOf(): Promise<string> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  const dates = (await published()).map((r) => r.statsCheckedAt).filter((d): d is string => !!d).sort();
  return dates.at(-1) ?? DATA_AS_OF;
}

export async function getRecentlyAdded(limit = 6): Promise<Repository[]> {
  "use cache";
  cacheLife("hours");
  return (await published())
    .slice()
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || (b.createdAtGithub ?? "").localeCompare(a.createdAtGithub ?? ""))
    .slice(0, limit);
}

export async function getFeaturedRepository(): Promise<{ repository: Repository; content: RepositoryContent | null } | null> {
  "use cache";
  cacheLife("hours");
  const repo = (await published()).find((r) => r.featured);
  if (!repo) return null;
  return { repository: repo, content: await contentFor(repo.slug) };
}

export async function getBeginnerFriendly(limit = 4): Promise<Repository[]> {
  "use cache";
  cacheLife("hours");
  return (await published())
    .filter((r) => r.difficulty === "beginner")
    .sort((a, b) => b.stars - a.stars)
    .slice(0, limit);
}

export async function getPublishedSlugs(): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  return (await published()).map((r) => r.slug);
}

export async function getRepositoryBySlug(slug: string): Promise<Repository | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(`repo:${slug}`);
  return (await published()).find((r) => r.slug === slug) ?? null;
}

export async function getRepositoryContent(slug: string): Promise<RepositoryContent | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(`repo:${slug}`);
  const repo = (await published()).find((r) => r.slug === slug);
  return repo ? contentFor(slug) : null;
}

/** Same category first, then same language, then same kind; by stars. */
export async function getRelatedRepositories(slug: string, limit = 4): Promise<Repository[]> {
  "use cache";
  cacheLife("hours");
  const repo = (await published()).find((r) => r.slug === slug);
  if (!repo) return [];
  const score = (r: Repository) =>
    (r.categorySlugs.some((c) => repo.categorySlugs.includes(c)) ? 4 : 0) +
    (r.primaryLanguage && r.primaryLanguage === repo.primaryLanguage ? 2 : 0) +
    (r.kind && r.kind === repo.kind ? 1 : 0);
  return (await published())
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
 * Ranked text match over the cached catalog. With Supabase, Postgres full-text search
 * (stemmed, e.g. "agents" finds "agent") also counts as a match; name hits rank first.
 */
export async function searchRepositories(params: SearchParams, pageSize = 12) {
  const q = (params.q ?? "").trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const page = Math.max(1, params.page ?? 1);
  const fts = terms.length && supabaseConfigured() ? await fetchSearchMatches(q).catch(() => new Set<string>()) : new Set<string>();
  const matches = (await published())
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
        else return { r, s: fts.has(r.slug) ? 1 : 0 };
      }
      return { r, s: s + (fts.has(r.slug) ? 1 : 0) };
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

/** Lightweight list for the client-side suggestion dropdown (names + slugs only). */
export async function getSearchSuggestions(): Promise<{ slug: string; name: string; owner: string; summary: string }[]> {
  "use cache";
  cacheLife("hours");
  return (await published())
    .sort((a, b) => b.stars - a.stars)
    .map((r) => ({ slug: r.slug, name: r.name, owner: r.owner, summary: r.summary ?? "" }));
}

export async function getLanguages(): Promise<string[]> {
  "use cache";
  cacheLife("days");
  return [...new Set((await published()).map((r) => r.primaryLanguage).filter((l): l is string => !!l))].sort();
}

/** Editor overrides for a repo's title/description/noindex (seo_metadata). Null when none. */
export async function getRepositorySeo(slug: string): Promise<SeoOverride | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(`repo:${slug}`);
  if (!supabaseConfigured()) return null;
  return fetchSeoOverride(slug);
}

/** Published repos for the sitemap, with the last time their page data changed. */
export async function getSitemapRepositories(): Promise<{ slug: string; lastModified: string | null }[]> {
  "use cache";
  cacheLife("hours");
  return (await published()).map((r) => {
    const dates = [r.publishedAt, r.statsCheckedAt].filter((d): d is string => !!d).sort();
    return { slug: r.slug, lastModified: dates.at(-1) ?? null };
  });
}
export type { SeoOverride };
