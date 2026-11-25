# Architecture

## Verified platform versions (checked 2026-11-24 via npm registry)
| Piece | Version | Note |
|---|---|---|
| next | 16.4.6 | App Router, `cacheComponents: true` (default in this template) |
| react / react-dom | 19.3.0 | |
| tailwindcss | 4.3.3 | CSS-first config in `src/app/globals.css` |
| @opennextjs/cloudflare | 1.20.18 | peer range `next >=15.5.29 <16 \|\| >=16.4.5` → 16.4.6 is supported; needs `wrangler ^4.148` |

Compatibility to re-verify in Milestone 6 with a real `opennextjs-cloudflare build` + deploy:
Cache Components / `'use cache'` on Workers (OpenNext needs an incremental cache binding such as
R2 or KV for ISR/revalidation), `next/image` optimization (we ship `images.unoptimized` until a
Cloudflare Images loader is set up), Node APIs used by dependencies (`nodejs_compat` flag), and
the Workers Free limits (10 ms CPU per request, 3 MiB compressed bundle). If the bundle or CPU
limit is exceeded, the fallback is Workers Paid ($5/month) — documented in `deployment.md`.

## System overview
```
            ┌──────────── GitHub Actions (cron, Milestone 4–5) ────────────┐
            │ discover.ts  → GitHub REST API (search, repos, readme)       │
            │ snapshot.ts  → repository_stats (daily stars/forks/issues)   │
            │ rank.ts      → ranking_snapshots (weekly/monthly/all/category)│
            │ draft.ts     → AI provider (Gemini | Claude) → content_drafts│
            └───────────────┬──────────────────────────────────────────────┘
                            │ service-role key (Actions secret only)
                            ▼
                 Supabase Postgres (+ Auth, RLS)
                            ▲  anon key, RLS: published rows only
                            │
   Visitor ──► Cloudflare ──► Next.js on Workers (OpenNext)
                              ├ public pages: cached server components
                              └ /admin: Supabase Auth session + server-side role check
```

## Rendering and caching
- Public pages are Server Components. Data functions in `src/lib/data/` use `'use cache'` with
  `cacheLife` (rankings/home: hours; repo pages: hours, revalidated by tag on publish).
