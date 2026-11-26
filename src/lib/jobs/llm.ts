// Pluggable text model for the local writer job (owner request 2026-11-26, decision #38).
// Two kinds cover almost everything: Anthropic's API, and any OpenAI-compatible chat endpoint
// (OpenAI, Ollama, LM Studio, llama.cpp server, vLLM, OpenRouter, Groq, Gemini's OpenAI endpoint).
// Never used during a visitor request: only from scripts/run-jobs.ts.
import Anthropic from "@anthropic-ai/sdk";

export interface LlmClient {
  /** Human-readable "provider:model", stored in automation_runs details. */
  label: string;
  complete(system: string, user: string): Promise<string>;
}

export interface LlmEnv {
  [name: string]: string | undefined;
  LLM_PROVIDER?: string;
  LLM_MODEL?: string;
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  LLM_MAX_TOKENS?: string;
  ANTHROPIC_API_KEY?: string;
}

/** Claude through the official SDK, streamed so long guides never hit a request timeout. */
export class AnthropicLlm implements LlmClient {
  label: string;
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  constructor(model: string, apiKey: string, maxTokens = 16000, baseURL?: string) {
    this.model = model;
    this.maxTokens = maxTokens;
    this.label = `anthropic:${model}`;
    this.client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }
  async complete(system: string, user: string): Promise<string> {
    const message = await this.client.messages
      .stream({
        model: this.model,
        max_tokens: this.maxTokens,
        thinking: { type: "adaptive" },
        system,
        messages: [{ role: "user", content: user }],
      })
      .finalMessage();
    if (message.stop_reason === "refusal") throw new Error("model refused");
    if (message.stop_reason === "max_tokens") throw new Error("model ran out of tokens (raise LLM_MAX_TOKENS)");
    return message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  }
}

/**
 * Any OpenAI-compatible /chat/completions endpoint. Streams the answer: local models can take
 * minutes, and a non-streamed request would hit Node's 5-minute header timeout first.
 */
export class OpenAiCompatibleLlm implements LlmClient {
  label: string;
  private baseUrl: string;
  private model: string;
  private apiKey: string | undefined;
  private maxTokens: number;
  private fetchImpl: typeof fetch;
  constructor(model: string, baseUrl: string, apiKey?: string, maxTokens = 8192, fetchImpl: typeof fetch = fetch) {
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.maxTokens = maxTokens;
    this.fetchImpl = fetchImpl;
    this.label = `openai-compatible:${model}@${new URL(this.baseUrl).host}`;
  }
  async complete(system: string, user: string): Promise<string> {
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({
        model: this.model,
        stream: true,
        temperature: 0.2,
        max_tokens: this.maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok || !res.body) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
    let text = "";
    let finish: string | null = null;
    let buffer = "";
    const decoder = new TextDecoder();
    const reader = res.body.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        const chunk = JSON.parse(data) as { choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[]; error?: { message?: string } };
        if (chunk.error) throw new Error(`LLM error: ${chunk.error.message ?? "unknown"}`);
        const c = chunk.choices?.[0];
        if (c?.delta?.content) text += c.delta.content;
        if (c?.finish_reason) finish = c.finish_reason;
      }
    }
    if (finish === "length") throw new Error("model ran out of tokens (raise LLM_MAX_TOKENS or the model's context size)");
    return text;
  }
}

/** Build the client from environment variables. Throws a plain-English error when one is missing. */
export function llmFromEnv(env: LlmEnv): LlmClient {
  const model = env.LLM_MODEL?.trim();
  if (!model) throw new Error("Set LLM_MODEL (e.g. claude-opus-5-5, gpt-5, or qwen3:32b for Ollama).");
  const provider = (env.LLM_PROVIDER?.trim().toLowerCase() || (env.LLM_BASE_URL ? "openai" : "anthropic")).replace(/-compatible$/, "");
  const maxTokens = env.LLM_MAX_TOKENS ? Number(env.LLM_MAX_TOKENS) : undefined;
  if (maxTokens !== undefined && !(maxTokens > 0)) throw new Error("LLM_MAX_TOKENS must be a positive number.");
  if (provider === "anthropic") {
    const key = env.LLM_API_KEY || env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("Set LLM_API_KEY (your Anthropic API key) for LLM_PROVIDER=anthropic.");
    return new AnthropicLlm(model, key, maxTokens, env.LLM_BASE_URL || undefined);
  }
  if (provider === "openai") {
    return new OpenAiCompatibleLlm(model, env.LLM_BASE_URL || "https://api.openai.com/v1", env.LLM_API_KEY || undefined, maxTokens);
  }
  throw new Error(`Unknown LLM_PROVIDER "${env.LLM_PROVIDER}". Use anthropic or openai (any OpenAI-compatible server).`);
}
