import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RepoCard } from "@/components/repo/repo-card";
import { EmptyState } from "@/components/ui/empty-state";
import { getCategories, getLanguages, searchRepositories } from "@/lib/data";
import { DIFFICULTY_LABEL, cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Search AI repositories",
  robots: { index: false, follow: true },
};

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="container-page pt-12">
      <h1 className="font-display text-4xl font-medium tracking-[-0.02em] sm:text-5xl">Search</h1>
      <Suspense fallback={<ResultsSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

async function Results({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const sp = await searchParams;
  const q = first(sp.q) ?? "";
  const category = first(sp.category);
  const language = first(sp.language);
  const difficulty = first(sp.difficulty);
  const page = Number(first(sp.page) ?? 1) || 1;
  const [res, categories, languages] = await Promise.all([
    searchRepositories({ q, category, language, difficulty, page }),
    getCategories(),
    getLanguages(),
  ]);
  const catBySlug = new Map(categories.map((c) => [c.slug, c]));
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q, category, language, difficulty, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/search?${p.toString()}`;
  };
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
      active ? "border-accent bg-accent-soft text-accent-soft-foreground" : "border-border bg-surface text-muted-foreground hover:text-foreground",
    );

  return (
    <>
      <form action="/search" className="mt-6 flex max-w-xl gap-2">
        <label htmlFor="q" className="sr-only">Search</label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Search by name, use case or keyword"
          className="h-11 flex-1 rounded-lg border border-border bg-surface px-4 text-sm shadow-card outline-none focus:border-accent/60 focus:ring-4 focus:ring-accent/15"
        />
        {category && <input type="hidden" name="category" value={category} />}
        <button className="h-11 rounded-lg bg-ink px-5 text-sm font-medium text-ink-foreground">Search</button>
      </form>
      <div className="mt-6 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Link href={href({ category: undefined, page: undefined })} className={chip(!category)}>All categories</Link>
          {categories.map((c) => (
            <Link key={c.slug} href={href({ category: c.slug, page: undefined })} className={chip(category === c.slug)}>
              {c.name}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {languages.map((l) => (
            <Link key={l} href={href({ language: language === l ? undefined : l, page: undefined })} className={chip(language === l)}>
              {l}
            </Link>
          ))}
          {(Object.keys(DIFFICULTY_LABEL) as (keyof typeof DIFFICULTY_LABEL)[]).map((d) => (
            <Link key={d} href={href({ difficulty: difficulty === d ? undefined : d, page: undefined })} className={chip(difficulty === d)}>
              {DIFFICULTY_LABEL[d]} setup
            </Link>
          ))}
        </div>
      </div>
      <p className="mb-5 mt-8 text-sm text-muted-foreground" aria-live="polite">
        {res.total.toLocaleString("en-US")} {res.total === 1 ? "result" : "results"}
        {q && <> for &ldquo;{q}&rdquo;</>}
      </p>
      {res.results.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {res.results.map((r) => (
            <RepoCard key={r.slug} repo={r} category={catBySlug.get(r.categorySlugs[0])} />
          ))}
        </div>
      ) : (
        <EmptyState icon={SearchX} title="No repositories match">
          Try a broader term like &ldquo;agent&rdquo; or &ldquo;image&rdquo;, or remove a filter.
        </EmptyState>
      )}
      {res.pageCount > 1 && (
        <nav aria-label="Pagination" className="mt-8 flex justify-center gap-2">
          {pageWindow(res.page, res.pageCount).map((p, i) =>
            p === null ? (
              <span key={`gap${i}`} className="px-1 py-1 text-[13px] text-muted-foreground" aria-hidden>
                …
              </span>
            ) : (
              <Link key={p} href={href({ page: String(p) })} aria-current={p === res.page ? "page" : undefined} className={chip(p === res.page)}>
                {p}
              </Link>
            ),
          )}
        </nav>
      )}
    </>
  );
}

/** First, last and the pages around the current one; null marks a gap. */
function pageWindow(current: number, count: number): (number | null)[] {
  const keep = new Set([1, count, current - 1, current, current + 1].filter((p) => p >= 1 && p <= count));
  const out: (number | null)[] = [];
  let prev = 0;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push(null);
    out.push(p);
    prev = p;
  }
  return out;
}

function ResultsSkeleton() {
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-surface-muted" />
      ))}
    </div>
  );
}
