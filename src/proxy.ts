import { NextResponse, type NextRequest } from "next/server";
import { decideRoute, loadRouteIndex } from "@/lib/route-index";

// Runs before rendering, so it can still set the HTTP status: unknown repo/category slugs get a
// real 404 (pages stream, which would otherwise commit to 200), and old slugs get a 301.
export async function proxy(request: NextRequest) {
  const index = await loadRouteIndex();
  if (!index) return NextResponse.next();
  const decision = decideRoute(request.nextUrl.pathname, index);
  if (decision.action === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = decision.location;
    return NextResponse.redirect(url, 301);
  }
  if (decision.action === "not_found") {
    // Rewriting to a path no route matches renders app/not-found.tsx with status 404.
    return NextResponse.rewrite(new URL("/__not-found", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/repo/:slug", "/categories/:slug"],
};
