---
name: airepohub-development
description: Workflow, code-quality rules and memory-update process for developing AIRepoHub (Next.js + Supabase AI repo discovery site). Use for any AIRepoHub feature, bug fix, UI, data, SEO, ranking, discovery, admin or documentation task in this repository.
---

# AIRepoHub development

## Before you change anything
1. Read `CLAUDE.md` and `docs/progress.md`.
2. Find decisions for the area you're touching: `grep -n "<area>" docs/decisions.md`.
3. Read only the doc section you need (`docs/architecture.md`, `docs/database-design.md`,
   `docs/design-system.md`, `docs/seo-strategy.md`, `docs/product-requirements.md`).
4. Open the relevant source files. Code is the source of truth for what exists.

## Building
- Stay inside the current milestone (`docs/implementation-plan.md`). Note out-of-scope ideas
  in `docs/progress.md` under "Later" instead of building them.
- Data: add or change queries only in `src/lib/data/` (server-only, typed by `src/lib/types.ts`).
  Keep function signatures stable so the sample → Supabase swap needs no UI changes.
- UI: compose from `src/components/ui` primitives and design tokens in `src/app/globals.css`.
  No raw hex colors in components. Check light + dark, 375px and 1280px widths, keyboard focus.
- Server Components by default; `"use client"` only for interaction (copy, tabs, theme, search box).
- Content honesty: no invented stats, commands, outputs or growth. Missing data → empty state.
  Install guides need `verification_status` and a `source_url` (+ commit SHA when known).
- Next.js 16 with Cache Components: data functions use `'use cache'` + `cacheLife`; dynamic
  routes need `generateStaticParams`; `params` is a Promise. Check `node_modules/next/dist/docs/`.

## Quality gate (run before saying "done")
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
Add or update tests for: ranking math, activity status, data-layer filters (published only),
and later RLS, search, admin authorization, deduplication, publishing workflow.
Screenshot changed pages at phone and desktop width when the UI changes.

## Memory updates (mandatory)
When the owner corrects you, clarifies a requirement, changes a design decision or states a
lasting preference:
1. Apply it to the code/docs.
2. Lasting rule → update `CLAUDE.md` or this skill (edit the existing line, don't duplicate).
3. Product/architecture decision → add a row to `docs/decisions.md`
   (date, area, decision, reason, files). Mark replaced rows `SUPERSEDED by #n`.
4. Progress change → update `docs/progress.md`.
5. Skip temporary discussion, unapproved ideas and wording tweaks. Never store secrets.

## Finishing
Update `docs/progress.md` (done / pending / blockers / next step), commit with a clear message,
and report: what changed, what was verified (and how), what was remembered, what's next.
