import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Repo count and "Recently added" refresh every 10 minutes so writer runs show up quickly;
  // everything else keeps the built-in "hours" profile (about an hour).
  cacheLife: {
    catalogCount: { stale: 300, revalidate: 600, expire: 86400 },
  },
  partialPrefetching: true,
  // Next's image optimizer isn't available on Cloudflare Workers without extra setup (decision #13).
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
