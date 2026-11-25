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
- `/repo/[slug]` and `/categories/[slug]` use `generateStaticParams` for published slugs; others
  render on demand and are cached (ISR-like). Publishing calls `revalidateTag('repo:<slug>')`.
- Search (`/search`) reads `searchParams` → request-time, streamed behind `<Suspense>`.
- Client components only for interaction: theme toggle, mobile nav, search suggestions, copy
  buttons, OS tabs, leaderboard period switch.
- No AI or GitHub API calls during visitor requests.

## Data access layer
`src/lib/data/index.ts` is the only module UI imports for data. Functions:
`getCategories, getCategoryBySlug, getLeaderboards, getTrendingRepositories,
getRecentlyAdded, getFeaturedRepository, getBeginnerFriendly, getRepositoryBySlug,
getRepositoryContent, getRelatedRepositories, getPublishedSlugs, searchRepositories,
getSearchSuggestions`.
- Milestone 1: implemented over typed sample data (`src/lib/data/sample/`), real GitHub metadata
  captured 2026-11-24, only `status: 'published'` rows exposed.
- Milestone 2: same signatures over Supabase (`@supabase/supabase-js`, server client with anon key
  + RLS for public reads; service-role only in automation scripts).

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
| Recent star growth | 30% | stars gained in window (7d/30d) from `repository_stats`, as % of base, log-scaled, capped |
| Activity | 20% | 1.0 if pushed ≤ 7d, linear decay to 0 at 365d |
| Documentation quality | 10% | editorial 0–1 from approved content (README depth, guide present) |
| Community | 10% | `log` of forks + contributors (issues response later) |
Missing signals are **excluded and remaining weights re-normalized**, and the UI says which signals
were used. All-time = growth signal excluded. Weekly/monthly need ≥ 2 snapshots spanning the window,
otherwise that leaderboard shows an empty state. Rank movement = previous snapshot rank − current.

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
