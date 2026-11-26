// Short plain-English summaries for repo cards and page headers (owner request 2026-11-25,
// decision #33). Written by Claude in the scheduled jobs only (never during a visitor request),
// from the repo's GitHub description, name, language and topics, nothing else. Every line is
// checked before it is stored; anything that fails the checks is dropped, never patched up.
import Anthropic from "@anthropic-ai/sdk";
import type { JobContext, JobSummary } from "./jobs.ts";
import { runLogged } from "./jobs.ts";

export interface SummaryInput {
  key: string; // repository id
  fullName: string;
  description: string;
  topics: string[];
  language: string | null;
}

export interface Summarizer {
  /** Summary per key; null when the model declined (SKIP) or the line failed validation. */
  summarize(items: SummaryInput[], log?: (m: string) => void): Promise<Map<string, string | null>>;
  /** When defined, the import only takes repos this returns true for (pre-written summaries). */
  covers?(fullName: string): boolean;
}

export const SUMMARY_SYSTEM = `You write one-line summaries of open-source GitHub repositories for AIRepoHub, a directory that helps beginners recognise AI tools.

Write ONE plain-English sentence (8 to 22 words) saying what the project is and what someone would use it for. Write it for a non-expert.

Rules:
- Use only facts stated in the given description, name, language and topics. Do not add features, numbers, comparisons, benchmarks, company claims or opinions.
- No marketing words (powerful, best, revolutionary, blazing, cutting-edge, seamless, state-of-the-art).
- Do not start with the project name or with "This", "A repository" or "An open-source". Start with what it is, e.g. "Desktop app that ...", "Python library for ...", "Framework for building ...".
- No emojis, links, quotes or markdown. End with a full stop.
- If the description is too vague or not in English enough to summarise honestly, reply with exactly SKIP.

Reply with the sentence only.`;

export function summaryPrompt(r: SummaryInput): string {
  return [
    `Repository: ${r.fullName}`,
    `Description: ${r.description}`,
    r.language ? `Main language: ${r.language}` : null,
    r.topics.length ? `Topics: ${r.topics.slice(0, 15).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

const HYPE = /\b(powerful|best|revolutionary|blazing|cutting[- ]edge|seamless(ly)?|state[- ]of[- ]the[- ]art|world[- ]class|game[- ]chang)/i;

/**
 * Accept a model line only if it is one short sentence with no links, markdown or hype, and
 * every number in it also appears in the source description (so no invented stats).
 */
export function validateSummary(raw: string, source: SummaryInput): string | null {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text || /^skip\.?$/i.test(text)) return null;
  if (text.length < 25 || text.length > 170) return null;
  if (/https?:|www\.|[*_`#<>[\]]|["“”]/.test(text)) return null;
  if (/\p{Extended_Pictographic}/u.test(text)) return null;
  if (HYPE.test(text) && !HYPE.test(source.description)) return null;
  if (!/[.!]$/.test(text)) return null;
  if ((text.match(/[.!?](\s|$)/g) ?? []).length > 1) return null; // one sentence
  for (const n of text.match(/\d+(?:[.,]\d+)?/g) ?? []) {
    if (!source.description.includes(n) && !source.fullName.includes(n)) return null;
  }
  return text;
}

/** Claude via the Message Batches API (half price; a few thousand lines finish well within an hour). */
export class ClaudeBatchSummarizer implements Summarizer {
  private client: Anthropic;
  private model: string;
  private pollMs: number;
  constructor(model = "claude-opus-5-5", client = new Anthropic(), pollMs = 30_000) {
    this.client = client;
    this.model = model;
    this.pollMs = pollMs;
  }

  async summarize(items: SummaryInput[], log?: (m: string) => void): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    const byKey = new Map(items.map((i) => [i.key, i]));
    for (let i = 0; i < items.length; i += 5000) {
      const chunk = items.slice(i, i + 5000);
      const batch = await this.client.messages.batches.create({
        requests: chunk.map((r) => ({
          custom_id: r.key,
          params: {
            model: this.model,
            max_tokens: 2000,
            output_config: { effort: "low" },
            system: SUMMARY_SYSTEM,
            messages: [{ role: "user", content: summaryPrompt(r) }],
          },
        })),
      });
      log?.(`summary batch ${batch.id}: ${chunk.length} requests to ${this.model}`);
      let status = batch;
      while (status.processing_status !== "ended") {
        await new Promise((res) => setTimeout(res, this.pollMs));
        status = await this.client.messages.batches.retrieve(batch.id);
        log?.(`summary batch ${batch.id}: ${status.request_counts.succeeded} done, ${status.request_counts.processing} processing`);
      }
      for await (const result of await this.client.messages.batches.results(batch.id)) {
        const source = byKey.get(result.custom_id);
        if (!source) continue;
        if (result.result.type !== "succeeded") {
          out.set(result.custom_id, null);
          continue;
        }
        const message = result.result.message;
        if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") {
          out.set(result.custom_id, null);
          continue;
        }
        const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
        out.set(result.custom_id, validateSummary(text, source));
      }
    }
    return out;
  }
}


