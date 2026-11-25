// Bulk import (owner request 2026-11-25, decision #30): publish thousands of popular AI repos as
// basic pages built only from real GitHub facts. No AI-written text, no install guides. Pages can
// be hidden from search engines (seo_metadata.noindex) until someone adds a reviewed guide.
import { RateLimitError, type GithubApi, type GithubRepo } from "./github.ts";
import { isoDay } from "./growth.ts";
import type { JobContext, JobSummary } from "./jobs.ts";
import { runLogged, toRepoUpdate } from "./jobs.ts";
import type { NewRepoRow } from "./store.ts";
import type { Summarizer } from "./summarize.ts";

/** GitHub topics that mark a repo as AI / ML. Each is searched in several star bands. */
export const IMPORT_TOPICS = [
  "llm", "ai", "artificial-intelligence", "machine-learning", "deep-learning", "generative-ai", "ai-agents", "agents",
  "agent", "rag", "chatgpt", "openai", "gpt", "langchain", "stable-diffusion", "mcp", "mcp-server", "local-llm", "llama",
  "ollama", "transformers", "nlp", "computer-vision", "tts", "speech-recognition", "ai-assistant", "chatbot", "llmops",
  "vector-database", "large-language-models", "claude-code", "claude", "gemini", "multimodal", "text-to-image",
  "text-to-video", "pytorch", "reinforcement-learning", "neural-network", "comfyui", "diffusion-models", "llm-inference",
];

/** Star bands, highest first, so a capped import keeps the most popular repos. Each band stays under GitHub's 1,000-result cap per query for most topics. */
export function starBands(minStars: number): string[] {
  const edges = [50000, 20000, 10000, 5000, 3000, 2000, 1500, 1000, 700, 500, 300, 200, 100].filter((e) => e > minStars);
  if (!edges.length) return [`stars:>=${minStars}`];
  return [
    `stars:>=${edges[0]}`,
    ...edges.slice(1).map((e, i) => `stars:${e}..${edges[i] - 1}`),
    `stars:${minStars}..${edges[edges.length - 1] - 1}`,
  ];
}

const LIST_WORDS = /\b(curated list|awesome list|list of (awesome|resources|papers))\b/i;

/** Tools only: no forks, archived repos, curated lists, or repos without a GitHub description. */
export function importEligible(g: GithubRepo, minStars: number): boolean {
  if (g.fork || g.archived || g.disabled) return false;
  if (g.stargazers_count < minStars) return false;
  if (!g.description?.trim()) return false;
  const topics = (g.topics ?? []).map((t) => t.toLowerCase());
  if (/^awesome[-_]?/i.test(g.name) || topics.includes("awesome") || topics.includes("awesome-list")) return false;
  if (LIST_WORDS.test(g.description)) return false;
  return true;
}

// Category assignment from the repo's own GitHub topics and description. First match = primary.
const CATEGORY_RULES: { slug: string; topics: string[]; words?: RegExp }[] = [
  { slug: "coding-assistants", topics: ["claude-code", "copilot", "code-generation", "coding-assistant", "ai-coding", "codex", "cursor", "code-review", "coding-agent", "vibe-coding", "aider"], words: /\b(coding (assistant|agent)|pair programm|code (completion|generation))\b/i },
  { slug: "video-generation", topics: ["text-to-video", "video-generation", "image-to-video", "video-diffusion"], words: /\b(text-to-video|video generation)\b/i },
  { slug: "image-generation", topics: ["stable-diffusion", "text-to-image", "image-generation", "diffusion", "diffusion-models", "comfyui", "flux", "midjourney", "sdxl", "controlnet"], words: /\b(stable diffusion|text-to-image|image generation)\b/i },
  { slug: "local-llms", topics: ["local-llm", "ollama", "llama-cpp", "llamacpp", "gguf", "llm-inference", "quantization", "self-hosted-llm", "local-ai", "offline-llm", "vllm"], words: /\b(run (llms?|models?) locally|local llms?|on your own (hardware|machine))\b/i },
  { slug: "rag-knowledge", topics: ["rag", "retrieval-augmented-generation", "vector-database", "embeddings", "knowledge-base", "semantic-search", "vector-search", "knowledge-graph", "graphrag"], words: /\b(rag|retrieval[- ]augmented|vector database|knowledge base)\b/i },
  { slug: "ai-agents", topics: ["ai-agents", "agents", "agent", "autonomous-agents", "multi-agent", "agentic-ai", "agentic", "llm-agent", "ai-agent", "agi"], words: /\bagents?\b/i },
  { slug: "ai-automation", topics: ["automation", "workflow", "workflow-automation", "n8n", "low-code", "no-code", "rpa", "browser-automation", "zapier"], words: /\b(workflow|automation)\b/i },
  { slug: "seo-marketing", topics: ["seo", "marketing", "content-marketing"], words: /\bseo\b/i },
  { slug: "productivity", topics: ["chatgpt", "chatbot", "ai-assistant", "assistant", "chat", "writing", "note-taking", "translation", "productivity", "desktop-app", "chrome-extension"], words: /\b(chat ?bot|assistant|chat client|translat)/i },
  { slug: "developer-tools", topics: ["mcp", "mcp-server", "langchain", "llmops", "sdk", "framework", "fine-tuning", "pytorch", "tensorflow", "transformers", "machine-learning", "deep-learning", "mlops", "inference", "api"] },
];

