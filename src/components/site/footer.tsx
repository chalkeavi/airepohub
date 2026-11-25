import { GithubIcon } from "@/components/ui/github-icon";
import Link from "next/link";
import { getCategories } from "@/lib/data";
import { LogoMark } from "./logo";

const LEGAL = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms" },
  { href: "/disclaimer", label: "Disclaimer" },
];

export async function Footer() {
  const categories = await getCategories();
  return (
    <footer className="mt-24 border-t border-border bg-surface/50">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <span className="text-[17px] font-semibold tracking-[-0.03em]">
              AIRepo<span className="text-accent">Hub</span>
            </span>
          </div>
          <p className="mt-3 text-sm font-medium">Discover. Install. Build.</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Plain-English guides to open-source AI repositories: what they do, who they&apos;re for, and how to
            get them running.
          </p>
        </div>
        <div>
          <p className="eyebrow mb-3">Categories</p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-1">
            {categories.slice(0, 6).map((c) => (
              <li key={c.slug}>
                <Link href={`/categories/${c.slug}`} className="text-muted-foreground hover:text-foreground">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-3">AIRepoHub</p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-1">
            {LEGAL.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-muted-foreground hover:text-foreground">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="container-page flex flex-col gap-2 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5">
            <GithubIcon className="size-3.5 shrink-0" />
            Repository data from the GitHub API. Projects belong to their maintainers and keep their own licenses.
          </p>
          <p>AIRepoHub is not affiliated with GitHub.</p>
        </div>
      </div>
    </footer>
  );
}
