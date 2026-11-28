# Progress

**Current milestone:** 6 — Cloudflare deploy (config PR open, not deployed). Milestone 5 (admin) not started.
**Last updated:** 2026-11-28

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
- Milestone 6 (in progress): OpenNext/wrangler config, deploy env guard. Local Worker build and static pages
  checked (see docs/deployment.md). Not deployed: needs the owner's Cloudflare setup and go-ahead.

- 2026-11-25: Bulk import (decision #30) and full guides (decision #35): 100 guides written from READMEs, checked by
  `checkGuide`, published by the `publish-guides` job; a published guide makes the page indexable.

- 2026-11-26: Homepage "Featured" section removed (owner: looked like promotion) and pages re-render after new data
  (PRs #16, #17). 200-repo expansion: 8 batches of new AI repos, each with a summary and a full guide from its README
  at a pinned SHA (PRs #18 and the batch 2–8 PR). Excluded by decision #34/#37 rules: see decision #37.
- 2026-11-26: Local writer (`pnpm writer`, decision #38, `docs/local-writer.md`): any LLM (Claude API or
  OpenAI-compatible/local) writes full pages for new repos and stores them in Supabase directly; skips repos
  already in the system; rejects pages whose commands, numbers or links aren't in the README. Unit-tested with
  fake GitHub and model; a dry run here reached real GitHub search and the DB, but the sandbox blocks GitHub's
  per-repo API, so no real model run has been done yet. The site itself needed no change (it already reads the DB).
- 2026-11-27: Owner's first writer runs (OpenRouter model) published herdr, cherry-studio and system_prompts_leaks.
  Search-as-you-type only knew the embedded top-150 list, cached for hours, so new repos needed Enter; added
  `/api/suggest` (whole catalog, cached per query) used when the embedded list has fewer than 6 matches. Writer now
  pre-filters editorial exclusions (#34/#37: leaked prompts, free-model proxies, deepfakes...) and the prompt lists them.
- 2026-11-28: Redesign (decision #41): forest-green "field guide" look replaces violet/Geist. New tokens, fonts
  (Fraunces, Schibsted Grotesk, JetBrains Mono), radii, flat surfaces, editorial hero, leaderboard and terminal styling,
  share-image colors. No data or layout features changed. Checked light/dark at 1440px and phone width, contrast.

## Not done / known gaps
- Weekly board and Trending appear ~7 days after the first real job run; monthly after ~30 days.
- Rank movement (`previous_rank`) is stored but not shown in the leaderboard UI yet.
- The sandbox proxy blocks `GET /repositories/{id}`, so the snapshot job was only unit-tested here; it runs in Actions.
- Builds now fetch from Supabase; a build fails if Supabase is unreachable. In the cloud sandbox run builds
  with `NODE_USE_ENV_PROXY=1` (Node fetch ignores HTTPS_PROXY otherwise).
- `NEXT_PUBLIC_SITE_URL` must be set to the real domain at deploy (defaults to localhost). Owner hasn't chosen a domain yet.
- Proxy + `next/og` on Cloudflare Workers not yet tested (Milestone 6).
- Collections pages moved to Milestone 5.
- Full guides exist for the top 100 published repos by stars (data/guides/, PRs #12, #13). All are "Based on official
  documentation" (commands from each README at a pinned commit), none executed by us. tesseract and openai-cookbook
  were skipped (README has no install steps). The ~imported basic pages without a guide stay noindex.
- No admin accounts yet (`admin_users` empty); content edits need the dashboard or service role until M5.
- Legal pages are placeholders. Cloudflare build: M6.

## Blockers / needs from owner
- Merge the Cloudflare config PR; create the R2 bucket `airepohub-opennext-cache`; connect the repo in Workers Builds
  with the settings in docs/deployment.md; say "deploy" to authorize.
- Choose a domain (then update `NEXT_PUBLIC_SITE_URL` and rebuild).
- Admin login doesn't exist yet (Milestone 5); no one can edit content from the site.

## Next recommended step
First deploy to workers.dev, then check search, 404/301 and request-time reads live. Then Milestone 5 (admin).

## Later (ideas, not scheduled)
- `pg_trgm` fuzzy search; Cloudflare Images loader for avatars.
