// Local writer job (owner request 2026-11-26, decision #38). Run on the owner's computer (or any
// machine with the keys) with any LLM: finds AI repos that aren't on the site yet, reads each
// README at a pinned commit, has the model write the product page in our format, checks it, and
// stores it straight in Supabase. No pull request and no redeploy: the site reads the database.
//
// Honesty rules (CLAUDE.md): the model may only restate what the README says. Every command
// must appear in the README word for word, every number and link in the prose must too, and the
// install guide is marked official_docs (never verified). Anything that fails is not published.
import type { InstallationGuide, OsTarget, RepositoryContent } from "../types.ts";
import { RateLimitError, type GithubRepo } from "./github.ts";
import { checkGuide, type GuideFile } from "./guides.ts";
import { isoDay } from "./growth.ts";
import { categorize, fromQueuePayload, IMPORT_TOPICS, importEligible, starBands, uniqueSlug } from "./importer.ts";
import type { JobContext, JobSummary } from "./jobs.ts";
import { runLogged, toRepoUpdate } from "./jobs.ts";
import type { LlmClient } from "./llm.ts";
import { validateSummary, type SummaryInput } from "./summarize.ts";

export const WRITER_SYSTEM = `You write product pages for AIRepoHub, a directory that explains open-source AI tools to beginners.
You get one GitHub repository: its GitHub facts and its README. Write the page in plain, friendly English, in your own words.

Honesty rules (a page that breaks one is thrown away):
- Use only what the README and the GitHub facts say. Never add features, numbers, prices, benchmarks, comparisons or claims.
- Commands ("code" fields and heroCommands) must be copied exactly from the README, character for character. Never invent, merge or "fix" a command. If the README has no install commands, use one install guide with method "docs" whose steps tell the reader where in the README or docs to look, with no code.
- Only write a number (version, size, count) if that exact number is in the README. Only write a link if that exact link is in the README.
- No marketing words: powerful, best, revolutionary, blazing, cutting-edge, seamless, state-of-the-art, world-class, game-changing.
- Costs: say the software is free and open source only if the license allows it; mention paid API keys, hosted plans or hardware only if the README does. If unsure, say it depends.
- Skip (see below) anything AIRepoHub doesn't list: leaked or jailbreak prompt collections, free access to paid models through proxies or reverse-engineered APIs, deepfake / face-swap / voice-cloning of real people, face recognition that guesses race or other personal attributes, social-media auto-posting or spam bots, adult content, discontinued or archived projects, and lists, books or courses rather than tools.
- If the README is too thin, not in English enough, not really a usable tool, or you can't write an honest page, reply with {"skip": "<short reason>"}.

Reply with ONE JSON object and nothing else (no markdown fences), with these fields:
{
  "summary": "One sentence, 8 to 22 words, saying what it is and what people use it for. Don't start with the project name, 'This' or 'An open-source'. End with a full stop.",
  "type": "Short label such as 'Desktop app', 'Python library', 'CLI tool', 'Web app', 'Framework'",
  "whatItDoes": "1-2 sentences",
  "problem": "1-2 sentences: the problem it solves",
  "whoFor": ["2-4 kinds of people"],
  "whyChoose": "1-2 sentences, from the README's own stated goals",
  "requirements": ["what you need before starting, e.g. Python, a GPU, an API key (only if the README says so)"],
  "overview": ["2-3 short paragraphs"],
  "features": [{"title": "...", "body": "one sentence"}],
  "strengths": ["..."],
  "limitations": ["..."],
  "useCases": [{"title": "...", "body": "one sentence"}],
  "prerequisites": ["..."],
  "supportedOs": ["Windows", "macOS", "Linux"],
  "install": [{"os": "all|windows|macos|linux", "label": "e.g. Install with pip", "method": "pip|docker|source|binary|npm|docs|...",
               "steps": [{"title": "...", "body": "optional explanation", "code": "optional command copied from the README"}]}],
  "environment": [{"name": "ENV_VAR", "required": true, "description": "..."}],
  "firstRun": [{"title": "...", "body": "...", "code": "..."}],
  "tutorial": {"title": "...", "useCase": "...", "setup": ["..."], "steps": [{"title": "...", "body": "...", "code": "..."}], "expected": "what the reader should see", "nextSteps": ["..."]},
  "costs": [{"label": "Software", "value": "...", "tone": "free|paid|depends"}],
  "troubleshooting": [{"problem": "...", "solution": "..."}],
  "bestFor": ["3-5 short phrases"],
  "heroCommands": [{"comment": "Install", "command": "copied from the README"}]
}

Field notes: 3 to 6 features; 2 to 4 useCases; limitations, environment and troubleshooting only from what the README states (else []); supportedOs only what the README supports (Windows, macOS, Linux, Web, Android, iOS, Docker); 0 to 2 heroCommands; install "os" is exactly one of all, windows, macos, linux.`;

