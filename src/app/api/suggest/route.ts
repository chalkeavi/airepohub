import type { NextRequest } from "next/server";
import { suggestRepositories } from "@/lib/data";

// Search-as-you-type for the whole catalog (the list embedded in each page only has the top repos).
// Published repos only, via the data layer; results cached per query there and in the browser.
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  const results = await suggestRepositories(q);
  return Response.json(results, { headers: { "cache-control": "public, max-age=300, s-maxage=3600" } });
}
