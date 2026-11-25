import { getPublishedSlugs, getRepositoryBySlug } from "@/lib/data";
import { OG_SIZE, ogCard } from "@/lib/og/card";
import { truncate } from "@/lib/seo";
import { formatCount } from "@/lib/utils";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "AIRepoHub repository guide";

export async function generateStaticParams() {
  return (await getPublishedSlugs()).map((slug) => ({ slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const repo = await getRepositoryBySlug(slug);
  if (!repo) return ogCard({ eyebrow: "Open-source AI", title: "Discover. Install. Build." });
  return ogCard({
    eyebrow: `${repo.owner} / ${repo.name}`,
    title: repo.name,
    subtitle: repo.summary ? truncate(repo.summary, 110) : undefined,
    chips: [`${formatCount(repo.stars)} ${repo.stars === 1 ? "star" : "stars"}`, repo.primaryLanguage, repo.hasFullContent ? "Install guide" : null].filter(
      (c): c is string => !!c,
    ),
  });
}
