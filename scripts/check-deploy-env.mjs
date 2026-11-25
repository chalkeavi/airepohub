// Run before the Cloudflare build. Without these, the data layer silently falls back to sample data
// and canonical URLs point at localhost, so a production build must stop here instead.
import { existsSync } from "node:fs";

// Next.js reads .env.production during the build; load it here too so the check sees the same values.
// loadEnvFile never overrides variables already set (e.g. in the Cloudflare dashboard).
if (existsSync(".env.production")) process.loadEnvFile(".env.production");

const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SITE_URL"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing build variables: ${missing.join(", ")}. Set them in Cloudflare → Worker → Settings → Build → Variables and secrets.`);
  process.exit(1);
}
if (/localhost|127\.0\.0\.1/.test(process.env.NEXT_PUBLIC_SITE_URL)) {
  console.error("NEXT_PUBLIC_SITE_URL points at localhost; set it to the live URL (workers.dev or your domain).");
  process.exit(1);
}
if (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
  console.error("A Supabase service-role key is set in the site build. Remove it: only GitHub Actions should have it.");
  process.exit(1);
}
console.log("Deploy env OK:", process.env.NEXT_PUBLIC_SITE_URL);
