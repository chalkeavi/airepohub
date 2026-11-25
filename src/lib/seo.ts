// Pure SEO helpers (titles, descriptions, JSON-LD). See docs/seo-strategy.md.
import type { Category, Repository, RepositoryContent } from "@/lib/types";

export const SITE_NAME = "AIRepoHub";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Cut at a word boundary so the result (plus an ellipsis) is at most `max` characters. */
export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

/** The layout template appends " | AIRepoHub" (12 chars); keep the whole title ≤ 60. */
const TITLE_MAX = 60 - ` | ${SITE_NAME}`.length;

export function repoTitle(repo: Pick<Repository, "name" | "summary">, override?: string | null): string {
  if (override) return override;
  // Prefer "Name: what it does" when the summary's first clause fits; never cut a sentence mid-way.
  const clause = repo.summary?.split(/[.;:]/)[0].trim();
  const candidates = [
    clause ? `${repo.name}: ${clause}` : null,
    `${repo.name}: what it is and how to install it`,
    `${repo.name} install guide`,
  ];
  return candidates.find((c): c is string => !!c && c.length <= TITLE_MAX) ?? truncate(repo.name, TITLE_MAX);
}

export function repoDescription(
  repo: Pick<Repository, "name" | "summary" | "description">,
  hasGuide: boolean,
  override?: string | null,
): string {
  if (override) return truncate(override, 160);
  const base = (repo.summary ?? repo.description ?? `${repo.name} on GitHub`).trim().replace(/\.?$/, ".");
  const suffix = hasGuide ? " Install guide, tutorial and costs." : " Stars, activity and alternatives.";
  return base.length + suffix.length <= 160 ? base + suffix : truncate(base, 160);
}

type JsonLd = Record<string, unknown>;

export function breadcrumbJsonLd(items: { name: string; path: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** Facts only from GitHub metadata; no ratings or download counts we don't have. */
export function softwareSourceCodeJsonLd(repo: Repository, content: RepositoryContent | null): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: repo.name,
    description: repo.summary ?? repo.description ?? undefined,
    url: absoluteUrl(`/repo/${repo.slug}`),
    codeRepository: repo.githubUrl,
    programmingLanguage: repo.primaryLanguage ?? undefined,
    license: repo.licenseKey && repo.licenseKey !== "NOASSERTION" ? `https://spdx.org/licenses/${repo.licenseKey}` : undefined,
    author: { "@type": "Organization", name: repo.owner, url: `https://github.com/${repo.owner}` },
    keywords: repo.topics.length ? repo.topics.join(", ") : undefined,
    dateCreated: repo.createdAtGithub ?? undefined,
    dateModified: repo.lastPushedAt ?? undefined,
    ...(repo.homepageUrl ? { sameAs: [repo.homepageUrl] } : {}),
    ...(content?.install.supportedOs.length ? { runtimePlatform: content.install.supportedOs.join(", ") } : {}),
  };
}

/** HowTo only for guides we actually ran (verification_status = verified). */
export function howToJsonLd(repo: Repository, content: RepositoryContent | null): JsonLd | null {
  if (!content || content.install.verification !== "verified") return null;
  const guide = content.install.guides[0];
  if (!guide) return null;
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `How to install ${repo.name}`,
    step: guide.steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.title,
      text: [s.body, s.code].filter(Boolean).join("\n"),
    })),
  };
}

export function itemListJsonLd(name: string, repos: Pick<Repository, "name" | "slug">[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: repos.map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: r.name,
      url: absoluteUrl(`/repo/${r.slug}`),
    })),
  };
}

export function websiteJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${absoluteUrl("/search")}?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function categoryBreadcrumbs(category: Pick<Category, "name" | "slug">) {
  return [
    { name: "Home", path: "/" },
    { name: "Categories", path: "/categories" },
    { name: category.name, path: `/categories/${category.slug}` },
  ];
}

/** Serialize JSON-LD for a <script> tag; escapes "<" so content can't close the tag. */
export function jsonLdString(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data, (_k, v) => (v === undefined ? undefined : v)).replace(/</g, "\\u003c");
}
