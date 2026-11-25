import type { Metadata } from "next";
import { ArrowRight, BookOpenCheck, Clock, Flame, Info, Sparkles } from "lucide-react";
import Link from "next/link";
import { AdSlot } from "@/components/ads/ad-slot";
import { CategoryIcon } from "@/components/repo/category-icon";
import { Leaderboard } from "@/components/repo/leaderboard";
import { RepoAvatar } from "@/components/repo/repo-avatar";
import { RepoCard } from "@/components/repo/repo-card";
import { Terminal } from "@/components/repo/terminal";
import { toLeaderboardData } from "@/components/repo/to-leaderboard-data";
import { SearchBox } from "@/components/site/search-box";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GithubIcon } from "@/components/ui/github-icon";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  getBeginnerFriendly,
  getCategories,
  getCategoryCounts,
  getDataAsOf,
  getFeaturedRepository,
  getLeaderboards,
  getPublishedCount,
  getRecentlyAdded,
  getSearchSuggestions,
  getTrendingRepositories,
} from "@/lib/data";
import { JsonLd } from "@/components/site/json-ld";
import { itemListJsonLd, websiteJsonLd } from "@/lib/seo";
import { formatCount, formatDate, licenseLabel } from "@/lib/utils";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const POPULAR = ["local-llms", "ai-agents", "coding-assistants", "image-generation", "rag-knowledge"];

export default async function HomePage() {
  const [categories, counts, boards, featured, trending, beginner, recent, suggestions, repoCount, asOf] = await Promise.all([
    getCategories(),
    getCategoryCounts(),
    getLeaderboards(),
    getFeaturedRepository(),
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
        <div className="container-page relative pb-16 pt-14 text-center sm:pb-20 sm:pt-20">
          <Badge tone="accent" className="mb-6 px-3 py-1">
            <Sparkles aria-hidden /> Discover. Install. Build.
          </Badge>
          <h1 className="mx-auto max-w-3xl text-[40px] font-semibold leading-[1.04] tracking-[-0.04em] sm:text-6xl">
            Discover the best <span className="whitespace-nowrap text-accent">open-source AI</span> tools.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Explore powerful GitHub repositories, understand what they do, and learn how to install and use them.
          </p>
          <SearchBox
            suggestions={suggestions}
            size="lg"
            placeholder="Try “local LLM”, “agents” or “ollama”"
            className="mx-auto mt-8 max-w-xl"
          />
          <div className="mx-auto mt-5 flex max-w-2xl flex-wrap items-center justify-center gap-2">
            <span className="text-[13px] text-muted-foreground">Popular:</span>
            {POPULAR.map((slug) => {
              const c = catBySlug.get(slug);
              return c ? (
                <Link
                  key={slug}
                  href={`/categories/${slug}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-[13px] font-medium text-foreground shadow-card transition-colors hover:border-accent/50 hover:text-accent"
                >
                  <CategoryIcon name={c.icon} className="size-3.5" />
                  {c.name}
                </Link>
              ) : null;
            })}
          </div>
          <dl className="mx-auto mt-12 grid max-w-2xl grid-cols-3 divide-x divide-border rounded-xl border border-border bg-surface/70 py-4 text-center shadow-card backdrop-blur">
            <div>
              <dt className="text-xs text-muted-foreground">Repositories</dt>
              <dd className="mt-0.5 font-mono text-xl font-semibold tabular-nums">{repoCount.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Categories</dt>
              <dd className="mt-0.5 font-mono text-xl font-semibold tabular-nums">{categories.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Data as of</dt>
              <dd className="mt-0.5 font-mono text-xl font-semibold tabular-nums">{formatDate(asOf).replace(/, \d{4}$/, "")}</dd>
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

      {/* ── Featured ─────────────────────────────────────────── */}
      {featured && (
        <section className="container-page pt-20" aria-labelledby="featured">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="bg-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden />
            <div className="relative grid gap-10 p-6 sm:p-10 lg:grid-cols-[1.05fr_1fr] lg:items-center">
              <div>
                <p className="eyebrow mb-4 flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-accent" aria-hidden /> Featured repository
                </p>
                <div className="flex items-center gap-4">
                  <RepoAvatar src={featured.repository.avatarUrl} name={featured.repository.name} size={56} />
                  <div>
                    <h2 id="featured" className="text-3xl font-semibold tracking-[-0.03em]">
                      {featured.repository.name}
                    </h2>
                    <p className="text-sm text-muted-foreground">by {featured.repository.owner}</p>
                  </div>
                </div>
                <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
                  {featured.content?.sixtySeconds.whatItDoes ?? featured.repository.summary ?? featured.repository.description}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {featured.repository.categorySlugs.map((s) => (
                    <Badge key={s} tone="accent">
                      {catBySlug.get(s)?.name}
                    </Badge>
                  ))}
                  {featured.repository.primaryLanguage && <Badge tone="muted">{featured.repository.primaryLanguage}</Badge>}
                  <Badge tone="muted">{licenseLabel(featured.repository.licenseKey)} license</Badge>
                  <Badge tone="muted">★ {formatCount(featured.repository.stars)}</Badge>
                </div>
                <div className="mt-7 flex flex-wrap gap-3">
                  <ButtonLink href={`/repo/${featured.repository.slug}`} variant="accent" size="lg">
                    Read the guide <ArrowRight aria-hidden />
                  </ButtonLink>
                  <ButtonLink href={featured.repository.githubUrl} external variant="outline" size="lg">
                    <GithubIcon /> GitHub
                  </ButtonLink>
                </div>
              </div>
              {featured.content && (
                <Terminal title={`${featured.repository.name}: quick start`} commands={featured.content.heroCommands} />
              )}
            </div>
          </div>
        </section>
      )}

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
                className="group flex h-full items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-card transition-[border-color,box-shadow] hover:border-accent/40 hover:shadow-raised lg:flex-col"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-soft-foreground transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
                  <CategoryIcon name={c.icon} className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold tracking-[-0.01em]">{c.name}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{c.description}</span>
                  <span className="mt-2 block text-xs font-medium text-muted-foreground">
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
