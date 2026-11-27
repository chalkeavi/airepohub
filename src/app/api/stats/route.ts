import { getPublishedCountLive } from "@/lib/data";

// Live numbers for the homepage stats bar (decision #40). The page itself stays cached; this
// answers fresh on every call. (Streaming a dynamic part into the cached page doesn't run on
// Cloudflare Workers, which serve the cached shell only.)
export async function GET() {
  const repositories = await getPublishedCountLive();
  return Response.json({ repositories }, { headers: { "cache-control": "no-store" } });
}
