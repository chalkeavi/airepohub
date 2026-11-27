// Entry point for the scheduled jobs (GitHub Actions: .github/workflows/daily-jobs.yml).
//   node --experimental-strip-types scripts/run-jobs.ts <daily|snapshot|rank|discover> [--dry-run]
//   ... import [--target=5000] [--min-stars=500] [--pushed-days=540] [--index] [--dry-run]
//              [--summaries=file|claude|none] [--candidates-out=path.json]
//   ... summarize [--limit=5000]   (Claude backfill for published repos without a summary)
// --summaries=file reads data/summaries.json; claude needs ANTHROPIC_API_KEY (SUMMARY_MODEL to override).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GITHUB_TOKEN (Actions provides it).
// --dry-run reads through the public publishable key and GitHub, and writes nothing.
//   ... write [--limit=20] [--min-stars=500] [--pushed-days=180] [--drafts] [--dry-run] [--out=dir]
//       Local writer (decision #38): any LLM writes full pages for repos not on the site yet and
//       stores them in Supabase. Needs LLM_MODEL (+ LLM_PROVIDER, LLM_API_KEY, LLM_BASE_URL).
//       See docs/local-writer.md. Settings can live in a .env.jobs file (never committed).
import { GithubClient } from "../src/lib/jobs/github.ts";
import { runImport, runPublishQueue } from "../src/lib/jobs/importer.ts";
import { runDiscover, runRank, runSnapshot, type JobSummary } from "../src/lib/jobs/jobs.ts";
import { ClaudeBatchSummarizer, FileSummarizer, runPublishDrafts, runSummarize, type Summarizer } from "../src/lib/jobs/summarize.ts";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { llmFromEnv } from "../src/lib/jobs/llm.ts";
import { runWriter } from "../src/lib/jobs/writer.ts";
import { runPublishGuides, type GuideFile } from "../src/lib/jobs/guides.ts";
import { SupabaseJobStore } from "../src/lib/jobs/store.ts";

// Local runs keep their keys in .env.jobs (git-ignored). Variables already set in the shell win.
if (existsSync(".env.jobs")) process.loadEnvFile(".env.jobs");

const [job = "daily", ...flags] = process.argv.slice(2);
const dryRun = flags.includes("--dry-run");
const text = (name: string) => flags.find((f) => f.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
function summarizer(fallback = "none"): Summarizer | undefined {
  const kind = text("summaries") ?? fallback;
  if (kind === "none") return undefined;
  if (kind === "file") return new FileSummarizer(JSON.parse(readFileSync("data/summaries.json", "utf8")) as Record<string, string>);
  if (kind === "claude") {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("Add the ANTHROPIC_API_KEY repository secret to write summaries with Claude.");
    return new ClaudeBatchSummarizer(process.env.SUMMARY_MODEL || "claude-opus-5-5");
  }
  throw new Error(`Unknown --summaries=${kind}`);
}
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
        summarizer: summarizer(),
      }),
    // Repos imported in an earlier run without a summary stay drafts; publish those that now have one.
    ...(text("summaries") === "file" ? [() => runPublishDrafts(ctx, summarizer("file")!)] : []),
    ...(dryRun ? [] : [() => runRank(ctx)]),
  ],
  "publish-drafts": [
    () => runPublishDrafts(ctx, summarizer("file")!),
    ...(dryRun ? [] : [() => runRank(ctx)]),
  ],
  // Snapshot first so rankings use today's stars; discovery last (it only queues for review).
  // Daily: publish queued repos that have a summary in data/summaries.json, then re-rank.
  "publish-queue": [
    () => runPublishQueue(ctx, summarizer("file") ?? new FileSummarizer({}), { noindex: !flags.includes("--index") }),
    ...(dryRun ? [] : [() => runRank(ctx)]),
  ],
  // Full guides from data/guides/*.json (only repos already on the site; others wait).
  "publish-guides": [
    () =>
      runPublishGuides(
        ctx,
        readdirSync("data/guides")
          .filter((f) => f.endsWith(".json"))
          .map((f) => JSON.parse(readFileSync(`data/guides/${f}`, "utf8")) as GuideFile),
      ),
  ],
  write: [
    () => {
      const outDir = text("out") ?? ".writer-preview";
      return runWriter(ctx, {
        llm: llmFromEnv(process.env as Record<string, string | undefined>),
        limit: flag("limit", Number(process.env.WRITER_LIMIT) || 20),
        minStars: flag("min-stars", Number(process.env.WRITER_MIN_STARS) || 500),
        pushedSince: new Date(ctx.now.getTime() - flag("pushed-days", 180) * 86_400_000).toISOString().slice(0, 10),
        readmeChars: Number(process.env.WRITER_README_CHARS) || undefined,
        drafts: flags.includes("--drafts"),
        searchDelayMs: Math.ceil(60_000 / ctx.github.searchesPerMinute) + 100,
        onPreview: (guide) => {
          mkdirSync(outDir, { recursive: true });
          writeFileSync(`${outDir}/${guide.fullName.replace("/", "__")}.json`, JSON.stringify(guide, null, 2) + "\n");
        },
      });
    },
    ...(dryRun ? [] : [() => runRank(ctx)]),
  ],
  summarize: [() => runSummarize(ctx, summarizer() ?? new ClaudeBatchSummarizer(process.env.SUMMARY_MODEL || "claude-opus-5-5"), flag("limit", 5000))],
  daily: [() => runSnapshot(ctx), () => runRank(ctx), () => runDiscover(ctx)],
};
if (!plan[job]) {
  console.error(`Unknown job "${job}". Use one of: ${Object.keys(plan).join(", ")}`);
  process.exit(1);
}

const results: JobSummary[] = [];
for (const step of plan[job]) results.push(await step());
const out = text("candidates-out");
if (out) {
  writeFileSync(out, JSON.stringify(results.flatMap((r) => (r.details.candidates as unknown[]) ?? []), null, 1));
  for (const r of results) delete r.details.candidates;
}
if (dryRun) console.log(JSON.stringify(results.map((r) => ({ job: r.job, status: r.status, details: r.details })), null, 2));
// A failed job fails the workflow so GitHub emails the owner; "partial" (rate limit) does not.
process.exit(results.some((r) => r.status === "failed") ? 1 : 0);
