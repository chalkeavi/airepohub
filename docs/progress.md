# Progress

**Current milestone:** 4 — automation (built, PR open); 3 — SEO (PR open)
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

- Milestone 3 (SEO): per-page titles/descriptions (≤60/≤160 chars, `seo_metadata` overrides), canonicals,
  JSON-LD (SoftwareSourceCode, BreadcrumbList, ItemList, WebSite/SearchAction; HowTo only for verified guides),
  `sitemap.xml` (published only), `robots.txt`, share images per repo and site-wide, real 404/301 via `src/proxy.ts`.
  Checked: 40 tests, build, and live responses (unknown slug → 404, `/repo/OpenSEO` → 301, sitemap 41 URLs).

- Milestone 4 (automation, GitHub Actions): daily `snapshot` → `rank` → `discover` jobs with run logging,
  weekly/monthly boards and Trending read from snapshots, "Stats as of" from the data. 13 job tests with an
  in-memory store. Dry run against real GitHub search + Supabase: 10 queries, 50 candidates queued (none written).
  Not yet run for real: needs the `SUPABASE_SERVICE_ROLE_KEY` secret and the workflow on `main`.

## Not done / known gaps
- Weekly board and Trending appear ~7 days after the first real job run; monthly after ~30 days.
- Rank movement (`previous_rank`) is stored but not shown in the leaderboard UI yet.
- The sandbox proxy blocks `GET /repositories/{id}`, so the snapshot job was only unit-tested here; it runs in Actions.
- Builds now fetch from Supabase; a build fails if Supabase is unreachable. In the cloud sandbox run builds
  with `NODE_USE_ENV_PROXY=1` (Node fetch ignores HTTPS_PROXY otherwise).
- `NEXT_PUBLIC_SITE_URL` must be set to the real domain at deploy (defaults to localhost). Owner hasn't chosen a domain yet.
- Proxy + `next/og` on Cloudflare Workers not yet tested (Milestone 6).
- Collections pages moved to Milestone 5.
- Only OpenSEO has a full guide. Install guide is "Based on official documentation", not executed by us.
- No admin accounts yet (`admin_users` empty); content edits need the dashboard or service role until M5.
- Legal pages are placeholders. Cloudflare build: M6.

## Blockers / needs from owner
- Add the `SUPABASE_SERVICE_ROLE_KEY` repository secret; approve merging PRs #3 and #4.
- Homepage and admin wireframes, if you have them (admin needed for M5).
- Supabase MCP confirmation pop-ups do not reach the owner; DDL with drops is handed over as SQL files for the SQL Editor.

## Next recommended step
After the first real run: check `automation_runs` and the queue. Then Milestone 5 (admin: review queue, AI drafts, publish).

## Later (ideas, not scheduled)
- `pg_trgm` fuzzy search; Cloudflare Images loader for avatars.
