# AIRepoHub

AI GitHub repository discovery platform. Tagline: **Discover. Install. Build.**
Turns open-source AI repos into beginner-friendly product pages (what it does, who it's for,
install guide, first tutorial, costs, troubleshooting, alternatives). Monetized later via AdSense.

## Start of every session
1. Read this file and `docs/progress.md` (current milestone, next step).
2. For AIRepoHub work, use the `airepohub-development` skill (`.claude/skills/airepohub-development/`).
3. Check `docs/decisions.md` for the feature you're touching. Read other docs only when needed:
   - `docs/product-requirements.md` full product spec (the owner's brief, condensed)
   - `docs/architecture.md` system design, data flow, caching, folder layout
   - `docs/database-design.md` + `supabase/migrations/` schema and RLS
   - `docs/design-system.md` tokens, typography, components, wireframe mapping
   - `docs/seo-strategy.md`, `docs/deployment.md`, `docs/implementation-plan.md`
4. Source code is the source of truth for implementation details. Inspect before changing.

## Stack (verified versions in docs/architecture.md)
Next.js 16 App Router (Cache Components on) · React 19 · TypeScript strict · Tailwind CSS v4 ·
shadcn/ui conventions (`components.json`, `src/components/ui`) · Lucide icons ·
Supabase Postgres + Auth (from Milestone 2) · GitHub REST API · GitHub Actions (scheduled jobs) ·
Cloudflare Workers via `@opennextjs/cloudflare` (Milestone 6).

This Next.js version differs from older training data: read `node_modules/next/dist/docs/`
before using an API you're unsure of (see AGENTS.md).

## Non-negotiable rules
- **Never fabricate** repo facts, stats, install commands, outputs, pricing, ranking movement or
  growth. No data → honest empty state. Install guides carry a verification status
  (`verified` only after a real, safe test run; else `official_docs` or `awaiting_verification`).
- Public pages read only **published** data. Drafts and AI output stay private until admin approval.
- All data access goes through `src/lib/data/` (server-only). Components never query the DB directly.
  Milestone 1 backs it with `src/lib/data/sample/`; Milestone 2 swaps in Supabase with the same API.
- Rankings are precomputed snapshots (`ranking_snapshots`), never computed per request.
- SEO: every published repo has its own crawlable, server-rendered URL `/repo/[slug]`.
  Page sections are real content in the HTML (section nav = anchor links, not hidden tab panels).
- Never commit secrets. Service-role keys are server/automation only, never `NEXT_PUBLIC_*`.
- Brand is **AIRepoHub** (the brief's "RepoNivo" and the wireframe's "RepoShelf" are old names).
- Ads only through `src/components/ads/ad-slot.tsx`, disabled until AdSense is approved.
- Keep it cheap: cache public pages, no AI calls during visitor requests.

## Commands
```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm lint         # eslint
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest (unit tests for ranking, activity, data layer)
pnpm build        # production build
```

## Workflow
- Work milestone by milestone (`docs/implementation-plan.md`). Don't build ahead.
- Branch per change, readable commits, PR into `main`.
- Before finishing a task: run lint, typecheck, tests, build; update `docs/progress.md`;
  record lasting decisions or user corrections in `docs/decisions.md` (mark superseded ones);
  tell the owner what changed and what was remembered.
- Clearly separate what is implemented and tested from what is only planned.
