// Discovery relevance: is a GitHub repo an AI tool worth a reviewer's time? Pure and explainable:
// every point comes with a reason that is stored in discovery_queue.relevance_reasons.
import type { GithubRepo } from "./github.ts";

const AI_TOPICS = new Set([
  "ai", "artificial-intelligence", "llm", "llms", "large-language-models", "machine-learning", "deep-learning",
  "generative-ai", "genai", "gpt", "chatgpt", "openai", "claude", "gemini", "ollama", "rag", "retrieval-augmented-generation",
  "agents", "ai-agents", "agent", "langchain", "stable-diffusion", "diffusion", "text-to-image", "text-to-video",
  "transformers", "nlp", "computer-vision", "speech-recognition", "tts", "embeddings", "vector-database", "mcp",
  "local-llm", "inference", "fine-tuning", "prompt-engineering", "copilot", "ai-assistant", "chatbot",
]);
const AI_WORDS = /\b(llms?|ai|gpt|agents?|rag|diffusion|transformer|language models?|machine learning|neural|chatbot|embedding|inference|copilot|generative)\b/i;

export interface Relevance {
  score: number; // 0–1
  reasons: string[];
  eligible: boolean;
}

export function scoreRelevance(repo: GithubRepo, now: Date): Relevance {
  const reasons: string[] = [];
  if (repo.fork) return { score: 0, reasons: ["fork"], eligible: false };
  if (repo.archived || repo.disabled) return { score: 0, reasons: ["archived"], eligible: false };

  const topics = (repo.topics ?? []).map((t) => t.toLowerCase());
  if (/^awesome[-_]/i.test(repo.name) || topics.some((t) => t === "awesome" || t === "awesome-list")) {
    return { score: 0, reasons: ["curated list, not a tool"], eligible: false };
  }

  let score = 0;
  const aiTopics = topics.filter((t) => AI_TOPICS.has(t));
  if (aiTopics.length) {
    score += Math.min(0.3, 0.1 * aiTopics.length);
    reasons.push(`AI topics: ${aiTopics.slice(0, 4).join(", ")}`);
  }
  if (repo.description && AI_WORDS.test(repo.description)) {
    score += 0.15;
    reasons.push("AI terms in description");
  }
  // Popularity, log-scaled: 100 stars ≈ 0.12, 1k ≈ 0.18, 10k ≈ 0.24, 100k = 0.3.
  if (repo.stargazers_count > 0) {
    score += Math.min(0.3, (Math.log10(repo.stargazers_count + 1) / 5) * 0.3);
    reasons.push(`${repo.stargazers_count} stars`);
  }
  const days = repo.pushed_at ? (now.getTime() - new Date(repo.pushed_at).getTime()) / 86_400_000 : Infinity;
  if (days <= 7) {
    score += 0.15;
    reasons.push("pushed in the last 7 days");
  } else if (days <= 30) {
    score += 0.1;
    reasons.push("pushed in the last 30 days");
  } else if (days <= 90) {
    score += 0.05;
    reasons.push("pushed in the last 90 days");
  }
  if (repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION") {
    score += 0.05;
    reasons.push(`license ${repo.license.spdx_id}`);
  }

  score = Math.min(1, Math.round(score * 10000) / 10000);
  const isAi = aiTopics.length > 0 || reasons.includes("AI terms in description");
  return { score, reasons, eligible: isAi && score >= 0.35 };
}

/** Search queries for new, active, growing AI repos. `since` limits to recently pushed repos. */
export function discoveryQueries(since: string): string[] {
  const base = `stars:>=200 pushed:>=${since} archived:false fork:false`;
  return [
    `topic:llm ${base}`,
    `topic:ai-agents ${base}`,
    `topic:rag ${base}`,
    `topic:generative-ai ${base}`,
    `topic:local-llm ${base}`,
    `topic:stable-diffusion ${base}`,
    `topic:mcp ${base}`,
    `topic:ai-assistant ${base}`,
    // New projects gaining traction (created in the window), not only established giants.
    `topic:llm created:>=${since} stars:>=100 fork:false`,
    `topic:ai-agents created:>=${since} stars:>=100 fork:false`,
  ];
}
