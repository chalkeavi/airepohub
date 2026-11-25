import Link from "next/link";
import { getSearchSuggestions } from "@/lib/data";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { NAV_LINKS } from "./nav-links";
import { SearchBox } from "./search-box";
import { ThemeToggle } from "./theme-toggle";

export async function Header() {
  const suggestions = await getSearchSuggestions();
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="container-page flex h-16 items-center gap-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <SearchBox suggestions={suggestions} shortcut className="hidden w-64 md:block lg:w-80" />
          <ThemeToggle />
          <MobileNav suggestions={suggestions} />
        </div>
      </div>
    </header>
  );
}
