# Design system

Tokens live in `src/app/globals.css` (`:root` light, `.dark` dark, mapped to Tailwind via
`@theme inline`). Components never use raw colors.

## Direction
Calm, precise developer product (Linear / Vercel / good docs sites), with one confident violet
accent taken from the wireframe. Lavender-tinted neutrals, hairline borders, very soft shadows,
generous whitespace, dense information where it helps (leaderboard, at-a-glance). No gradient
blobs, no robot/brain imagery. Motion: 150–200 ms color/transform transitions only, respects
`prefers-reduced-motion`.

## Typography
- **Geist Sans** (UI, headings), **Geist Mono** (code, numbers in stats), via the `geist` package
  (self-hosted, no Google Fonts request).
- Scale: display 44–56px/1.05 tracking -0.035em (hero), h1 36–44px, h2 24–28px, h3 17–18px,
  body 15–16px/1.6, small 13px, micro 12px uppercase tracking 0.06em for eyebrows.
- Numbers use `tabular-nums`.

## Color tokens
| Token | Use | Light | Dark |
|---|---|---|---|
| `background` | page | lavender-white | near-black violet |
| `surface` | cards | white | raised dark |
| `surface-muted` | wells, code rows, hover | 97% | 21% |
| `border` | hairlines | 91% | 28% |
| `foreground` / `muted-foreground` | text | 20% / 48% | 96% / 70% |
| `accent` / `accent-foreground` | primary actions, links, active tab | violet 0.53 | violet 0.70 |
| `accent-soft` | tinted chips, icon tiles | violet 96% | violet 25% |
| `success`, `warning`, `danger` | status chips (activity, verification) | | |
| `terminal` | always-dark code surfaces | | |
Contrast: body and muted text meet WCAG AA on `background` and `surface` in both themes.

## Spacing and layout
4px grid. Container `max-w-[1200px]`, gutters 16px (phone) / 24px / 32px (desktop).
Section rhythm 64–96px on desktop, 48px on phone. Card padding 20–24px. Radius: 8px controls,
12px cards, 16px hero tiles. Product page: content column + 360px sidebar on ≥ lg, stacked below.

## Components
| Component | File | Notes |
|---|---|---|
| Button | `ui/button.tsx` | variants: primary (dark/ink), accent, outline, ghost; sizes sm/md/lg |
| Badge | `ui/badge.tsx` | neutral, accent, success, warning, danger, outline |
| Kbd | `ui/kbd.tsx` | keyboard hint |
| Logo | `site/logo.tsx` | original "level" mark: three ascending bars in a rounded tile |
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
