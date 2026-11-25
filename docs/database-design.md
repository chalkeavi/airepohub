# Database design

Source of truth: `supabase/migrations/`. This doc explains intent; read the SQL for details.
Validated 2026-11-24 by loading the migration into PGlite (Postgres 17 in WASM) with an `auth`
stub; `tests/db/schema.test.ts` repeats that check (tables, full-text search, constraints, anon RLS).
Applied to Supabase project `airepohub` (ref `ugykphnasjjtmzeygwoq`, us-east-2, free plan) on 2026-11-25:
`initial_schema` via the Supabase MCP; `20261125000000_harden_rls_and_content_fields.sql` and
`supabase/seed.sql` run by the owner in the SQL Editor. Security advisor: 0 findings after the second migration.

## Entities
| Table | Purpose | Key constraints |
|---|---|---|
| `repositories` | One row per GitHub repo (published or not) | unique `github_id`, `full_name` (citext), `slug`, `github_url`; `published_at` required when published; generated `search_vector` (GIN) |
| `categories` / `repository_categories` | Taxonomy, many-to-many, one optional primary | slug format check; one primary per repo (partial unique index) |
| `repository_aliases` | Old slugs / renamed or transferred repos → 301 to canonical | unique alias slug and alias full name |
| `repository_content` | Approved structured product-page sections (60-second summary, features, strengths, limitations, use cases, costs, troubleshooting, FAQs) | 1:1 with repo; keeps `source_urls`, `source_commit_sha` |
| `installation_guides` | Per OS + method guide | `verification_status` enum; `source_url` NOT NULL; unique (repo, os, method) |
| `tutorials` | First practical tutorial(s) | unique (repo, slug) |
| `seo_metadata` | Title/description overrides, OG image, noindex | length checks (70/170) |
| `collections` / `collection_items` | Curated lists for Instagram campaigns | ordered, unique position |
| `repository_stats` | Daily star/fork/issue snapshots for growth | unique (repo, `recorded_on`) → job is idempotent |
| `ranking_snapshots` | Precomputed ranks per period (+ optional category) | stores `previous_rank`, `star_growth` (null when unknown), `signals`, methodology version |
| `discovery_queue` | Candidates from GitHub discovery | unique `github_id` (dedupe), relevance score + reasons, review fields |
| `content_drafts` | AI drafts awaiting review | `uncertain_fields`, `source_refs`, `model_used`, `source_revision`, `review_status` |
| `automation_runs` | Job history: status, counts, API calls, AI tokens, errors | for observability and cost tracking |
| `admin_users` | Admin role per Supabase Auth user | managed via dashboard/service role only |
| `audit_logs` | Append-only record of admin/automation actions | before/after JSON |

## Status model
`repositories.status`: draft → in_review → published | rejected; published → archived.
Guides and tutorials have their own `content_status` and are public only if both they and the
repo are published. Drafts never leave `content_drafts` until an admin approves them; approval
copies reviewed content into `repository_content` / guides (Milestone 5).

## Row Level Security
- Every table has RLS enabled.
- `anon`/`authenticated`: SELECT only on published repos and their published child rows
  (`repo_is_published()` helper), categories, published collections, stats and rankings of
  published repos. Nothing from `content_drafts`, `discovery_queue`, `automation_runs`,
  `audit_logs`, `admin_users`.
- Admins (`is_admin()` = row in `admin_users` for `auth.uid()`): read everything, write content.
- Automation uses the service-role key (bypasses RLS) from GitHub Actions secrets only.
- `private.is_admin()` and `private.repo_is_published()` are `security definer` with an empty `search_path`,
  in the `private` schema so PostgREST does not expose them as RPC endpoints.
- One SELECT policy per table (public rows OR admin); admin writes are separate insert/update/delete
  policies. Helpers are called as `(select private.is_admin())` so Postgres evaluates them once per query.
- Every foreign key has an index.

## Product-page fields (second migration)
`repository_content`: `hero_commands`, `overview`, `best_for`, `facts`, `install_meta`
(`{verificationNote, supportedOs, firstRun, sourceUrl}`). `installation_guides`: `label` (tab name), `sort_order`.

## Seed
`scripts/generate-seed.ts` (`pnpm seed:generate`) writes `supabase/seed.sql` from the sample data:
categories, repos, categories links, one `repository_stats` row per repo (capture time 2026-11-24), OpenSEO
content/guides/tutorial, and the first `all_time` ranking snapshot (global + per category, `star_growth`
and `previous_rank` null). Idempotent; strings are dollar-quoted so it survives pasting into the SQL Editor.
`tests/db/seed.test.ts` applies it twice in PGlite.

## Search
Weighted `tsvector` (name A; summary/description B; topics C; long description D), queried with
`websearch_to_tsquery`, filters via partial indexes on published rows. Trigram fuzzy matching
(`pg_trgm`) can be added later for typo tolerance; no paid search service.

## Scale notes (10k+ repos)
Partial indexes on `status = 'published'`; snapshots are one row/repo/day (≈3.6M rows/year at
10k repos; prune or roll up to weekly after 90 days, which Supabase Free's 500 MB can hold only
with pruning — revisit in Milestone 4).
