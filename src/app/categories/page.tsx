import type { Metadata } from "next";
import Link from "next/link";
import { CategoryIcon } from "@/components/repo/category-icon";
import { getCategories, getCategoryCounts } from "@/lib/data";

export const metadata: Metadata = {
  title: "AI repository categories",
  description: "Browse open-source AI GitHub repositories by category: agents, coding assistants, local LLMs, RAG and more.",
  alternates: { canonical: "/categories" },
};

export default async function CategoriesPage() {
  const [categories, counts] = await Promise.all([getCategories(), getCategoryCounts()]);
  return (
    <div className="container-page pt-12">
      <p className="eyebrow mb-2">Explore</p>
      <h1 className="text-4xl font-semibold tracking-[-0.035em]">Categories</h1>
      <p className="mt-2 max-w-xl text-muted-foreground">Find the right open-source AI tool for the job.</p>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/categories/${c.slug}`}
              className="group flex h-full gap-4 rounded-xl border border-border bg-surface p-5 shadow-card transition-[border-color,box-shadow] hover:border-accent/40 hover:shadow-raised"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-soft-foreground group-hover:bg-accent group-hover:text-accent-foreground">
                <CategoryIcon name={c.icon} className="size-5" />
              </span>
              <span>
                <span className="block font-semibold">{c.name}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{c.description}</span>
                <span className="mt-2 block text-xs font-medium text-muted-foreground">{counts[c.slug] ?? 0} repositories</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
