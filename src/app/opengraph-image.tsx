import { OG_SIZE, ogCard } from "@/lib/og/card";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "AIRepoHub: discover the best open-source AI tools";

export default function Image() {
  return ogCard({
    eyebrow: "Discover. Install. Build.",
    title: "The best open-source AI tools",
    subtitle: "Plain-English guides to GitHub's AI repositories: what they do, how to install them, what they cost.",
  });
}
