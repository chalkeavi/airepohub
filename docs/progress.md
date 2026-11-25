# Progress

**Current milestone:** 2 — Supabase (done, PR open)
**Last updated:** 2026-11-25

## Done (implemented and checked)
- Milestone 1 (PR #1): docs and memory, schema, homepage, product page, categories, search, about, legal
  placeholders, light/dark, responsive. Sample data: 24 real repos (GitHub metadata 2026-11-24), full guide for OpenSEO.
- Milestone 2:
  - Supabase project `airepohub` (ref `ugykphnasjjtmzeygwoq`). Both migrations and the seed are applied.
  - Security advisor: 0 findings. Performance advisor: only "unused index" info (expected on a new DB).
  - Verified as anonymous: drafts are hidden, unpublished rows are hidden, `rpc/is_admin` is not exposed.
  - Site reads Supabase via `src/lib/data/supabase.ts` (sample fallback when env vars are missing).
  - Checks: lint, typecheck, 28 tests (incl. seed applied twice in PGlite), production build against the
    live DB; homepage, OpenSEO page, category page and search checked against live data.

## Not done / known gaps
- Weekly/monthly rankings and Trending stay empty until daily star history exists (Milestone 4 jobs).
- `DATA_AS_OF` is still a constant (2026-11-24 capture time). Derive it from `stats_checked_at` once jobs refresh stats (M4).
- Builds now fetch from Supabase; a build fails if Supabase is unreachable. In the cloud sandbox run builds
  with `NODE_USE_ENV_PROXY=1` (Node fetch ignores HTTPS_PROXY otherwise).
- Unknown `/repo/<slug>` renders the 404 page with `noindex` but HTTP status 200 (streamed response); revisit in M3 (SEO).
- Only OpenSEO has a full guide. Install guide is "Based on official documentation", not executed by us.
- No admin accounts yet (`admin_users` empty); content edits need the dashboard or service role until M5.
- Legal pages are placeholders. No sitemap/robots/JSON-LD/OG images yet (Milestone 3). Cloudflare build: M6.

## Blockers / needs from owner
- Homepage and admin wireframes, if you have them (admin needed for M5).
- Supabase MCP confirmation pop-ups do not reach the owner; DDL with drops is handed over as SQL files for the SQL Editor.

## Next recommended step
Milestone 3: SEO (sitemap, robots, JSON-LD, OG images, proper 404 status).

## Later (ideas, not scheduled)
- `pg_trgm` fuzzy search; Cloudflare Images loader for avatars.