/** Up to two category slugs; always at least one (developer-tools as the catch-all). */
export function categorize(g: GithubRepo): string[] {
  const topics = new Set((g.topics ?? []).map((t) => t.toLowerCase()));
  const out: string[] = [];
  for (const rule of CATEGORY_RULES) if (rule.topics.some((t) => topics.has(t))) out.push(rule.slug);
  if (!out.length) for (const rule of CATEGORY_RULES) if (rule.words && g.description && rule.words.test(g.description)) out.push(rule.slug);
  if (!out.length) out.push("developer-tools");
  return out.slice(0, 2);
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** `name`, else `owner-name`, else `owner-name-<id>`; never one already taken. */
export function uniqueSlug(g: GithubRepo, taken: Set<string>): string {
  for (const c of [slugify(g.name), slugify(`${g.owner.login}-${g.name}`), slugify(`${g.owner.login}-${g.name}-${g.id}`)]) {
    if (c && !taken.has(c)) return c;
  }
  return `repo-${g.id}`;
}

export interface ImportOptions {
  target: number;
  minStars: number;
  /** Only repos pushed on or after this day (YYYY-MM-DD). */
  pushedSince: string;
  noindex: boolean;
  topics?: string[];
  /** Waits between search calls (GitHub allows 30 searches a minute). Injected so tests don't sleep. */
  sleep?: (ms: number) => Promise<void>;
  searchDelayMs?: number;
  /**
   * When set, new rows are inserted as drafts, summarised, and only the ones with a valid summary
   * are published. Without it rows are published straight away (GitHub description only).
   */
  summarizer?: Summarizer;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function searchAll(github: GithubApi, query: string, opts: ImportOptions, log?: (m: string) => void) {
  const sleep = opts.sleep ?? wait;
  const items: GithubRepo[] = [];
  let calls = 0;
  for (let page = 1; page <= 10; page++) {
    let res;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await github.searchPage!(query, page, 100);
        break;
      } catch (e) {
        if (!(e instanceof RateLimitError) || attempt >= 3) throw e;
        log?.(`rate limited on "${query}" p${page}, waiting 65s`);
        await sleep(65_000);
      }
    }
    calls++;
    await sleep(opts.searchDelayMs ?? 2_100);
    items.push(...res.items);
    if (res.items.length < 100 || page * 100 >= Math.min(res.total, 1000)) break;
  }
  if (calls >= 10) log?.(`"${query}" hit the 1,000-result cap`);
  return items;
}

