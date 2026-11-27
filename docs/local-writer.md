# Local writer (`pnpm writer`)

Adds new AI repos to the live site with full pages, straight into Supabase. No pull request, no
redeploy: the site reads the database and shows new pages within about an hour (page cache).
Decision #38.

## What one run does
1. Picks candidates: first the daily discovery queue (newest finds), then a GitHub topic search
   (AI topics, ≥ `WRITER_MIN_STARS` stars, pushed in the last 180 days, not forks/archived/lists).
2. **Skips anything already in the system**: repos with a page (published or draft) and repos
   looked at before (discovery queue status other than `pending`). No duplicates.
3. For each candidate: reads the README at the current commit SHA, sends it to your model, and
   gets back the page in our format (summary, 60-second view, overview, features, install, first
   run, tutorial, costs, troubleshooting).
4. Checks the page. Rejected if: any command isn't in the README word for word, any number or link
   in the text isn't in the README, marketing words, bad summary, or missing sections. The model
   gets one retry with the list of problems.
5. Passes → inserted with categories and today's stars, guide saved (`official_docs`, indexable),
   then published. Fails or the model declines → the repo is remembered (`discovery_queue` status
   `ignored`, reason in `review_notes`) and not tried again. Network/model errors are not
   remembered, so the next run retries them.
6. Re-ranks the boards. Every run is logged in `automation_runs` (job `write`) with the model used,
   what was published and what was skipped and why.

Search and writing are interleaved: each repo is written and published as soon as the search finds it, so
pages go live from the first minute and GitHub calls are spread out. Stops after `--limit` published pages,
after trying twice that many repos, or after 3 model errors in a row (server not running).

## Setup (once)
1. `git clone`, then `pnpm install` (Node 22 or newer).
2. `cp .env.jobs.example .env.jobs` and fill it in (the file is git-ignored).

| Variable | Required | What it is |
| --- | --- | --- |
| `SUPABASE_URL` | yes | `https://ugykphnasjjtmzeygwoq.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Supabase → Project Settings → API keys → secret key. Full DB access: keep it only in `.env.jobs` |
| `GITHUB_TOKEN` | recommended | Fine-grained token, public repos read-only. Without it GitHub allows 60 requests/hour |
| `LLM_PROVIDER` | yes | `anthropic` (Claude API) or `openai` (any OpenAI-compatible server: OpenAI, Ollama, LM Studio, llama.cpp, vLLM, OpenRouter, Groq, Gemini's OpenAI endpoint) |
| `LLM_MODEL` | yes | e.g. `claude-opus-5-5`, `claude-sonnet-5-5`, `gpt-5`, `qwen3:32b` |
| `LLM_API_KEY` | cloud models | Your provider key. Leave empty for a local server |
| `LLM_BASE_URL` | for `openai` | Ollama `http://localhost:11434/v1`, LM Studio `http://localhost:1234/v1`; default OpenAI |
| `LLM_MAX_TOKENS` | no | Answer size limit (default 16000; thinking models count their reasoning against it) |
| `WRITER_LIMIT` | no | Pages to publish per run (default 20) |
| `WRITER_MIN_STARS` | no | Minimum stars (default 500) |
| `WRITER_README_CHARS` | no | README characters sent to the model (default 30000, about 8k tokens) |

Local models: the prompt is about 10k tokens and the answer 3–5k, so the model needs a context of
at least 16k (32k is safer). Ollama defaults to a small context and cuts the prompt silently: start
it with `OLLAMA_CONTEXT_LENGTH=32768 ollama serve`, or lower `WRITER_README_CHARS`. Small models
(under ~14B) fail the checks often; that costs time, never wrong pages.

## Run
```bash
pnpm writer --dry-run --limit=3   # writes pages to .writer-preview/*.json, nothing to the database
pnpm writer                       # publish up to WRITER_LIMIT new pages
pnpm writer --limit=5 --drafts    # save as drafts (not visible) instead of publishing
```
Flags: `--limit=N`, `--min-stars=N`, `--pushed-days=N`, `--drafts`, `--dry-run`, `--out=dir`.

## Run daily at a fixed time
The computer has to be on at that time.
- macOS / Linux (`crontab -e`), every day at 07:00:
  `0 7 * * * cd /path/to/airepohub && /usr/local/bin/pnpm writer >> writer.log 2>&1`
- Windows (PowerShell, once):
  `schtasks /Create /SC DAILY /ST 07:00 /TN AIRepoHubWriter /TR "cmd /c cd /d C:\path\to\airepohub && pnpm writer >> writer.log 2>&1"`

## Undo
A bad page can be hidden in the Supabase SQL Editor:
`update repositories set status = 'draft' where full_name = 'owner/name';`
To let the writer try a remembered repo again:
`update discovery_queue set status = 'pending' where full_name = 'owner/name';`
