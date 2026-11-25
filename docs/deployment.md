# Deployment (target: Milestone 6, nothing deployed yet)

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
