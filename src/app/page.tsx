import type { Metadata } from "next";
import { ArrowRight, BookOpenCheck, Clock, Flame, Info } from "lucide-react";
import Link from "next/link";
import { AdSlot } from "@/components/ads/ad-slot";
import { CategoryIcon } from "@/components/repo/category-icon";
import { Leaderboard } from "@/components/repo/leaderboard";
import { RepoCard } from "@/components/repo/repo-card";
import { toLeaderboardData } from "@/components/repo/to-leaderboard-data";
import { SearchBox } from "@/components/site/search-box";
import { LiveRepoCount } from "@/components/site/live-repo-count";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  getBeginnerFriendly,
  getCategories,
  getCategoryCounts,
  getDataAsOf,
  getLeaderboards,
  getPublishedCount,
  getRecentlyAdded,
  getSearchSuggestions,
  getTrendingRepositories,
} from "@/lib/data";
import { JsonLd } from "@/components/site/json-ld";
import { itemListJsonLd, websiteJsonLd } from "@/lib/seo";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const POPULAR = ["local-llms", "ai-agents", "coding-assistants", "image-generation", "rag-knowledge"];

export default async function HomePage() {
  const [categories, counts, boards, trending, beginner, recent, suggestions, repoCount, asOf] = await Promise.all([
    getCategories(),
    getCategoryCounts(),
    getLeaderboards(),
    getTrendingRepositories(),
    getBeginnerFriendly(),
    getRecentlyAdded(),
    getSearchSuggestions(),
    getPublishedCount(),
    getDataAsOf(),
  ]);
  const catBySlug = new Map(categories.map((c) => [c.slug, c]));
  const allTime = boards.find((b) => b.period === "all_time");

  return (
    <>
      <JsonLd
        data={[
          websiteJsonLd(),
          ...(allTime?.entries.length
            ? [itemListJsonLd("Top 10 open-source AI repositories", allTime.entries.map((e) => e.repository))]
            : []),
        ]}
      />
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="container-page relative grid gap-12 pb-16 pt-12 sm:pb-20 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-end lg:gap-16">
          <div className="min-w-0">
          <p className="eyebrow mb-6">Discover. Install. Build.</p>
          <h1 className="max-w-[14ch] font-display text-[46px] font-medium leading-[0.98] tracking-[-0.03em] sm:text-[76px]">
            The field guide to <em className="mark-highlight whitespace-nowrap font-normal text-accent">open-source AI</em>.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Explore powerful GitHub repositories, understand what they do, and learn how to install and use them.
          </p>
          <SearchBox
            suggestions={suggestions}
            size="lg"
            placeholder="Try “local LLM”, “agents” or “ollama”"
            className="mt-8 max-w-xl"
          />
          <div className="mt-5 flex max-w-2xl flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Popular</span>
            {POPULAR.map((slug) => {
              const c = catBySlug.get(slug);
              return c ? (
                <Link
                  key={slug}
                  href={`/categories/${slug}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-[13px] font-medium text-foreground transition-colors hover:border-accent hover:bg-accent hover:text-accent-foreground"
                >
                  <CategoryIcon name={c.icon} className="size-3.5" />
                  {c.name}
                </Link>
              ) : null;
            })}
          </div>
          </div>
          <dl className="grid grid-cols-3 border-y border-foreground/80 lg:grid-cols-1 lg:divide-y lg:divide-border">
            <div className="py-4 pr-3 lg:flex lg:items-baseline lg:justify-between lg:pr-0">
              <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Repositories</dt>
              <dd className="mt-1 font-display text-3xl font-medium tabular-nums lg:mt-0 lg:text-4xl">
                <LiveRepoCount initial={repoCount} />
              </dd>
            </div>
            <div className="border-l border-border py-4 pl-3 pr-3 lg:flex lg:items-baseline lg:justify-between lg:border-l-0 lg:px-0">
              <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Categories</dt>
              <dd className="mt-1 font-display text-3xl font-medium tabular-nums lg:mt-0 lg:text-4xl">{categories.length}</dd>
            </div>
            <div className="border-l border-border py-4 pl-3 lg:flex lg:items-baseline lg:justify-between lg:border-l-0 lg:pl-0">
              <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Data as of</dt>
              <dd className="mt-1 font-display text-3xl font-medium tabular-nums lg:mt-0 lg:text-4xl">{formatDate(asOf).replace(/, \d{4}$/, "")}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ── Top 10 ───────────────────────────────────────────── */}
      <section className="container-page pt-16 sm:pt-20" aria-labelledby="rankings">
        <SectionHeading
          id="rankings"
          eyebrow="Leaderboard"
          title="Top 10 AI repositories"
          description="Ranked by a transparent score, not by hype. Open any project for a plain-English guide."
        />
        <Leaderboard boards={toLeaderboardData(boards, categories, asOf)} categories={categories} />
        <p className="mt-3 flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            All-time score uses {allTime?.signalsUsed.join(", ").replace("community", "forks")} (log-scaled so giants
            don&apos;t drown out newer projects). Star growth is used in the weekly and monthly rankings. Stats as of{" "}
            {formatDate(asOf)}.{" "}
            <Link href="/about#rankings" className="font-medium text-accent hover:underline">
              How rankings work
            </Link>
          </span>
        </p>
      </section>

      <AdSlot slot="home-after-featured" className="container-page pt-16" />

      {/* ── Categories ───────────────────────────────────────── */}
      <section className="container-page pt-20" aria-labelledby="categories">
        <SectionHeading
          id="categories"
          eyebrow="Explore"
          title="Browse by category"
          description="Ten areas where open-source AI is moving fastest."
        />
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/categories/${c.slug}`}
                className="group flex h-full items-start gap-3 rounded-xl border border-border bg-surface p-4 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-accent hover:shadow-raised lg:flex-col"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-md border border-accent/25 bg-accent-soft text-accent-soft-foreground transition-colors group-hover:border-accent group-hover:bg-accent group-hover:text-accent-foreground">
                  <CategoryIcon name={c.icon} className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-[17px] font-medium tracking-[-0.01em]">{c.name}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{c.description}</span>
                  <span className="mt-2 block font-mono text-[11px] text-muted-foreground">
                    {counts[c.slug] ?? 0} {counts[c.slug] === 1 ? "repository" : "repositories"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Trending ─────────────────────────────────────────── */}
      <section className="container-page pt-20" aria-labelledby="trending">
        <SectionHeading
          id="trending"
          eyebrow="Momentum"
          title="Trending this week"
          description="Repositories gaining stars fastest over the last 7 days."
        />
        {trending.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trending.map((r) => (
              <RepoCard key={r.slug} repo={r} category={catBySlug.get(r.categorySlugs[0])} />
            ))}
          </div>
        ) : (
          <EmptyState icon={Flame} title="Trending starts after a week of tracking">
            We record every repository&apos;s stars daily and only call something trending when we can measure real
            growth. The first trending list appears once we have seven days of history.
          </EmptyState>
        )}
      </section>

      {/* ── Beginner friendly ────────────────────────────────── */}
      <section className="container-page pt-20" aria-labelledby="beginner">
        <SectionHeading
          id="beginner"
          eyebrow="Start here"
          title="Beginner-friendly projects"
          description="Simple installs, clear docs and a quick first result."
        />
        {beginner.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {beginner.map((r) => (
              <RepoCard key={r.slug} repo={r} category={catBySlug.get(r.categorySlugs[0])} showDifficulty />
            ))}
          </div>
        ) : (
          <EmptyState icon={BookOpenCheck} title="No beginner picks yet">
            We&apos;ll list projects here once their setup has been reviewed.
          </EmptyState>
        )}
      </section>

      {/* ── Recently added ───────────────────────────────────── */}
      <section className="container-page pt-20" aria-labelledby="recent">
        <SectionHeading
          id="recent"
          eyebrow="New on AIRepoHub"
          title="Recently added"
          action={
            <ButtonLink href="/search" variant="ghost" size="sm">
              View all <ArrowRight aria-hidden />
            </ButtonLink>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recent.map((r) => (
            <RepoCard
              key={r.slug}
              repo={r}
              category={catBySlug.get(r.categorySlugs[0])}
              meta={`Added ${formatDate(r.publishedAt)}`}
            />
          ))}
        </div>
        <p className="mt-4 flex items-center gap-2 text-[13px] text-muted-foreground">
          <Clock className="size-3.5" aria-hidden /> New repositories are reviewed by a person before they appear here.
        </p>
      </section>
    </>
  );
}
