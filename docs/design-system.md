# Design system

Tokens live in `src/app/globals.css` (`:root` light, `.dark` dark, mapped to Tailwind via
`@theme inline`). Components never use raw colors.

## Direction (decision #41, 2026-11-28)
A "field guide" to open-source AI: editorial, printed-matter feel instead of the generic SaaS look.
Forest-green accent on warm paper neutrals; dark mode is green-black ("forest at night") with a
moss accent. One pollen-yellow highlight, used sparingly (marker under the hero phrase, logo bar,
terminal title dot, text selection). Flat surfaces with hairline borders; when something lifts on
hover it gets a hard offset shadow (no soft blur). Topographic contour lines (`.bg-grid`) behind the
hero and product header. No purple, no gradient blobs, no robot/brain imagery. Motion: 150–200 ms
color/transform transitions only, respects `prefers-reduced-motion`.

## Typography
- **Fraunces** (display serif, `font-display`): h1, section h2s, category names, rank numbers (italic).
- **Schibsted Grotesk** (`font-sans`): UI and body text.
- **JetBrains Mono** (`font-mono`): code, eyebrow kickers, table headers, small counts.
- All self-hosted from `@fontsource-variable/*` imported in `layout.tsx` (no Google Fonts request).
- Scale: hero 46–76px/0.98 tracking -0.03em, product h1 44–60px, section h2 28–36px, body 15–16px/1.6,
  eyebrow 11px mono uppercase tracking 0.12em with a 24px leading rule in the accent color.

## Color tokens
| Token | Use | Light | Dark |
|---|---|---|---|
| `background` | page | warm paper | green-black |
| `surface` | cards | near-white paper | raised green-black |
| `surface-muted` | wells, code rows, hover | sage-tinted 95% | 23.5% |
| `border` / `border-strong` | hairlines | 88.5% / 79% | 29.5% / 38% |
| `foreground` / `muted-foreground` | text | forest ink 23% / 46% | warm white 94.5% / 74% |
| `ink` / `ink-foreground` | primary buttons, active tab, logo tile | deep forest | warm white |
| `accent` / `accent-foreground` | links, accents, eyebrow | forest green 0.45 | moss 0.80 |
| `accent-soft` | tinted chips, icon tiles | pale sage | dark moss |
| `highlight` | marker, selection | pollen yellow | pollen yellow |
| `success`, `warning`, `danger` | status chips (teal-green, ochre, brick) | | |
| `terminal` | always-dark code surfaces | forest night | deeper |
Contrast (checked 2026-11-28, WCAG): text and muted text ≥ 6:1 on background/surfaces in both themes;
accent ≥ 6:1; status chips ≥ 4.5:1.

## Spacing and layout
4px grid. Container `max-w-[1200px]`, gutters 16px (phone) / 24px / 32px (desktop).
Section rhythm 64–96px on desktop, 48px on phone. Card padding 20–24px. Radius (Tailwind scale retuned in `@theme`): sm 3px, md 4px, lg 6px (controls), xl 8px (cards),
2xl 10px. Badges are square-cornered tags, not pills. Product page: content column + 360px sidebar on ≥ lg, stacked below.

## Components
| Component | File | Notes |
|---|---|---|
| Button | `ui/button.tsx` | variants: primary (dark/ink), accent, outline, ghost; sizes sm/md/lg |
| Badge | `ui/badge.tsx` | neutral, accent, success, warning, danger, outline |
| Kbd | `ui/kbd.tsx` | keyboard hint |
| Logo | `site/logo.tsx` | original "level" mark: three ascending bars (tallest in highlight) in an ink tile; serif wordmark with italic "Hub" |
| Header / MobileNav / Footer | `site/*` | sticky header with blur, sheet nav < md |
| SearchBox | `site/search-box.tsx` | suggestions from server-provided list; ⌘K / `/` focuses |
| ThemeToggle | `site/theme-toggle.tsx` | class strategy, inline script prevents flash |
| RepoAvatar, RepoCard, Leaderboard | `repo/*` | leaderboard rows link to product pages |
| Product sections | `repo/product/*` | hero, terminal, section nav, 60-seconds, features, install, tutorial, costs, troubleshooting, sidebar |
| CodeBlock / CopyButton / OsTabs | `repo/code-block.tsx` etc. | light shell tokenizer, copy, all OS panels in HTML |
| EmptyState | `ui/empty-state.tsx` | icon, title, explanation, optional action |
| AdSlot | `ads/ad-slot.tsx` | renders nothing unless enabled |

## Wireframe mapping (product page)
| Wireframe | Implementation | Change |
|---|---|---|
| Header (logo, Discover, Categories, Collections, Submit Repo, search ⌘K) | Header with Explore, Rankings, Categories, Trending + search + theme toggle | nav items per the brief |
| Breadcrumb | same | |
| Large icon tile + name + summary + chips + "View on GitHub" / "Quick Start" | same, adds stars, last updated, activity, copy URL | brief section A |
| Terminal with audit output | terminal with **documented commands only** | wireframe output (score, issue counts) would be fabricated |
| Tabs (Overview, Features, Installation, Quick Start, Examples, Alternatives) | sticky anchor section nav | all content stays in the HTML for SEO |
| "Why use" + 3 feature cards | "Understand in 60 seconds" + key features | brief section B/C |
| "Get started in minutes" numbered steps with copy | Installation guide with OS tabs + verification badge | grounded commands |
| At a glance / Best for / View on GitHub card | sidebar, same three cards + source attribution | |
| Similar AI repositories | Related repositories | |

Homepage has no wireframe yet; its layout is our interpretation using the same components.
