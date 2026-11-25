import { ChevronRight, FolderOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryIcon } from "@/components/repo/category-icon";
import { Leaderboard } from "@/components/repo/leaderboard";
import { RepoCard } from "@/components/repo/repo-card";
import { toLeaderboardData } from "@/components/repo/to-leaderboard-data";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { JsonLd } from "@/components/site/json-ld";
import { breadcrumbJsonLd, categoryBreadcrumbs, itemListJsonLd, truncate } from "@/lib/seo";
import { getCategories, getCategoryBySlug, getDataAsOf, getLeaderboards, getRepositoriesByCategory } from "@/lib/data";

export async function generateStaticParams() {
  return (await getCategories()).map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/categories/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Category not found", robots: { index: false } };
  const title = `Best open-source ${category.name} repositories`;
  return {
    title,
    description: truncate(`${category.description} Ranked, with plain-English install guides.`, 160),
    alternates: { canonical: `/categories/${category.slug}` },
    openGraph: { title: `${title} | AIRepoHub`, url: `/categories/${category.slug}`, type: "website" },
  };
}

export default async function CategoryPage({ params }: PageProps<"/categories/[slug]">) {
  const { slug } = await params;
  const [category, categories, repos, boards, asOf] = await Promise.all([
    getCategoryBySlug(slug),
    getCategories(),
    getRepositoriesByCategory(slug),
    getLeaderboards(slug),
    getDataAsOf(),
  ]);
  if (!category) notFound();

  return (
    <div className="container-page pt-6">
      <JsonLd
        data={[
          breadcrumbJsonLd(categoryBreadcrumbs(category)),
          ...(repos.length ? [itemListJsonLd(`Open-source ${category.name} repositories`, repos)] : []),
        ]}
      />
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <ChevronRight className="size-3.5 opacity-60" aria-hidden />
        <Link href="/categories" className="hover:text-foreground">Categories</Link>
        <ChevronRight className="size-3.5 opacity-60" aria-hidden />
        <span aria-current="page" className="font-medium text-foreground">{category.name}</span>
      </nav>
      <header className="flex items-start gap-4 pb-10 pt-8">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-accent text-accent-foreground shadow-raised">
          <CategoryIcon name={category.icon} className="size-7" />
        </span>
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{category.name}</h1>
          <p className="mt-1.5 max-w-xl text-muted-foreground">{category.description}</p>
        </div>
      </header>

      {repos.length === 0 ? (
        <EmptyState icon={FolderOpen} title="Nothing published here yet">
          We&apos;re reviewing repositories for {category.name}. Check back soon or browse other categories.
        </EmptyState>
      ) : (
        <>
          <section aria-labelledby="rankings">
            <SectionHeading id="rankings" title={`Top ${category.name} repositories`} />
            <Leaderboard
              boards={toLeaderboardData(boards, categories, asOf)}
              categories={categories}
              currentCategory={category.slug}
            />
          </section>
          <section aria-labelledby="all" className="pt-16">
            <SectionHeading id="all" title={`All ${category.name} repositories`} description={`${repos.length} published`} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {repos.map((r) => (
                <RepoCard key={r.slug} repo={r} category={category} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
