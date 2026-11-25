# Progress

**Current milestone:** 1 — Foundation and design (built, awaiting owner review)
**Last updated:** 2026-11-25

## Done (implemented and checked)
- Project memory: `CLAUDE.md`, `.claude/skills/airepohub-development/SKILL.md`, `docs/*`.
- Architecture, design system, SEO strategy, deployment notes, milestone plan.
- Database schema `supabase/migrations/20261124000000_initial_schema.sql`
  (17 tables, enums, indexes, full-text search, RLS). Tested in PGlite, **not yet applied to Supabase**.
- Next.js 16.4.6 app: homepage, `/repo/[slug]`, `/categories`, `/categories/[slug]`, `/search`,
  `/about` (ranking methodology), legal placeholders, 404. Light/dark, responsive.
- Sample data: 24 real repos with GitHub metadata captured 2026-11-24; full product-page content
  for OpenSEO only, grounded in its README/HOW_TO_USE at commit 7ea75c7.
- Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` (24 tests), `pnpm build` pass; pages
  screenshot-checked at 1280px and 375px, light and dark, no horizontal overflow or console errors.

## Not done / known gaps
- No Supabase connection yet (Milestone 2). Rankings come from sample data, not snapshots.
- Weekly/monthly rankings and Trending show empty states until star history exists.
- Only OpenSEO has a full guide; the other 23 pages show GitHub facts + "guide in review".
- OpenSEO install guide is "Based on official documentation"; not executed by us.
- Legal pages are placeholders. No sitemap/robots/JSON-LD/OG images yet (Milestone 3).
- Cloudflare build not attempted yet (Milestone 6).
- Homepage and admin wireframes not received; homepage layout is our interpretation.

## Blockers / needs from owner
- Review the Milestone 1 design.
- Supabase project (URL + anon key; service-role key as a GitHub secret later) for Milestone 2.
- Homepage and admin wireframes, if you have them.

## Next recommended step
Milestone 2: create the Supabase project, apply the migration, seed categories and the sample repos,
and swap `src/lib/data/` to Supabase without changing its function signatures.

## Later (ideas, not scheduled)
- `pg_trgm` fuzzy search; Cloudflare Images loader for avatars.
