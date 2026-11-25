import type { MetadataRoute } from "next";
import { getCategories, getSitemapRepositories } from "@/lib/data";
import { absoluteUrl } from "@/lib/seo";

// Published content only (the data layer never returns drafts). Split with generateSitemaps
// once there are more than ~5,000 URLs.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, repos] = await Promise.all([getCategories(), getSitemapRepositories()]);
  const latest = repos.map((r) => r.lastModified).filter((d): d is string => !!d).sort().at(-1);
  return [
    { url: absoluteUrl("/"), lastModified: latest, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/categories"), changeFrequency: "weekly", priority: 0.6 },
    ...categories.map((c) => ({ url: absoluteUrl(`/categories/${c.slug}`), changeFrequency: "daily" as const, priority: 0.7 })),
    ...repos.map((r) => ({
      url: absoluteUrl(`/repo/${r.slug}`),
      lastModified: r.lastModified ?? undefined,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...["/about", "/contact", "/privacy", "/terms", "/disclaimer"].map((p) => ({ url: absoluteUrl(p), priority: 0.2 })),
  ];
}
