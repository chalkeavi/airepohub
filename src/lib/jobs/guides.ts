// Full product-page guides (owner request 2026-11-25, decision #35): the OpenSEO-style sections
// (overview, features, install, quick start, costs, troubleshooting) written in plain English
// from a repo's own README, pinned to a commit. Stored as data/guides/<owner>__<name>.json and
// published by the `publish-guides` job. A repo with a published guide is indexable.
import type { RepositoryContent } from "../types.ts";
import type { JobContext, JobSummary } from "./jobs.ts";
import { runLogged } from "./jobs.ts";

export interface GuideFile {
  fullName: string;
  /** Optional replacement for the one-line summary. */
  summary?: string;
  content: RepositoryContent;
}

/** Structural and honesty checks. Returns a list of problems (empty = ok). */
export function checkGuide(g: GuideFile): string[] {
  const p: string[] = [];
  const c = g.content;
  const repoUrl = `https://github.com/${g.fullName}/`.toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(c.sourceCommitSha ?? "")) p.push("sourceCommitSha must be a full commit SHA");
  if (!c.sourceUrls?.length) p.push("needs at least one source URL");
  for (const u of c.sourceUrls ?? []) {
    if (!u.toLowerCase().startsWith(repoUrl) && !/^https:\/\//.test(u)) p.push(`bad source URL ${u}`);
  }
  if (!c.sourceUrls?.some((u) => u.toLowerCase().startsWith(repoUrl) && u.includes(c.sourceCommitSha ?? "-"))) {
    p.push("at least one source URL must point into the repo at the pinned commit");
  }
  if (c.install?.verification === "verified") p.push("install guides can't be 'verified' without a real test run");
  if (!c.install?.sourceUrl) p.push("install.sourceUrl is required");
  if (!c.install?.guides?.length || c.install.guides.some((x) => !x.steps.length)) p.push("needs at least one install guide with steps");
  const keys = (c.install?.guides ?? []).map((x) => `${x.os}/${x.method}`);
  if (new Set(keys).size !== keys.length) p.push("install guides need a unique os + method pair (database constraint)");
  const s = c.sixtySeconds;
  if (!s?.whatItDoes || !s.problem || !s.whyChoose || !s.whoFor?.length) p.push("sixtySeconds is incomplete");
  if (!c.overview?.length) p.push("overview is empty");
  if ((c.features?.length ?? 0) < 3) p.push("needs at least 3 features");
  if (!c.costs?.length) p.push("costs is empty");
  if (!c.tutorial?.title || !c.tutorial.steps?.length || !c.tutorial.sourceUrl) p.push("tutorial is incomplete");
  if (!c.lastReviewedAt) p.push("lastReviewedAt is required");
  return p;
}

export function runPublishGuides(ctx: JobContext, guides: GuideFile[]): Promise<JobSummary> {
  return runLogged(ctx, "publish-guides", async (details) => {
    const ids = await ctx.store.repoIdsByFullName(guides.map((g) => g.fullName));
    const rejected: Record<string, string[]> = {};
    const missing: string[] = [];
    const published: string[] = [];
    for (const g of guides) {
      const problems = checkGuide(g);
      if (problems.length) {
        rejected[g.fullName] = problems;
        continue;
      }
      const id = ids.get(g.fullName.toLowerCase());
      if (!id) {
        missing.push(g.fullName); // not imported (or not published) yet; picked up on a later run
        continue;
      }
      try {
        if (!ctx.dryRun) await ctx.store.saveGuide(id, g.content, g.summary);
        published.push(g.fullName);
      } catch (e) {
        rejected[g.fullName] = [`save failed: ${e instanceof Error ? e.message : String(e)}`]; // one bad guide never blocks the rest
      }
    }
    Object.assign(details, { processed: published.length, published, rejected, not_on_site: missing });
    return { processed: published.length, failed: Object.keys(rejected).length };
  });
}