/** Backfill: summarise published repos that have none yet (most-starred first). */
export function runSummarize(ctx: JobContext, summarizer: Summarizer, limit = 5000): Promise<JobSummary> {
  return runLogged(ctx, "summarize", async (details) => {
    const rows = await ctx.store.listUnsummarized(limit);
    const summaries = await summarizer.summarize(
      rows.map((r) => ({ key: r.id, fullName: r.full_name, description: r.description, topics: r.topics ?? [], language: r.primary_language })),
      ctx.log,
    );
    const good = rows.filter((r) => summaries.get(r.id)).map((r) => ({ id: r.id, summary: summaries.get(r.id)! }));
    if (!ctx.dryRun) await ctx.store.saveSummaries(good);
    Object.assign(details, {
      processed: good.length,
      failed: rows.length - good.length,
      sample: good.slice(0, 10).map((g) => `${rows.find((r) => r.id === g.id)!.full_name}: ${g.summary}`),
    });
    return { processed: good.length, failed: rows.length - good.length };
  });
}

/**
 * Publish drafts that now have a summary. The import only publishes rows it inserts in the same
 * run, so a repo imported before its summary was written stays a draft; this picks those up.
 * Drafts keep the noindex they got at insert time until a guide is published.
 */
export function runPublishDrafts(ctx: JobContext, summarizer: Summarizer, limit = 5000): Promise<JobSummary> {
  return runLogged(ctx, "publish-drafts", async (details) => {
    const rows = await ctx.store.listDrafts(limit);
    const summaries = await summarizer.summarize(
      rows.map((r) => ({ key: r.id, fullName: r.full_name, description: r.description ?? "", topics: r.topics ?? [], language: r.primary_language })),
      ctx.log,
    );
    const good = rows.filter((r) => summaries.get(r.id)).map((r) => ({ id: r.id, summary: summaries.get(r.id)! }));
    if (!ctx.dryRun) await ctx.store.saveSummaries(good, ctx.now.toISOString());
    Object.assign(details, {
      drafts: rows.length,
      published: good.length,
      published_list: good.map((g) => rows.find((r) => r.id === g.id)!.full_name),
    });
    return { processed: good.length, failed: 0 };
  });
}

/**
 * Summaries written ahead of time and committed to the repo (data/summaries.json, keyed by
 * owner/name, case-insensitive). Each line still goes through validateSummary.
 */
export class FileSummarizer implements Summarizer {
  private byName: Map<string, string>;
  constructor(entries: Record<string, string>) {
    this.byName = new Map(Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v]));
  }
  covers(fullName: string) {
    return this.byName.has(fullName.toLowerCase());
  }
  async summarize(items: SummaryInput[]): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    for (const i of items) {
      const line = this.byName.get(i.fullName.toLowerCase());
      out.set(i.key, line ? validateSummary(line, i) : null);
    }
    return out;
  }
}