- `/categories/[slug]` prerenders every category; `/repo/[slug]` (and its share image) prerenders only
  the 100 most-starred repos (`getPrerenderSlugs`). Every other published repo renders on its first
  visit and is then cached (ISR-like), so deploys stay fast with thousands of repos (decision #31). Publishing calls `revalidateTag('repo:<slug>')`.
- Search (`/search`) reads `searchParams` → request-time, streamed behind `<Suspense>`.
- Client components only for interaction: theme toggle, mobile nav, search suggestions, copy
  buttons, OS tabs, leaderboard period switch.
- No AI or GitHub API calls during visitor requests.

## Data access layer
`src/lib/data/index.ts` is the only module UI imports for data. Functions:
`getCategories, getCategoryBySlug, getLeaderboards, getTrendingRepositories,
getRecentlyAdded, getFeaturedRepository, getBeginnerFriendly, getRepositoryBySlug,
getRepositoryContent, getRelatedRepositories, getPrerenderSlugs, getPublishedCount,
getRepositoriesByCategory, searchRepositories, getSearchSuggestions, getLanguages, getSitemapRepositories`.
- Milestone 1: implemented over typed sample data (`src/lib/data/sample/`), real GitHub metadata
  captured 2026-11-24, only `status: 'published'` rows exposed.
- Milestone 2 (done): `src/lib/data/supabase.ts` reads Supabase with the publishable key, so RLS limits
  reads to published rows. `index.ts` uses it when `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set, else the sample data (tests, previews without a DB).
  Each function queries only the rows its page shows (decision #31): one repo by slug, the top N by
  stars, a head-only `count`, ranking rows then those repos by slug. Search filters in Postgres (each
  term: name/summary/description `ilike`, topic, or stemmed full-text `wfts`), ranks name hits first and
  fetches full rows for one page. Full-table reads (sitemap, language list) page through PostgREST's
  1,000-row cap with light columns. Nothing loads the whole catalog: at thousands of repos that would
  exceed the Workers CPU limit. Service-role key only in automation scripts (M4).

## Domain logic (pure, unit tested)
- `src/lib/activity.ts`: activity status from `last_pushed_at`
  (Active ≤ 90 days, Slowing 91–365, Inactive > 365, Archived if archived).
- `src/lib/ranking.ts`: scoring formula (see below). In M1 used for the provisional all-time list;
  from M4 it runs in the `rank` job and results are stored in `ranking_snapshots`.

## Ranking methodology (v1)
Each signal normalized to 0–1 across the candidate set, then weighted:
| Signal | Weight | Normalization |
|---|---|---|
| Total stars | 30% | `log10(stars+1) / log10(maxStars+1)` (log damps giants) |
| Recent star growth | 30% | stars gained in window (7d/30d) from `repository_stats`, log-scaled against the pool max (implementation in `src/lib/ranking.ts`) |
| Activity | 20% | 1.0 if pushed ≤ 7d, linear decay to 0 at 365d |
| Documentation quality | 10% | editorial 0–1 from approved content (README depth, guide present) |
| Community | 10% | `log` of forks + contributors (issues response later) |
Missing signals are **excluded and remaining weights re-normalized**, and the UI says which signals
were used. All-time = growth signal excluded. Weekly/monthly need ≥ 2 snapshots spanning the window,
otherwise that leaderboard shows an empty state. Rank movement = previous snapshot rank − current.

## Scheduled jobs (Milestone 4, GitHub Actions, decision #22)
`.github/workflows/daily-jobs.yml` runs daily at 05:17 UTC (and on demand) → `pnpm jobs daily`
(`scripts/run-jobs.ts`), using `SUPABASE_SERVICE_ROLE_KEY` (repo secret) and Actions' own `GITHUB_TOKEN`.
Code in `src/lib/jobs/` (no Next imports; runs under Node type stripping, so no TS parameter properties/enums).
1. **snapshot**: `GET /repositories/{id}` for every non-rejected repo (rename-safe), updates metadata,
   upserts today's `repository_stats` row, records renames in `repository_aliases`, flags missing repos.
2. **rank**: published repos → `ranking_snapshots` for weekly, monthly, all-time (global + each category).
   Weekly/monthly include only repos with a snapshot ≥ 7/30 days old (±2 days); a board needs ≥ 3 such repos.
   `previous_rank` comes from the prior snapshot, so movement is real. All-time excludes growth.
3. **discover**: 10 GitHub search queries (AI topics, recently pushed or newly created), dedupe by `github_id`
   against `repositories` and `discovery_queue`, explainable relevance score (`src/lib/jobs/relevance.ts`),
   top 50 new candidates per run inserted as `pending`. Never publishes; admin review is Milestone 5.
Each job writes one `automation_runs` row (status, counts, API calls, details). A rate limit stops the job
as `partial` and keeps what was fetched; `failed` fails the workflow so GitHub emails the owner.
`pnpm jobs <job> --dry-run` reads only and writes nothing.

Site freshness: pages cache data for up to an hour (`cacheLife("hours")`), so new numbers appear within
about an hour of the job. The "Stats as of" date comes from the latest `stats_checked_at`.

## Security
- RLS on every table (see `database-design.md`). Admin role from `admin_users` table checked
  server-side (`is_admin()` SQL function + middleware/route checks), never by hiding links.
- Secrets in env only: `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_TOKEN`, `AI_API_KEY` live in GitHub
  Actions secrets / Workers secrets, never `NEXT_PUBLIC_*`.
- Untrusted repositories are never executed on the server. "Verified" guides are tested manually
  in an isolated environment.

## Folder layout
```
src/app/                 routes (home, repo/[slug], categories/[slug], search, legal pages)
src/components/ui/       shadcn-style primitives (button, badge, kbd, ...)
src/components/site/     header, footer, logo, theme toggle, search box
src/components/repo/     repo cards, leaderboard, product-page sections, code blocks
src/components/ads/      AdSlot (disabled unless NEXT_PUBLIC_ADS_ENABLED=true)
src/lib/                 types, utils, activity, ranking, data layer
supabase/migrations/     versioned SQL
scripts/ (M4+)           discovery, snapshot, ranking, drafting jobs
.github/workflows/ (M4+) scheduled automation
```
