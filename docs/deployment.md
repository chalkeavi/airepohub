# Deployment (live at https://airepohub.chalkeavi.workers.dev since 2026-11-25)

## Target
- Cloudflare DNS + custom domain → Cloudflare Workers running Next.js via `@opennextjs/cloudflare`.
- Supabase hosted Postgres + Auth (Free tier to start).
- GitHub Actions for scheduled jobs (discovery, snapshots, ranking, drafting).

## Compatibility (verified at the version level 2026-11-24, not yet by a real deploy)
- `@opennextjs/cloudflare@1.20.18` declares support for `next >=16.4.5`; we use `16.4.6`.
- Needs `wrangler ^4.148`, `compatibility_flags = ["nodejs_compat"]`, a recent
  `compatibility_date`, and an incremental cache (R2 or KV) for `'use cache'`/revalidation.
- `next/image` optimization is disabled (`images.unoptimized`); GitHub avatars are served
  directly at small sizes. Option later: Cloudflare Images loader.

## Cost and limits to watch
| Item | Free tier | Risk | Fallback |
|---|---|---|---|
| Workers requests | 100k/day | Instagram spikes | Workers Paid $5/mo (10M req) |
| Workers CPU | 10 ms/request | SSR of large pages | Cache aggressively; Paid allows 30 s |
| Worker size | 3 MiB compressed | Next.js bundle may exceed | Paid allows 10 MiB |
| Supabase DB | 500 MB, pauses after 7 days idle | snapshot growth; pausing | prune snapshots; daily job keeps it active; Pro $25/mo |
| GitHub Actions | 2,000 min/mo (private repo) | long jobs | keep jobs short, batch API calls |
| AI API | pay per token | regeneration loops | only eligible repos, cap per run, log tokens in `automation_runs` |

The Workers bundle size and CPU limit are the most likely reasons to need Workers Paid. We'll
measure this in Milestone 6 before launch rather than assume the free tier is enough.

## Environment variables
| Name | Where | Public? |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Workers | yes |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Workers | yes (RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | GitHub Actions secret, set by the owner at Settings → Secrets and variables → Actions | **no** |
| `GITHUB_TOKEN` (jobs) | GitHub Actions, provided automatically (1,000 requests/hour per repo) | **no** |
| `AI_PROVIDER` (`gemini`/`claude`), `AI_MODEL`, `AI_API_KEY` | GitHub Actions | **no** |
| `NEXT_PUBLIC_ADS_ENABLED`, `NEXT_PUBLIC_ADSENSE_CLIENT` | Workers | yes, off until approved |

`.env.example` lists them with empty values. Never commit real values.

## Cloudflare config in this repo (added 2026-11-25, branch `milestone-6-cloudflare`)
- `wrangler.jsonc`: Worker `airepohub`, `nodejs_compat`, assets binding, self-reference service binding,
  R2 bucket `airepohub-opennext-cache` (binding `NEXT_INC_CACHE_R2_BUCKET`), public Supabase vars.
- `open-next.config.ts`: R2 incremental cache.
- Scripts: `pnpm cf:build` (env check + OpenNext build), `pnpm cf:preview`, `pnpm cf:deploy`.
- `scripts/check-deploy-env.mjs` stops a build without the Supabase vars (otherwise the site silently
  falls back to sample data), with a localhost `NEXT_PUBLIC_SITE_URL`, or with a service-role key present.

## Verified locally (2026-11-25, not a real deploy)
- OpenNext build exit 0; Worker bundle 2,492 KiB gzip (under the 3 MiB free limit).
- `wrangler dev` + `populateCache local`: `/`, `/repo/openseo`, `/categories/local-llms`, `/sitemap.xml`,
  `/about`, `/repo/openseo/opengraph-image` return 200 with real content.
- Not verifiable in the sandbox (workerd has no network): `/search`, the 404/301 proxy, request-time Supabase reads.
  Check these on the workers.dev URL after the first deploy.
- Build warnings to watch: Node middleware (`src/proxy.ts`) is experimental on Cloudflare; Cache Components are
  not fully supported by OpenNext yet.

## Workers Builds settings (Cloudflare dashboard)
| Setting | Value |
|---|---|
| Worker name | `airepohub` (must match `wrangler.jsonc`) |
| Production branch | `main` |
| Build command | `pnpm cf:build` |
| Deploy command | `npx wrangler deploy` (detects OpenNext and runs its deploy) |
| Non-production branch builds | off (the default command there skips OpenNext) |
| Build variables | none needed: public values are committed in `.env.production` (dashboard build variables override them) |

`NEXT_PUBLIC_*` values are baked in at build time, so changing the site URL needs a rebuild.
