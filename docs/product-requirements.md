# AIRepoHub product requirements

Condensed from the owner's master brief (project file "github project prompt.pdf", Nov 2026).
This file stands in for the separate `requirements.md` the brief also mentions (see decisions #3).

## Vision
Discovery and learning platform for useful open-source AI GitHub repositories.
Tagline: **Discover. Install. Build.** Real public product, monetized later with Google AdSense.

Problem: developers and beginners can't tell what a repo does, who it's for, how to install and
configure it, what keys/hardware/paid services it needs, how to use it in a real project, what the
alternatives are, or how active and trustworthy it is. Competitors show name, stars, blurb.
AIRepoHub turns each repo into a beginner-friendly **product page**. Must scale to thousands of repos
through one template (no hand-written page per repo).

## Visual design
- Wireframes are the primary reference (received so far: product page only; homepage and admin
  wireframes not yet supplied). Improve aesthetics, keep structure.
- Inspiration: Linear, Vercel, Product Hunt, modern docs sites. Elegant, minimal, premium type,
  consistent spacing, subtle borders/shadows, light + dark themes, restrained motion, excellent
  mobile, accessible contrast and keyboard nav. No gradient clutter or generic "AI" visuals.

## Homepage
- Header: logo, Explore, Rankings, Categories, Trending, Search, theme toggle; works on mobile.
- Hero: "Discover the best open-source AI tools." / "Explore powerful GitHub repositories,
  understand what they do, and learn how to install and use them." Global search with
  suggestions, popular categories, trending search terms (only when data exists).
- **Top 10 leaderboard**: rank, name, avatar, short description, category, stars, weekly growth
  and rank movement (only when real history exists), link to product page. Filters: This Week,
  This Month, All Time, Category. Data from Supabase snapshots, never hardcoded.
- Sections: Trending This Week, Recently Added, Browse by Category (AI Agents, Coding Assistants,
  Local LLMs, AI Automation, SEO & Marketing, Image Generation, Video Generation, RAG & Knowledge,
  Developer Tools, Productivity), Featured Repository spotlight, Beginner-Friendly Projects.
- Footer: About, Contact, Privacy Policy, Terms, Disclaimer, GitHub attribution.
- Only functional sections; designed empty states when data is missing.

## Repository product page `/repo/[slug]`
A. Hero: name, avatar, summary, category, stars, language, license, last updated, activity status
   (defined criteria), Visit GitHub, copy repo URL.
B. "Understand this repository in 60 seconds": what it does, problem solved, who should use it,
   why choose it, setup difficulty, important requirements. Plain English, no marketing fluff.
C. Detailed description: overview, core capabilities, key features, strengths, limitations,
   practical use cases.
D. Installation guide: prerequisites, dependencies, supported OS, commands, env config, API keys,
   first-run commands, expected output where documented. Highlighted code blocks with copy
   buttons; Windows/macOS/Linux tabs when they differ. **Never fabricate commands.** Status:
   Verified by testing / Based on official documentation / Awaiting verification. Never run
   untrusted repos on the production server.
E. First practical tutorial: use case, setup, commands/code, expected behavior, next steps.
F. Costs and requirements: license, API charges, hosting, hardware, external services. Free code
   is not free infrastructure.
G. Troubleshooting grounded in documentation.
H. Related repositories (category, use case, language, features).
I. Source and attribution: prominent link to original repo and maintainers; respect licenses,
   don't copy large chunks of docs.

## Data (Supabase Postgres, mandatory)
Entities: repositories, categories, repository_categories, installation_guides, tutorials,
repository_stats, discovery_queue, content_drafts, ranking_snapshots, plus admin roles, audit
logs, repository aliases, automation runs, SEO metadata. FKs, unique constraints, indexes,
timestamps, enums/checks, versioned migrations, Postgres full-text search. RLS: anon reads
published only; drafts private; only admins manage content; ingestion uses backend credentials;
service-role key never in client code. Must handle 10,000+ repos. Detail: `database-design.md`.

## Discovery automation (daily, GitHub Actions)
Query GitHub API (new, active, growing AI repos by topic/language/description), respect rate
limits, normalize, validate identity, dedupe by GitHub ID, classify AI relevance, score, insert
into discovery queue, prepare AI drafts, require admin approval. Store own star snapshots (Search
API is not a trending history). Idempotent, retryable, observable, secure, cost-aware.

## AI content generation
Provider-agnostic (Gemini or Claude via env). Reads repo docs, drafts: plain-English description,
what it does, use cases, features, requirements, setup guidance, FAQs, SEO title/description,
category suggestions. Drafts only; preserve source refs; flag missing/uncertain info; never invent
features or commands; regenerate after major updates; admin approval before publishing. No thin
mass pages.

## Ranking
Transparent weighted score: stars 30%, recent star growth 30%, activity 20%, documentation quality
10%, community engagement 10%; normalized so giants don't dominate. Weekly, monthly, all-time,
per-category. Stored as snapshots; not computed per request. Methodology documented.

## Admin dashboard (secure, server-side checks)
Auth, discovery queue, review generated content, preview pages, edit, approve/publish, reject,
manage categories, mark guides verified, refresh repo info, automation errors, content stats.

## Search
Postgres search by name, description, category, language, use case, keywords. Filters: stars,
category, difficulty, language, recently updated, trending. Paginated; never load everything
client-side.

## SEO
Unique URLs, SSR, unique titles/descriptions, canonical, Open Graph, dynamic sitemap, robots.txt,
structured data, internal links, category landing pages, breadcrumbs, helpful 404, fast, mobile.
Unpublished content never in sitemaps. Detail: `seo-strategy.md`.

## AdSense
Clear hierarchy, natural ad slots with spacing from navigation, consent where required, no
misleading placement. Configurable ad components, off until approved.

## Instagram traffic
Attractive social previews, mobile-first landing, shareable pages, curated collections
(`/collections/5-ai-tools-for-developers`), UTM tracking, analytics. No automated commenting,
scraping or spam.

## Hosting and cost
Cloudflare DNS + Workers, Supabase Free, GitHub Actions, GitHub. Cache pages and rankings, efficient
queries, AI generation in scheduled jobs only, request limits, cost visibility. Document any
Workers Free limitation and a low-cost alternative.

## Quality
Tests for RLS, product pages, search, rankings, admin auth, dedupe, publishing workflow. Loading,
empty and error states. Never claim integrations, tests or deployment that weren't performed.

## First real example
https://github.com/vikasswebdev/OpenSEO — use its actual docs and metadata end to end
(GitHub API → Supabase → product page → SEO metadata → public site).
