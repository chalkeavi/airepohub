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
import { fetchAllTimeRanking, fetchCatalog, fetchContent, fetchSearchMatches, supabaseConfigured } from "./supabase";

// Data access layer. UI imports only from here.
// Backed by Supabase when NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set
// (RLS limits reads to published rows); otherwise by the sample data in ./sample (tests, local
// preview without a database). Both backends return the same shapes.

/** Time the current stats were captured from GitHub; used as "now" for derived values. */
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
 * Leaderboards for each period. Weekly/monthly need star snapshots (Milestone 4),
 * so they are returned empty with a reason instead of inventing growth.
 */
export async function getLeaderboards(categorySlug: string | null = null): Promise<Leaderboard[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("rankings");
  const repos = await published();
  const noHistory =
    "We started recording daily star counts on Nov 24, 2026. This ranking appears once there is enough history to measure real growth.";
  const empty = (period: RankingPeriod): Leaderboard => ({
    period,
    categorySlug,
    calculatedAt: null,
    signalsUsed: [],
    entries: [],
    emptyReason: noHistory,
  });
  return [empty("weekly"), empty("monthly"), await allTimeBoard(repos, categorySlug)];
}

/** All-time board: the precomputed snapshot from Supabase, or computed from sample data. */
async function allTimeBoard(repos: Repository[], categorySlug: string | null): Promise<Leaderboard> {
  const noneYet = "No published repositories in this category yet.";
  if (supabaseConfigured()) {
    const bySlug = new Map(repos.map((r) => [r.slug, r]));
    const snap = await fetchAllTimeRanking(categorySlug, 10);
    const entries = snap.rows
      .filter((row) => bySlug.has(row.slug))
      .map((row) => ({
        rank: row.rank,
        score: row.score,
        repository: bySlug.get(row.slug)!,
        starGrowth: row.starGrowth,
        movement: row.previousRank == null ? null : row.previousRank - row.rank,
      }));
    return {
      period: "all_time",
      categorySlug,
      calculatedAt: snap.calculatedAt,
      signalsUsed: snap.signalsUsed,
      entries,
      emptyReason: entries.length ? null : snap.calculatedAt ? noneYet : "The first ranking hasn't been calculated yet.",
    };
  }
  const pool = repos.filter((r) => !categorySlug || r.categorySlugs.includes(categorySlug));
  const { results, signalsUsed } = rankRepositories(
    pool.map((r) => ({ id: r.id, stars: r.stars, forks: r.forks, lastPushedAt: r.lastPushedAt })),
    new Date(DATA_AS_OF),
  );
  const byId = new Map(pool.map((r) => [r.id, r]));
  return {
    period: "all_time",
    categorySlug,
    calculatedAt: DATA_AS_OF,
    signalsUsed,
    emptyReason: pool.length ? null : noneYet,
    entries: results.slice(0, 10).map((r) => ({
      rank: r.rank,
      score: r.score,
      repository: byId.get(r.id)!,
      starGrowth: null,
      movement: null,
    })),
  };
}

/** Needs snapshot history (Milestone 4). Empty until then. */
export async function getTrendingRepositories(): Promise<Repository[]> {
  "use cache";
  cacheLife("hours");
  return [];
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