/** Editorial exclusions (decisions #34, #37), checked on name/description/topics before any model call. */
export const EXCLUDED = /\b(leak(s|ed)?|jailbreak\w*|deep-?fakes?|face-?swap\w*|free[- ](gpt|chatgpt|claude|api)|gpt4free|reverse[- ]engineered api|nsfw)\b|prompts?_leaks/i;

export function editoriallyExcluded(g: GithubRepo): boolean {
  return EXCLUDED.test([g.full_name, g.description ?? "", ...(g.topics ?? [])].join(" "));
}

const ICONS = ["layers", "scan-search", "puzzle", "file-code", "git-compare", "shield"];
const OS_TARGETS: OsTarget[] = ["all", "windows", "macos", "linux"];
const HYPE = /\b(powerful|best|revolutionary|blazing|cutting[- ]edge|seamless(ly)?|state[- ]of[- ]the[- ]art|world[- ]class|game[- ]chang\w*)/i;

/** Drop badges, images, HTML and blank runs so a small model's context goes to the actual text. */
export function cleanReadme(raw: string, maxChars: number): string {
  let s = raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "") // linked badges
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/<(img|br|hr)[^>]*>/gi, "")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (s.length > maxChars) s = `${s.slice(0, maxChars)}\n\n[README truncated]`;
  return s;
}

export function writerPrompt(g: GithubRepo, readme: string): string {
  return [
    `Repository: ${g.full_name}`,
    `GitHub description: ${g.description ?? "(none)"}`,
    `Main language: ${g.language ?? "unknown"}`,
    `License: ${g.license?.spdx_id && g.license.spdx_id !== "NOASSERTION" ? g.license.spdx_id : "not stated on GitHub"}`,
    `Topics: ${(g.topics ?? []).slice(0, 15).join(", ") || "(none)"}`,
    `Homepage: ${g.homepage || "(none)"}`,
    "",
    "README:",
    readme,
  ].join("\n");
}

