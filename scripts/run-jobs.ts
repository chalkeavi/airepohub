// Entry point for the scheduled jobs (GitHub Actions: .github/workflows/daily-jobs.yml).
//   node --experimental-strip-types scripts/run-jobs.ts <daily|snapshot|rank|discover> [--dry-run]
//   ... import [--target=5000] [--min-stars=500] [--pushed-days=540] [--index] [--dry-run]
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GITHUB_TOKEN (Actions provides it).
// --dry-run reads through the public publishable key and GitHub, and writes nothing.
import { GithubClient } from "../src/lib/jobs/github.ts";
import { runImport } from "../src/lib/jobs/importer.ts";
import { runDiscover, runRank, runSnapshot, type JobSummary } from "../src/lib/jobs/jobs.ts";
import { SupabaseJobStore } from "../src/lib/jobs/store.ts";

const [job = "daily", ...flags] = process.argv.slice(2);
const dryRun = flags.includes("--dry-run");
const flag = (name: string, fallback: number) => {
  const raw = flags.find((f) => f.startsWith(`--${name}=`))?.split("=")[1];
  const n = raw ? Number(raw) : fallback;
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Bad --${name}`);
  return n;
};
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = dryRun
  ? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  : process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (add the key as a GitHub Actions secret).");
  process.exit(1);
}

const ctx = {
  store: new SupabaseJobStore(url, key),
  github: new GithubClient(process.env.GITHUB_TOKEN),
  now: new Date(),
  dryRun,
  log: (m: string) => console.log(m),
};

const plan: Record<string, (() => Promise<JobSummary>)[]> = {
  snapshot: [() => runSnapshot(ctx)],
  rank: [() => runRank(ctx)],
  discover: [() => runDiscover(ctx)],
  // Bulk import of basic pages, then rankings so the new repos appear on the boards right away.
  import: [
    () =>
      runImport(ctx, {
        target: flag("target", 5000),
        minStars: flag("min-stars", 500),
        pushedSince: new Date(ctx.now.getTime() - flag("pushed-days", 540) * 86_400_000).toISOString().slice(0, 10),
        noindex: !flags.includes("--index"),
      }),
    ...(dryRun ? [] : [() => runRank(ctx)]),
  ],
  // Snapshot first so rankings use today's stars; discovery last (it only queues for review).
  daily: [() => runSnapshot(ctx), () => runRank(ctx), () => runDiscover(ctx)],
};
if (!plan[job]) {
  console.error(`Unknown job "${job}". Use one of: ${Object.keys(plan).join(", ")}`);
  process.exit(1);
}

const results: JobSummary[] = [];
for (const step of plan[job]) results.push(await step());
if (dryRun) console.log(JSON.stringify(results.map((r) => ({ job: r.job, status: r.status, details: r.details })), null, 2));
// A failed job fails the workflow so GitHub emails the owner; "partial" (rate limit) does not.
process.exit(results.some((r) => r.status === "failed") ? 1 : 0);
