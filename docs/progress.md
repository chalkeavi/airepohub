# Progress

**Current milestone:** 6 — deployed to https://airepohub.chalkeavi.workers.dev (2026-11-25). Next: custom domain, then Milestone 5 (admin).
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

- Milestones 3 and 4 merged (PRs #3, #4). Daily jobs ran for real: snapshot 24 repos, rank 53 rows, discover 50 queued.
- Milestone 6: LIVE at https://airepohub.chalkeavi.workers.dev via Workers Builds (auto-deploys `main`). Checked live 2026-11-25:
  home, repo, category, about, search, OG image, sitemap (41 URLs), robots → 200; unknown repo/category → 404;
  `/repo/OpenSEO` → 301; canonicals and sitemap use the workers.dev URL; "Stats as of Nov 25" comes from Supabase.
- Milestone 6 config: OpenNext/wrangler config, deploy env guard. Local Worker build and static pages
  checked (see docs/deployment.md). Not deployed: needs the owner's Cloudflare setup and go-ahead.

## Not done / known gaps
- Weekly board and Trending appear ~7 days after the first real job run; monthly after ~30 days.
- Rank movement (`previous_rank`) is stored but not shown in the leaderboard UI yet.
- The sandbox proxy blocks `GET /repositories/{id}`, so the snapshot job was only unit-tested here; it runs in Actions.
- Builds now fetch from Supabase; a build fails if Supabase is unreachable. In the cloud sandbox run builds
  with `NODE_USE_ENV_PROXY=1` (Node fetch ignores HTTPS_PROXY otherwise).
- `NEXT_PUBLIC_SITE_URL` must be set to the real domain at deploy (defaults to localhost). Owner hasn't chosen a domain yet.
- Collections pages moved to Milestone 5.
- Only OpenSEO has a full guide. Install guide is "Based on official documentation", not executed by us.
- No admin accounts yet (`admin_users` empty); content edits need the dashboard or service role until M5.
- Legal pages are placeholders. Cloudflare build: M6.

## Blockers / needs from owner
- Choose a domain (then update `NEXT_PUBLIC_SITE_URL` and rebuild).
- Admin login doesn't exist yet (Milestone 5); no one can edit content from the site.

## Next recommended step
Connect a custom domain (update `NEXT_PUBLIC_SITE_URL` in `.env.production`), then Milestone 5 (admin).

## Later (ideas, not scheduled)
- `pg_trgm` fuzzy search; Cloudflare Images loader for avatars.