/** The model's JSON (fences and chatter around it tolerated). Null when there's no object. */
export function parseModelJson(text: string): Record<string, unknown> | null {
  const t = text.replace(/```(?:json)?/gi, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(t.slice(start, end + 1)) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const objs = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x)) : [];
const steps = (v: unknown) =>
  objs(v)
    .map((s) => ({ title: str(s.title), body: str(s.body), code: str(s.code) }))
    .filter((s) => s.title)
    .map((s) => ({ title: s.title, ...(s.body ? { body: s.body } : {}), ...(s.code ? { code: s.code, lang: "bash" as const } : {}) }));

/** Model JSON → our GuideFile, with everything we know for sure (commit, sources, dates, facts) filled in by code. */
export function buildGuide(g: GithubRepo, sha: string, readmePath: string, m: Record<string, unknown>, today: string): GuideFile {
  const src = `https://github.com/${g.full_name}/blob/${sha}/${readmePath}`;
  const seen = new Map<string, number>();
  const guides: InstallationGuide[] = objs(m.install).map((x) => {
    const os = str(x.os).toLowerCase() as OsTarget;
    const method = str(x.method).toLowerCase() || "docs";
    const key = `${os}/${method}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return { os, label: str(x.label) || "Install", method: n > 1 ? `${method}-${n}` : method, steps: steps(x.steps) };
  });
  const t = (m.tutorial && typeof m.tutorial === "object" ? m.tutorial : {}) as Record<string, unknown>;
  const license = g.license?.spdx_id && g.license.spdx_id !== "NOASSERTION" ? g.license.spdx_id : null;
  const content: RepositoryContent = {
    sourceUrls: [src],
    sourceCommitSha: sha,
    lastReviewedAt: today,
    heroCommands: objs(m.heroCommands)
      .map((h) => ({ comment: str(h.comment), command: str(h.command) }))
      .filter((h) => h.command)
      .slice(0, 2)
      .map((h) => (h.comment ? h : { command: h.command })),
    sixtySeconds: {
      whatItDoes: str(m.whatItDoes),
      problem: str(m.problem),
      whoFor: strs(m.whoFor),
      whyChoose: str(m.whyChoose),
      requirements: strs(m.requirements),
    },
    overview: strs(m.overview),
    features: objs(m.features)
      .map((f) => ({ title: str(f.title), body: str(f.body) }))
      .filter((f) => f.title && f.body)
      .slice(0, 6)
      .map((f, i) => ({ ...f, icon: ICONS[i % ICONS.length] })),
    strengths: strs(m.strengths),
    limitations: strs(m.limitations),
    useCases: objs(m.useCases).map((u) => ({ title: str(u.title), body: str(u.body) })).filter((u) => u.title && u.body),
    install: {
      verification: "official_docs",
      verificationNote: `Commands come from ${g.name}'s README. AIRepoHub hasn't run them yet.`,
      sourceUrl: src,
      prerequisites: strs(m.prerequisites),
      supportedOs: strs(m.supportedOs),
      guides,
      environment: objs(m.environment)
        .map((e) => ({ name: str(e.name), required: e.required === true, description: str(e.description) }))
        .filter((e) => e.name),
      firstRun: steps(m.firstRun),
      expectedOutput: null,
    },
    tutorial: {
      title: str(t.title),
      useCase: str(t.useCase),
      setup: strs(t.setup),
      steps: steps(t.steps),
      expected: str(t.expected),
      nextSteps: strs(t.nextSteps),
      sourceUrl: src,
    },
    costs: objs(m.costs)
      .map((c) => ({ label: str(c.label), value: str(c.value), tone: str(c.tone) }))
      .filter((c) => c.label && c.value)
      .map((c) => (["free", "paid", "depends"].includes(c.tone) ? { label: c.label, value: c.value, tone: c.tone as "free" | "paid" | "depends" } : { label: c.label, value: c.value })),
    troubleshooting: objs(m.troubleshooting)
      .map((x) => ({ problem: str(x.problem), solution: str(x.solution), sourceUrl: src }))
      .filter((x) => x.problem && x.solution),
    bestFor: strs(m.bestFor),
    facts: [
      ...(str(m.type) ? [{ label: "Type", value: str(m.type) }] : []),
      ...(g.language ? [{ label: "Language", value: g.language }] : []),
      ...(license ? [{ label: "License", value: license }] : []),
    ],
  };
  return { fullName: g.full_name, summary: str(m.summary), content };
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Commands, numbers and links must come from the README; no hype; valid OS values. */
export function groundingProblems(guide: GuideFile, readme: string, description: string): string[] {
  const p: string[] = [];
  const c = guide.content;
  const hay = squash(readme);
  const codes = [
    ...c.install.guides.flatMap((x) => x.steps.map((s) => s.code)),
    ...c.install.firstRun.map((s) => s.code),
    ...c.tutorial.steps.map((s) => s.code),
    ...c.heroCommands.map((h) => h.command),
  ].filter((x): x is string => !!x);
  for (const code of codes) {
    for (const raw of code.split("\n")) {
      const line = squash(raw.replace(/^\s*[$>]\s+/, ""));
      if (!line || line.startsWith("#") || line.startsWith("//")) continue;
      if (!hay.includes(line)) p.push(`command not in the README: ${line.slice(0, 120)}`);
    }
  }
  for (const x of c.install.guides) if (!OS_TARGETS.includes(x.os)) p.push(`install os must be one of ${OS_TARGETS.join(", ")} (got "${x.os}")`);
  const prose = [
    ...c.overview,
    ...Object.values(c.sixtySeconds).flat(),
    ...c.features.flatMap((f) => [f.title, f.body]),
    ...c.strengths,
    ...c.limitations,
    ...c.useCases.flatMap((u) => [u.title, u.body]),
    ...c.install.prerequisites,
    ...c.install.environment.map((e) => e.description),
    ...c.install.guides.flatMap((x) => [x.label, ...x.steps.flatMap((s) => [s.title, s.body ?? ""])]),
    ...c.install.firstRun.flatMap((s) => [s.title, s.body ?? ""]),
    c.tutorial.title,
    c.tutorial.useCase,
    c.tutorial.expected,
    ...c.tutorial.setup,
    ...c.tutorial.nextSteps,
    ...c.tutorial.steps.flatMap((s) => [s.title, s.body ?? ""]),
    ...c.costs.flatMap((x) => [x.label, x.value]),
    ...c.troubleshooting.flatMap((x) => [x.problem, x.solution]),
    ...c.bestFor,
  ].join("\n");
  const known = `${readme}\n${description}\n${guide.fullName}`;
  const badNumbers = [...new Set(prose.match(/\d+(?:[.,]\d+)*/g) ?? [])].filter((n) => !known.includes(n));
  if (badNumbers.length) p.push(`numbers not in the README: ${badNumbers.slice(0, 8).join(", ")}`);
  const badLinks = [...new Set(prose.match(/https?:\/\/[^\s)"'>\]]+/g) ?? [])].filter((u) => !readme.includes(u.replace(/[.,;:]+$/, "")));
  if (badLinks.length) p.push(`links not in the README: ${badLinks.slice(0, 5).join(", ")}`);
  const hype = prose.match(HYPE);
  if (hype && !HYPE.test(description)) p.push(`marketing word "${hype[0]}" (write plainly)`);
  return p;
}

export interface WriterOptions {
  llm: LlmClient;
  /** Publish at most this many new pages per run. */
  limit: number;
  minStars: number;
  /** Only search repos pushed on or after this day (YYYY-MM-DD). */
  pushedSince: string;
  /** Characters of README sent to the model (keeps small local models inside their context). */
  readmeChars?: number;
  /** Store as drafts instead of publishing. */
  drafts?: boolean;
  /** Tries per repo; later tries get the list of problems to fix. */
  attempts?: number;
  /** Dry runs hand each written guide here (the script saves them to files) and write nothing to the database. */
  onPreview?: (guide: GuideFile) => void;
  sleep?: (ms: number) => Promise<void>;
  searchDelayMs?: number;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Newest discoveries first (the daily discover job's queue), then a GitHub topic search by stars.
 * Yields repos one at a time as they are found, so pages are written while the search continues
 * (owner suggestion 2026-11-27): early pages go live sooner and GitHub calls are spread out.
 */
async function* candidateStream(ctx: JobContext, opts: WriterOptions, details: Record<string, unknown>, known: { repositories: Set<number>; queue: Set<number> }) {
  const pending = await ctx.store.listPendingQueue(1000);
  const pendingIds = new Set(pending.map((q) => Number(q.github_id)));
  const seen = new Set<number>();
  // In the system already = has a page (any status) or was looked at before (queue, not pending).
  const wanted = (g: GithubRepo) =>
    !seen.has(g.id) && !known.repositories.has(g.id) && !(known.queue.has(g.id) && !pendingIds.has(g.id)) && importEligible(g, opts.minStars) && !editoriallyExcluded(g);
  let fromQueue = 0;
  for (const q of pending) {
    const g = fromQueuePayload(Number(q.github_id), q.payload);
    if (!wanted(g)) continue;
    seen.add(g.id);
    fromQueue++;
    details.from_queue = fromQueue;
    yield g;
  }
  if (!ctx.github.searchPage) return;
  const sleep = opts.sleep ?? wait;
  let searches = 0;
  details.searches = 0;
  for (const band of starBands(opts.minStars)) {
    for (const topic of IMPORT_TOPICS) {
      const query = `topic:${topic} ${band} pushed:>=${opts.pushedSince} fork:false archived:false`;
      let res = null;
      for (let attempt = 0; attempt < 3 && !res; attempt++) {
        try {
          res = await ctx.github.searchPage(query, 1, 100);
        } catch (e) {
          if (e instanceof RateLimitError) {
            ctx.log?.("GitHub search speed limit reached, waiting 65s");
            await sleep(65_000);
          } else {
            // Network blips ("fetch failed") shouldn't end a long run: wait and retry, then stop searching.
            ctx.log?.(`GitHub search failed (${e instanceof Error ? e.message : String(e)}), retrying in 10s`);
            await sleep(10_000);
          }
        }
      }
      if (!res) {
        details.search_stopped = "GitHub search kept failing or was rate limited; continuing with the repos found so far";
        return;
      }
      details.searches = ++searches;
      await sleep(opts.searchDelayMs ?? 2_100);
      const fresh = res.items.filter(wanted);
      if (fresh.length) ctx.log?.(`search ${searches} (${topic}, ${band}): ${fresh.length} new repos`);
      for (const g of fresh) {
        seen.add(g.id);
        yield g;
      }
    }
  }
}

/** Dropped connections, timeouts, rate limits and server errors: worth another try. */
export function isTransientLlmError(e: unknown): boolean {
  const m = e instanceof Error ? `${e.message} ${String((e as { cause?: unknown }).cause ?? "")}` : String(e);
  return /terminated|fetch failed|socket|ECONNRESET|ETIMEDOUT|EPIPE|UND_ERR|other side closed|network|overloaded|rate.?limit|LLM (408|409|425|429|5\d\d)|\b(429|500|502|503|504|529)\b/i.test(m);
}

const RETRY_WAITS_MS = [5_000, 20_000, 60_000];

/** One model call, retried up to 3 times on transient errors (e.g. OpenRouter closing the stream mid-answer). */
export async function completeWithRetry(llm: LlmClient, user: string, sleep: (ms: number) => Promise<unknown>, log?: (m: string) => void): Promise<string> {
  for (let i = 0; ; i++) {
    try {
      return await llm.complete(WRITER_SYSTEM, user);
    } catch (e) {
      if (i >= RETRY_WAITS_MS.length || !isTransientLlmError(e)) throw e;
      log?.(`  model connection problem (${e instanceof Error ? e.message : String(e)}), retrying in ${RETRY_WAITS_MS[i] / 1000}s`);
      await sleep(RETRY_WAITS_MS[i]);
    }
  }
}

export function runWriter(ctx: JobContext, opts: WriterOptions): Promise<JobSummary> {
  return runLogged(ctx, "write", async (details) => {
    const github = ctx.github;
    if (!github.getHeadSha || !github.getReadme) throw new Error("GitHub client can't read READMEs");
    const attempts = opts.attempts ?? 2;
    const known = await ctx.store.knownGithubIds();
    const queueIds = known.queue;
    const taken = await ctx.store.knownSlugs();
    const categoryIds = await ctx.store.categoryIds();
    const now = ctx.now.toISOString();
    const today = isoDay(ctx.now);
    const published: { full_name: string; slug: string; summary: string }[] = [];
    const skipped: { full_name: string; reason: string }[] = [];
    const errors: { full_name: string; error: string }[] = [];
    let llmErrorsInARow = 0;
    const maxTries = opts.limit * 2; // stop after this many repos even if fewer passed the checks
    Object.assign(details, { model: opts.llm.label, published_list: published, skipped, errors });

    ctx.log?.(`writing up to ${opts.limit} pages with ${opts.llm.label}`);
    let n = 0;
    for await (const g of candidateStream(ctx, opts, details, known)) {
      if (published.length >= opts.limit || n >= maxTries) break;
      n++;
      details.candidates = n;
      if (llmErrorsInARow >= 3) {
        details.stopped = "3 model errors in a row; is the model server running?";
        ctx.log?.(`stopping: ${details.stopped}`);
        break;
      }
      const remember = async (reason: string) => {
        skipped.push({ full_name: g.full_name, reason });
        ctx.log?.(`skip ${g.full_name}: ${reason}`);
        if (!ctx.dryRun) {
          await ctx.store.ignoreInQueue(
            [{ github_id: g.id, full_name: g.full_name, github_url: g.html_url, payload: { ...toRepoUpdate(g, now), github_id: g.id, created_at_github: g.created_at }, notes: `writer: ${reason}` }],
            now,
          );
        }
      };
      ctx.log?.(`[${n}] ${g.full_name}: reading README and writing the page (${published.length}/${opts.limit} published so far)…`);
      let sha: string | null = null;
      let readme: { path: string; text: string } | null = null;
      try {
        sha = await github.getHeadSha(g.full_name, g.default_branch);
        readme = sha ? await github.getReadme(g.full_name, sha) : null;
      } catch (e) {
        if (e instanceof RateLimitError) throw e; // stop the run (logged as partial); nothing half-written
        errors.push({ full_name: g.full_name, error: e instanceof Error ? e.message : String(e) }); // retried next run
        continue;
      }
      if (!sha || !readme) {
        await remember("no README");
        continue;
      }
      const cleaned = cleanReadme(readme.text, opts.readmeChars ?? 30_000);
      if (cleaned.length < 500) {
        await remember("README too short to write an honest page");
        continue;
      }
      const source: SummaryInput = { key: String(g.id), fullName: g.full_name, description: g.description ?? "", topics: g.topics ?? [], language: g.language };
      const prompt = writerPrompt(g, cleaned);
      let guide: GuideFile | null = null;
      let problems: string[] = [];
      let modelSkip: string | null = null;
      try {
        for (let i = 0; i < attempts && !guide; i++) {
          const ask = problems.length
            ? `${prompt}\n\nYour previous answer was rejected for these problems. Write the whole JSON again and fix every one:\n- ${problems.join("\n- ")}`
            : prompt;
          const parsed = parseModelJson(await completeWithRetry(opts.llm, ask, opts.sleep ?? wait, ctx.log));
          llmErrorsInARow = 0;
          if (!parsed) {
            problems = ["the reply was not a JSON object"];
            continue;
          }
          if (str(parsed.skip)) {
            modelSkip = str(parsed.skip);
            break;
          }
          const draft = buildGuide(g, sha, readme.path, parsed, today);
          const summary = validateSummary(draft.summary ?? "", source);
          problems = [...checkGuide(draft), ...groundingProblems(draft, readme.text, g.description ?? ""), ...(summary ? [] : ["summary breaks the summary rules (one sentence, 25-170 characters, no numbers that aren't in the GitHub description)"])];
          if (!problems.length) guide = { ...draft, summary: summary! };
        }
      } catch (e) {
        llmErrorsInARow++;
        errors.push({ full_name: g.full_name, error: e instanceof Error ? e.message : String(e) }); // not remembered: retried next run
        ctx.log?.(`error ${g.full_name}: ${errors[errors.length - 1].error}`);
        continue;
      }
      if (modelSkip) {
        await remember(`model skipped it: ${modelSkip}`);
        continue;
      }
      if (!guide) {
        await remember(`failed checks: ${problems.join("; ")}`);
        continue;
      }

      const slug = uniqueSlug(g, taken);
      taken.add(slug);
      if (ctx.dryRun) {
        opts.onPreview?.(guide);
      } else {
        const [row] = await ctx.store.insertRepositories([
          { ...toRepoUpdate(g, now), github_id: g.id, slug, created_at_github: g.created_at, status: "draft", published_at: null, discovered_at: now },
        ]);
        const cats = categorize(g).filter((s) => categoryIds.has(s));
        await ctx.store.insertRepoCategories(cats.map((s, i) => ({ repository_id: row.id, category_id: categoryIds.get(s)!, is_primary: i === 0 })));
        await ctx.store.upsertStats([{ repository_id: row.id, recorded_on: today, recorded_at: now, stars: g.stargazers_count, forks: g.forks_count, open_issues: g.open_issues_count }]);
        // Guide first, publish last: if anything fails the repo stays an invisible draft.
        await ctx.store.saveGuide(row.id, guide.content, guide.summary);
        if (!opts.drafts) await ctx.store.saveSummaries([{ id: row.id, summary: guide.summary! }], now);
        if (queueIds.has(g.id)) await ctx.store.markQueueApproved([g.id]);
      }
      published.push({ full_name: g.full_name, slug, summary: guide.summary! });
      ctx.log?.(`${ctx.dryRun ? "wrote (dry run)" : opts.drafts ? "saved draft" : "published"} ${g.full_name} → /repo/${slug}`);
      if (published.length >= opts.limit) break; // don't start another GitHub search
    }
    details.processed = published.length;
    details.status_written = ctx.dryRun ? "none (dry run)" : opts.drafts ? "draft" : "published";
    return { processed: published.length, failed: errors.length };
  });
}