export function runImport(ctx: JobContext, opts: ImportOptions): Promise<JobSummary> {
  return runLogged(ctx, "import", async (details) => {
    if (!ctx.github.searchPage) throw new Error("GitHub client can't page searches");
    const known = await ctx.store.knownGithubIds();
    const found = new Map<number, GithubRepo>();
    let searches = 0;
    const topics = opts.topics ?? IMPORT_TOPICS;
    // Highest star band first across all topics; stop once a full band leaves us above target.
    for (const band of starBands(opts.minStars)) {
      for (const topic of topics) {
        const q = `topic:${topic} ${band} pushed:>=${opts.pushedSince} fork:false archived:false`;
        for (const g of await searchAll(ctx.github, q, opts, ctx.log)) {
          if (known.repositories.has(g.id) || found.has(g.id)) continue;
          if (importEligible(g, opts.minStars)) found.set(g.id, g);
        }
        searches++;
      }
      ctx.log?.(`after ${band}: ${found.size} new eligible repos`);
      if (found.size >= opts.target) break;
    }

    const covers = opts.summarizer?.covers?.bind(opts.summarizer);
    const picked = [...found.values()]
      .filter((g) => !covers || covers(g.full_name))
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, opts.target);
    const taken = await ctx.store.knownSlugs();
    const categoryIds = await ctx.store.categoryIds();
    const now = ctx.now.toISOString();
    const rows: NewRepoRow[] = [];
    const cats = new Map<number, string[]>();
    for (const g of picked) {
      const slug = uniqueSlug(g, taken);
      taken.add(slug);
      rows.push({
        ...toRepoUpdate(g, now),
        github_id: g.id,
        slug,
        created_at_github: g.created_at,
        status: opts.summarizer ? "draft" : "published",
        published_at: opts.summarizer ? null : now,
        discovered_at: now,
      });
      cats.set(g.id, categorize(g).filter((s) => categoryIds.has(s)));
    }

    const byCategory: Record<string, number> = {};
    for (const list of cats.values()) for (const s of list) byCategory[s] = (byCategory[s] ?? 0) + 1;
    Object.assign(details, {
      processed: rows.length,
      searches,
      eligible_found: found.size,
      min_stars: opts.minStars,
      pushed_since: opts.pushedSince,
      noindex: opts.noindex,
      by_category: byCategory,
      sample: rows.slice(0, 15).map((r) => `${r.full_name} (${r.stars})`),
    });
    // Dry runs list every pick so summaries can be written for exactly these repos.
    if (ctx.dryRun) {
      details.candidates = picked.map((g) => ({ full_name: g.full_name, stars: g.stargazers_count, language: g.language, topics: g.topics ?? [], description: g.description }));
    }
    if (ctx.dryRun || !rows.length) return { processed: rows.length, failed: 0 };

    const inserted = await ctx.store.insertRepositories(rows);
    const idByGithub = new Map(inserted.map((r) => [r.github_id, r.id]));
    await ctx.store.insertRepoCategories(
      inserted.flatMap((r) => (cats.get(r.github_id) ?? []).map((slug, i) => ({ repository_id: r.id, category_id: categoryIds.get(slug)!, is_primary: i === 0 }))),
    );
    const today = isoDay(ctx.now);
    await ctx.store.upsertStats(
      picked
        .filter((g) => idByGithub.has(g.id))
        .map((g) => ({ repository_id: idByGithub.get(g.id)!, recorded_on: today, recorded_at: now, stars: g.stargazers_count, forks: g.forks_count, open_issues: g.open_issues_count })),
    );
    if (opts.noindex) await ctx.store.setNoindex(inserted.map((r) => r.id));
    let published = inserted.map((r) => r.github_id);
    if (opts.summarizer) {
      const byGithub = new Map(picked.map((g) => [g.id, g]));
      const summaries = await opts.summarizer.summarize(
        inserted.map((r) => {
          const g = byGithub.get(r.github_id)!;
          return { key: r.id, fullName: g.full_name, description: g.description ?? "", topics: g.topics ?? [], language: g.language };
        }),
        ctx.log,
      );
      const good = inserted.filter((r) => summaries.get(r.id));
      await ctx.store.saveSummaries(
        good.map((r) => ({ id: r.id, summary: summaries.get(r.id)! })),
        now,
      );
      published = good.map((r) => r.github_id);
      Object.assign(details, {
        summarized: good.length,
        left_as_draft: inserted.length - good.length,
        summary_sample: good.slice(0, 10).map((r) => `${byGithub.get(r.github_id)!.full_name}: ${summaries.get(r.id)}`),
      });
    }
    const publishedSet = new Set(published);
    const fromQueue = inserted.map((r) => r.github_id).filter((id) => known.queue.has(id) && publishedSet.has(id));
    await ctx.store.markQueueApproved(fromQueue);
    Object.assign(details, { inserted: inserted.length, published: published.length, approved_from_queue: fromQueue.length });
    return { processed: published.length, failed: 0 };
  });
}
