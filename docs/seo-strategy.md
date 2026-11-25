# SEO strategy

## URL structure
| URL | Content | Render |
|---|---|---|
| `/` | Top 10, trending, recently added, categories, featured, beginner-friendly | prerendered + cached |
| `/repo/[slug]` | One canonical product page per published repo | prerendered for known slugs, cached on demand for new ones |
| `/categories/[slug]` | Category landing page with intro + repo list | prerendered |
| `/search?q=` | Search results (noindex, follow) | request time |
| `/collections/[slug]` | Curated lists for social campaigns (Milestone 3+) | prerendered |
| `/about`, `/contact`, `/privacy`, `/terms`, `/disclaimer` | Trust pages (needed for AdSense) | static |

Aliases (old slugs, renamed repos) 301 to the canonical slug. Unpublished slugs return 404.

## Per page
- Unique `<title>` (`{Name}: {what it does} | AIRepoHub`, ≤ 60 chars) and meta description
  (≤ 160 chars) from `seo_metadata`, falling back to summary.
- `alternates.canonical`, Open Graph + Twitter card; per-repo OG image generated with
  `next/og` (Milestone 3; check Workers compatibility).
- JSON-LD: `SoftwareSourceCode` (name, codeRepository, programmingLanguage, license, author),
  `BreadcrumbList` on repo and category pages, `HowTo` only for verified install guides,
  `FAQPage` only for real FAQs. `ItemList` for Top 10 on home.
- All section content in server HTML. In-page navigation uses anchors; OS tabs render every OS
  panel in the HTML.
- Breadcrumbs (Home / Category / Repo), related repos and category links for internal linking.

## Site level
- `app/sitemap.ts`: home, categories, published repos with `lastModified` = content update time;
  split with `generateSitemaps` past 5,000 URLs. Never includes drafts.
- `app/robots.ts`: allow all, disallow `/admin`, `/api`, `/search`; link sitemap.
- Helpful 404 with search and popular categories.
- Performance: server components, no client data fetching for content, system/self-hosted fonts,
  sized images, minimal JS.

## Quality guardrails
No thin pages: a repo is published only with an approved summary, 60-second section and at least
one sourced install guide. No auto-publishing of AI drafts. UTM parameters are stripped from
canonicals.
