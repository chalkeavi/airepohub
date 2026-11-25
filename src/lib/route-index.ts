// Known public URLs, used by src/proxy.ts to answer unknown slugs with a real 404 status and to
// 301 old repository slugs (repository_aliases) before the page starts streaming.
// Pure decision logic + a small fetcher over Supabase's REST API (publishable key, so RLS
// limits it to published rows). No server-only import: proxy runs outside the page render.

export interface RouteIndex {
  repos: Set<string>;
  categories: Set<string>;
  /** old slug → canonical slug */
  aliases: Map<string, string>;
}

export type RouteDecision = { action: "next" } | { action: "redirect"; location: string } | { action: "not_found" };

export function decideRoute(pathname: string, index: RouteIndex): RouteDecision {
  const match = /^\/(repo|categories)\/([^/]+)\/?$/.exec(pathname);
  if (!match) return { action: "next" };
  const [, section, rawSlug] = match;
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    return { action: "not_found" };
  }
  const lower = slug.toLowerCase();

  if (section === "categories") {
    if (index.categories.has(slug)) return { action: "next" };
    if (index.categories.has(lower)) return { action: "redirect", location: `/categories/${lower}` };
    return { action: "not_found" };
  }
  if (index.repos.has(slug)) return { action: "next" };
  if (index.repos.has(lower)) return { action: "redirect", location: `/repo/${lower}` };
  const target = index.aliases.get(lower);
  if (target && index.repos.has(target)) return { action: "redirect", location: `/repo/${target}` };
  return { action: "not_found" };
}

const TTL_MS = 5 * 60 * 1000;
let cached: { index: RouteIndex; expires: number } | null = null;

/** Loads (and caches per instance for 5 minutes) the route index. Null when Supabase isn't configured or unreachable. */
export async function loadRouteIndex(now = Date.now()): Promise<RouteIndex | null> {
  if (cached && cached.expires > now) return cached.index;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const get = async <T,>(path: string): Promise<T> => {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, accept: "application/json" } });
    if (!res.ok) throw new Error(`route index ${path}: ${res.status}`);
    return res.json() as Promise<T>;
  };
  try {
    const [repos, categories, aliases] = await Promise.all([
      get<{ slug: string }[]>("repositories?select=slug&status=eq.published"),
      get<{ slug: string }[]>("categories?select=slug"),
      get<{ alias_slug: string | null; repositories: { slug: string } | null }[]>(
        "repository_aliases?select=alias_slug,repositories(slug)&alias_slug=not.is.null",
      ),
    ]);
    const index: RouteIndex = {
      repos: new Set(repos.map((r) => r.slug)),
      categories: new Set(categories.map((c) => c.slug)),
      aliases: new Map(
        aliases.filter((a) => a.alias_slug && a.repositories).map((a) => [a.alias_slug!.toLowerCase(), a.repositories!.slug]),
      ),
    };
    cached = { index, expires: now + TTL_MS };
    return index;
  } catch {
    return null; // fail open: the page itself still renders not-found with noindex
  }
}
