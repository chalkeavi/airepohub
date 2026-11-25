# Implementation plan

Status legend: ✅ done and checked · 🟡 in progress · ⬜ planned

## Milestone 1 — Foundation and design 🟡
- ✅ Analyze wireframe (product page) and requirements
- ✅ Architecture, database schema (migration validated in PGlite), design system, this plan
- ✅ Next.js 16 + TS + Tailwind v4 scaffold, shadcn conventions, light/dark tokens
- ✅ Homepage UI (interpretation, no wireframe yet) on sample data
- ✅ Product page UI `/repo/[slug]` per wireframe; OpenSEO with full content from its docs
- ✅ Category, search, legal placeholder and 404 pages so navigation has no dead links
- ✅ Typed data layer over sample data, ranking + activity logic with unit tests
- ⬜ Owner review of the design → adjust

## Milestone 2 — Supabase integration
- Create Supabase project (owner), apply migration, seed categories + sample repos
- `@supabase/supabase-js` server client; swap `src/lib/data` internals to Supabase
- RLS tests against a real local Supabase (`supabase start`) in CI
- Load OpenSEO end to end from the GitHub API through a seed script

## Milestone 3 — Working dynamic pages
- `/repo/[slug]` from Supabase incl. guides, tutorials, content; alias redirects
- `generateMetadata`, JSON-LD, OG images, `sitemap.ts`, `robots.ts`
- Category landing pages, collections, render tests

## Milestone 4 — Discovery and rankings
- GitHub Actions cron: discovery (search API, rate-limit aware, dedupe by `github_id`,
  relevance score), daily `repository_stats`, ranking job → `ranking_snapshots`
- Metadata refresh job, `automation_runs` logging, tests for dedupe and ranking

## Milestone 5 — Content and admin
- Provider-agnostic AI drafting (Gemini/Claude) from README + docs with source refs
- `/admin` with Supabase Auth + server-side role check: queue, drafts, edit, preview,
  approve/publish, reject, categories, verify guides, refresh, run errors, stats
- Admin wireframe needed from owner

## Milestone 6 — Production launch
- OpenNext Cloudflare build + deploy, custom domain, caching bindings
- Analytics with UTM, Search Console, consent banner, AdSense slots enabled after approval
- Security review, performance (Lighthouse), production checklist
