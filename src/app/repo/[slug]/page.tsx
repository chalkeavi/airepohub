import {
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock,
  FileCode,
  FileText,
  GitCompare,
  GitFork,
  Home,
  Layers,
  LifeBuoy,
  Minus,
  Plus,
  Puzzle,
  ScanSearch,
  Shield,
  Star,
  Target,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdSlot } from "@/components/ads/ad-slot";
import { ActivityBadge } from "@/components/repo/activity-badge";
import { CodeBlock } from "@/components/repo/code-block";
import { CopyButton } from "@/components/repo/copy-button";
import { Card, SectionTitle } from "@/components/repo/product/card";
import { OsTabs } from "@/components/repo/product/os-tabs";
import { SectionNav } from "@/components/repo/product/section-nav";
import { StepList } from "@/components/repo/product/step-list";
import { RepoAvatar } from "@/components/repo/repo-avatar";
import { RepoCard } from "@/components/repo/repo-card";
import { Terminal } from "@/components/repo/terminal";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GithubIcon } from "@/components/ui/github-icon";
import { JsonLd } from "@/components/site/json-ld";
import {
  getCategories,
  getDataAsOf,
  getPrerenderSlugs,
  getRelatedRepositories,
  getRepositoryBySlug,
  getRepositoryContent,
  getRepositorySeo,
} from "@/lib/data";
import { breadcrumbJsonLd, howToJsonLd, repoDescription, repoTitle, softwareSourceCodeJsonLd } from "@/lib/seo";
import type { RepositoryContent, VerificationStatus } from "@/lib/types";
import { DIFFICULTY_LABEL, KIND_LABEL, cn, formatCount, formatDate, licenseLabel, timeAgo } from "@/lib/utils";

// Only the most-starred pages are built at deploy; the rest render on first visit, then cache.
export async function generateStaticParams() {
  return (await getPrerenderSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/repo/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const [repo, content, seo] = await Promise.all([getRepositoryBySlug(slug), getRepositoryContent(slug), getRepositorySeo(slug)]);
  if (!repo) return { title: "Repository not found", robots: { index: false } };
  const title = repoTitle(repo, seo?.title);
  const description = repoDescription(repo, Boolean(content), seo?.description);
  const url = `/repo/${repo.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: seo?.noindex ? { index: false, follow: true } : undefined,
    openGraph: { title: `${title} | AIRepoHub`, description, url, type: "article" },
    twitter: { card: "summary_large_image", title: `${title} | AIRepoHub`, description },
  };
}

const FEATURE_ICONS: Record<string, LucideIcon> = {
  "scan-search": ScanSearch,
  layers: Layers,
  shield: Shield,
  "file-code": FileCode,
  "git-compare": GitCompare,
  puzzle: Puzzle,
};

const VERIFICATION: Record<VerificationStatus, { label: string; tone: "success" | "accent" | "warning"; icon: LucideIcon }> = {
  verified: { label: "Verified by testing", tone: "success", icon: BadgeCheck },
  official_docs: { label: "Based on official documentation", tone: "accent", icon: FileText },
  awaiting_verification: { label: "Awaiting verification", tone: "warning", icon: Clock },
};

export default async function RepositoryPage({ params }: PageProps<"/repo/[slug]">) {
  const { slug } = await params;
  const [repo, content, related, categories, asOf] = await Promise.all([
    getRepositoryBySlug(slug),
    getRepositoryContent(slug),
    getRelatedRepositories(slug),
    getCategories(),
    getDataAsOf(),
  ]);
  if (!repo) notFound();

  const catBySlug = new Map(categories.map((c) => [c.slug, c]));
  const primaryCategory = catBySlug.get(repo.categorySlugs[0]);

  const nav = content
    ? [
        { id: "overview", label: "Overview" },
        { id: "features", label: "Features" },
        { id: "installation", label: "Installation" },
        { id: "tutorial", label: "Quick start" },
        { id: "costs", label: "Costs" },
        { id: "troubleshooting", label: "Troubleshooting" },
        { id: "alternatives", label: "Alternatives" },
      ]
    : [
        { id: "overview", label: "Overview" },
        { id: "alternatives", label: "Alternatives" },
      ];

  const howTo = howToJsonLd(repo, content);
  const structuredData = [
    softwareSourceCodeJsonLd(repo, content),
    breadcrumbJsonLd([
      { name: "Home", path: "/" },
      ...(primaryCategory ? [{ name: primaryCategory.name, path: `/categories/${primaryCategory.slug}` }] : []),
      { name: repo.name, path: `/repo/${repo.slug}` },
    ]),
    ...(howTo ? [howTo] : []),
  ];

  return (
    <div className="relative">
      <JsonLd data={structuredData} />
      <div className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[520px]" aria-hidden />
      <div className="container-page relative">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="pt-6">
          <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
            <li>
              <Link href="/" className="flex items-center hover:text-foreground" aria-label="Home">
                <Home className="size-4" aria-hidden />
              </Link>
            </li>
            <ChevronRight className="size-3.5 opacity-60" aria-hidden />
            <li>
              <Link href="/categories" className="hover:text-foreground">
                AI Tools
              </Link>
            </li>
            {primaryCategory && (
              <>
                <ChevronRight className="size-3.5 opacity-60" aria-hidden />
                <li>
                  <Link href={`/categories/${primaryCategory.slug}`} className="hover:text-foreground">
                    {primaryCategory.name}
                  </Link>
                </li>
              </>
            )}
            <ChevronRight className="size-3.5 opacity-60" aria-hidden />
            <li aria-current="page" className="font-medium text-foreground">
              {repo.name}
            </li>
          </ol>
        </nav>

        {/* Hero */}
        <header className="grid gap-10 pb-10 pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-center lg:pb-12">
          <div className="min-w-0">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <RepoAvatar src={repo.avatarUrl} name={repo.name} size={88} className="shadow-raised" />
              <div className="min-w-0">
                <h1 className="font-display text-[44px] font-medium leading-[1.02] tracking-[-0.025em] sm:text-[60px]">{repo.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  by{" "}
                  <a
                    href={`https://github.com/${repo.owner}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-foreground hover:text-accent"
                  >
                    {repo.owner}
                  </a>
                </p>
              </div>
            </div>
            {repo.summary && <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">{repo.summary}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              {repo.categorySlugs.map((s) => (
                <Badge key={s} tone="accent">
                  {catBySlug.get(s)?.name}
                </Badge>
              ))}
              {repo.primaryLanguage && <Badge>{repo.primaryLanguage}</Badge>}
              <Badge>{licenseLabel(repo.licenseKey)} license</Badge>
              {repo.kind && <Badge>{KIND_LABEL[repo.kind]}</Badge>}
            </div>
            <dl className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
              <div className="flex items-center gap-1.5">
                <Star className="size-4 text-warning" aria-hidden />
                <dt className="sr-only">Stars</dt>
                <dd className="font-semibold">{repo.stars.toLocaleString("en-US")}</dd>
                <span className="text-muted-foreground">stars</span>
              </div>
              <div className="flex items-center gap-1.5">
                <GitFork className="size-4 text-muted-foreground" aria-hidden />
                <dt className="sr-only">Forks</dt>
                <dd className="font-semibold tabular-nums">{formatCount(repo.forks)}</dd>
                <span className="text-muted-foreground">forks</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="size-4 text-muted-foreground" aria-hidden />
                <dt className="text-muted-foreground">Last push</dt>
                <dd className="font-medium" title={formatDate(repo.lastPushedAt)}>
                  {timeAgo(repo.lastPushedAt, asOf)}
                </dd>
              </div>
              <div>
                <dt className="sr-only">Activity</dt>
                <dd>
                  <ActivityBadge repo={repo} asOf={asOf} />
                </dd>
              </div>
            </dl>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <ButtonLink href={repo.githubUrl} external size="lg">
                <GithubIcon /> View on GitHub <ArrowUpRight aria-hidden />
              </ButtonLink>
              {content && (
                <ButtonLink href="#installation" variant="soft" size="lg">
                  <Zap aria-hidden /> Install guide
                </ButtonLink>
              )}
              <CopyButton
                value={repo.githubUrl}
                label="Copy repo URL"
                showLabel
                className="h-11 rounded-lg px-3 text-sm text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              />
            </div>
          </div>
          {content ? (
            <Terminal
              title={`${repo.name}: quick start`}
              commands={content.heroCommands}
              footnote="Commands from the project's README. Run them after installing (see below)."
            />
          ) : (
            <div className="hidden lg:block" />
          )}
        </header>

        <SectionNav items={nav} />

        <div className="grid gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-8">
            {content ? (
              <ProductSections name={repo.name} content={content} difficulty={repo.difficulty} />
            ) : (
              <section id="overview" aria-labelledby="overview-title" className="scroll-mt-32">
                <Card>
                  <SectionTitle id="overview-title" kicker="Overview">
                    About {repo.name}
                  </SectionTitle>
                  {repo.description ? (
                    <blockquote className="border-l-2 border-accent pl-4 text-[15px] leading-relaxed">
                      {repo.description}
                      <footer className="mt-1.5 text-xs text-muted-foreground">Description from GitHub</footer>
                    </blockquote>
                  ) : (
                    <p className="text-[15px] text-muted-foreground">This repository has no description on GitHub.</p>
                  )}
                  {repo.topics.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5" aria-label="GitHub topics">
                      {repo.topics.slice(0, 12).map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </div>
                  )}
                  <EmptyState icon={BookOpen} title="No guide yet" className="mt-6">
                    We haven&apos;t written a plain-English install guide for {repo.name} yet. Until a person has
                    reviewed one, this page only shows facts from GitHub. The project&apos;s README on GitHub has
                    the official setup steps.
                  </EmptyState>
                </Card>
              </section>
            )}

            <section id="alternatives" aria-labelledby="alternatives-title" className="scroll-mt-32">
              <SectionTitle id="alternatives-title" kicker="Alternatives">
                Similar AI repositories
              </SectionTitle>
              {related.length ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {related.map((r) => (
                    <RepoCard key={r.slug} repo={r} category={catBySlug.get(r.categorySlugs[0])} />
                  ))}
                </div>
              ) : (
                <EmptyState icon={Layers} title="No close matches yet">
                  We haven&apos;t published similar repositories in this category yet.
                </EmptyState>
              )}
            </section>
          </div>

          {/* Sidebar */}
          <aside className="space-y-5 lg:sticky lg:top-36 lg:self-start" aria-label="Repository details">
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
              <h2 className="eyebrow mb-3">At a glance</h2>
              <dl className="divide-y divide-border text-sm">
                {(content?.facts ?? [
                  repo.kind && { label: "Type", value: KIND_LABEL[repo.kind] },
                  repo.primaryLanguage && { label: "Language", value: repo.primaryLanguage },
                  { label: "License", value: licenseLabel(repo.licenseKey) },
                  repo.difficulty && { label: "Setup", value: DIFFICULTY_LABEL[repo.difficulty] },
                ].filter((f): f is { label: string; value: string } => !!f)).map((f) => (
                  <div key={f.label} className="flex items-center justify-between gap-4 py-2.5">
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className="rounded-md bg-surface-muted px-2 py-0.5 text-right text-[13px] font-medium">{f.value}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="text-[13px] font-medium">{formatDate(repo.createdAtGithub)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-muted-foreground">Open issues</dt>
                  <dd className="text-[13px] font-medium tabular-nums">{repo.openIssues.toLocaleString("en-US")}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">GitHub stats as of {formatDate(repo.statsCheckedAt)}.</p>
            </div>

            {content && (
              <div className="rounded-2xl border border-accent/20 bg-accent-soft/60 p-5">
                <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-medium tracking-[-0.01em]">
                  <Target className="size-5 text-accent" aria-hidden /> Best for
                </h2>
                <ul className="space-y-2 text-sm">
                  {content.bestFor.map((b) => (
                    <li key={b} className="flex gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <a
              href={repo.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-4 rounded-2xl bg-ink p-5 text-ink-foreground shadow-raised transition-opacity hover:opacity-95"
            >
              <GithubIcon className="size-8 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">View on GitHub</span>
                <span className="block truncate text-[13px] opacity-70">{repo.fullName}</span>
              </span>
              <ArrowUpRight className="size-5 opacity-70 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
            </a>

            <div className="rounded-2xl border border-border bg-surface p-5 text-[13px] leading-relaxed text-muted-foreground shadow-card">
              <h2 className="mb-2 text-sm font-semibold text-foreground">Source and attribution</h2>
              <p>
                {repo.name} is built and maintained by{" "}
                <a href={`https://github.com/${repo.owner}`} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
                  {repo.owner}
                </a>{" "}
                and released under the {licenseLabel(repo.licenseKey)} license. AIRepoHub summarizes its public
                documentation and isn&apos;t affiliated with the project.
              </p>
              {content && (
                <>
                  <ul className="mt-3 space-y-1">
                    {content.sourceUrls.map((u) => (
                      <li key={u}>
                        <a href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                          <FileText className="size-3.5" aria-hidden />
                          {u.split("/").pop()}
                        </a>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3">
                    Reviewed {formatDate(content.lastReviewedAt)} against commit{" "}
                    <code className="font-mono text-foreground">{content.sourceCommitSha?.slice(0, 7)}</code>.
                  </p>
                </>
              )}
            </div>

            <AdSlot slot="repo-sidebar" />
          </aside>
        </div>
      </div>
    </div>
  );
}

function ProductSections({
  name,
  content,
  difficulty,
}: {
  name: string;
  content: RepositoryContent;
  difficulty: keyof typeof DIFFICULTY_LABEL | null;
}) {
  const s = content.sixtySeconds;
  const v = VERIFICATION[content.install.verification];
  return (
    <>
      {/* B + C: understand + overview */}
      <section id="overview" aria-labelledby="overview-title" className="scroll-mt-32">
        <Card>
          <SectionTitle id="overview-title" kicker="Overview">
            Understand {name} in 60 seconds
          </SectionTitle>
          <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-sm font-semibold">What it does</dt>
              <dd className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{s.whatItDoes}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold">The problem it solves</dt>
              <dd className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{s.problem}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold">Why choose it</dt>
              <dd className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{s.whyChoose}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold">Who should use it</dt>
              <dd className="mt-2">
                <ul className="space-y-1.5 text-[15px] text-muted-foreground">
                  {s.whoFor.map((w) => (
                    <li key={w} className="flex gap-2">
                      <CircleCheck className="mt-1 size-4 shrink-0 text-success" aria-hidden />
                      {w}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-2 text-sm font-semibold">
                Setup difficulty
                {difficulty && <Badge tone={difficulty === "beginner" ? "success" : difficulty === "intermediate" ? "warning" : "danger"}>{DIFFICULTY_LABEL[difficulty]}</Badge>}
              </dt>
              <dd className="mt-2">
                <p className="mb-1.5 text-sm text-muted-foreground">You&apos;ll need:</p>
                <ul className="space-y-1.5 text-[15px] text-muted-foreground">
                  {s.requirements.map((r) => (
                    <li key={r} className="flex gap-2">
                      <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                      {r}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
          <div className="mt-8 border-t border-border pt-6">
            <h3 className="mb-3 text-lg font-semibold tracking-[-0.015em]">How {name} works</h3>
            <div className="space-y-3 text-[15px] leading-relaxed text-muted-foreground">
              {content.overview.map((p) => (
                <p key={p.slice(0, 24)}>{p}</p>
              ))}
            </div>
          </div>
        </Card>
      </section>

      {/* C: features, strengths, limitations, use cases */}
      <section id="features" aria-labelledby="features-title" className="scroll-mt-32">
        <SectionTitle id="features-title" kicker="Features">
          Key features
        </SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {content.features.map((f) => {
            const Icon = FEATURE_ICONS[f.icon] ?? Layers;
            return (
              <div key={f.title} className="rounded-xl border border-border bg-surface p-5 shadow-card">
                <Icon className="size-6 text-accent" aria-hidden />
                <h3 className="mt-3 text-[15px] font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
            <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
              <span className="grid size-6 place-items-center rounded-md bg-success-soft text-success">
                <Plus className="size-4" aria-hidden />
              </span>
              Strengths
            </h3>
            <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
              {content.strengths.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
            <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
              <span className="grid size-6 place-items-center rounded-md bg-warning-soft text-warning">
                <Minus className="size-4" aria-hidden />
              </span>
              Limitations
            </h3>
            <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
              {content.limitations.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
        <h3 className="mb-3 mt-8 text-lg font-semibold tracking-[-0.015em]">Practical use cases</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {content.useCases.map((u) => (
            <div key={u.title} className="rounded-xl border border-dashed border-border-strong p-4">
              <p className="text-sm font-semibold">{u.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{u.body}</p>
            </div>
          ))}
        </div>
      </section>

      <AdSlot slot="repo-in-content" />

      {/* D: installation */}
      <section id="installation" aria-labelledby="installation-title" className="scroll-mt-32">
        <Card>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <SectionTitle id="installation-title" kicker="Installation">
              Install {name}
            </SectionTitle>
            <Badge tone={v.tone} className="py-1">
              <v.icon aria-hidden /> {v.label}
            </Badge>
          </div>
          <p className="-mt-2 mb-6 text-sm text-muted-foreground">
            {content.install.verificationNote} Steps are as of {formatDate(content.lastReviewedAt)}; projects change often, so if
            a command doesn&apos;t work, check the project&apos;s latest README.{" "}
            <a href={content.install.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
              View source
            </a>
          </p>
          <div className="mb-7 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-surface-muted p-4">
              <p className="eyebrow mb-2">Prerequisites</p>
              <ul className="flex flex-wrap gap-1.5">
                {content.install.prerequisites.map((p) => (
                  <li key={p}>
                    <Badge>{p}</Badge>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl bg-surface-muted p-4">
              <p className="eyebrow mb-2">Supported systems</p>
              <ul className="flex flex-wrap gap-1.5">
                {content.install.supportedOs.map((p) => (
                  <li key={p}>
                    <Badge>{p}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <OsTabs
            panels={content.install.guides.map((g) => ({
              id: g.os,
              label: g.label,
              content: <StepList steps={g.steps} />,
            }))}
          />

          <h3 className="mb-3 mt-10 text-lg font-semibold tracking-[-0.015em]">Configuration and API keys</h3>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Setting</th>
                  <th className="px-4 py-2.5 font-medium">What it&apos;s for</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {content.install.environment.map((e) => (
                  <tr key={e.name} className="align-top">
                    <td className="px-4 py-3">
                      <code className="break-all font-mono text-[13px]">{e.name}</code>
                      <span className="mt-1 block text-xs text-muted-foreground">{e.required ? "Required" : "Optional"}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{e.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mb-4 mt-10 text-lg font-semibold tracking-[-0.015em]">First run</h3>
          <StepList steps={content.install.firstRun} />
          <p className="mt-6 flex gap-2 rounded-xl bg-surface-muted p-4 text-sm text-muted-foreground">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {content.install.expectedOutput ??
              `${name}'s documentation doesn't include sample output, so we don't show any. Expect the results in your terminal.`}
          </p>
        </Card>
      </section>

      {/* E: tutorial */}
      <section id="tutorial" aria-labelledby="tutorial-title" className="scroll-mt-32">
        <Card>
          <SectionTitle id="tutorial-title" kicker="Your first project">
            {content.tutorial.title}
          </SectionTitle>
          <p className="text-[15px] leading-relaxed text-muted-foreground">{content.tutorial.useCase}</p>
          <div className="my-6 rounded-xl bg-surface-muted p-4">
            <p className="eyebrow mb-2">Before you start</p>
            <ul className="space-y-1.5 text-sm">
              {content.tutorial.setup.map((x) => (
                <li key={x} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <StepList steps={content.tutorial.steps} />
          <div className="mt-7 rounded-xl border border-success/30 bg-success-soft/50 p-4">
            <p className="text-sm font-semibold">What to expect</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{content.tutorial.expected}</p>
          </div>
          <h3 className="mb-3 mt-7 text-[15px] font-semibold">Next steps</h3>
          <ul className="space-y-2">
            {content.tutorial.nextSteps.map((n) => {
              const [label, cmd] = n.split(": ");
              return (
                <li key={n} className="text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  {cmd && <CodeBlock code={cmd} className="mt-1.5" />}
                </li>
              );
            })}
          </ul>
        </Card>
      </section>

      {/* F: costs */}
      <section id="costs" aria-labelledby="costs-title" className="scroll-mt-32">
        <SectionTitle id="costs-title" kicker="Costs and requirements">
          What it costs to run
        </SectionTitle>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <dl className="divide-y divide-border">
            {content.costs.map((c) => (
              <div key={c.label} className="grid gap-1 px-5 py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
                <dt className="flex items-center gap-2 text-sm font-semibold">
                  <Wallet className="size-4 text-muted-foreground" aria-hidden />
                  {c.label}
                </dt>
                <dd className="flex items-start justify-between gap-3 text-sm text-muted-foreground">
                  <span>{c.value}</span>
                  {c.tone && (
                    <Badge tone={c.tone === "free" ? "success" : c.tone === "paid" ? "warning" : "muted"} className="shrink-0">
                      {c.tone === "free" ? "Free" : c.tone === "paid" ? "Paid" : "Depends"}
                    </Badge>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* G: troubleshooting */}
      <section id="troubleshooting" aria-labelledby="troubleshooting-title" className="scroll-mt-32">
        <SectionTitle id="troubleshooting-title" kicker="Troubleshooting">
          Common setup issues
        </SectionTitle>
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          {content.troubleshooting.map((t) => (
            <details key={t.problem} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-[15px] font-medium hover:bg-surface-muted/60 [&::-webkit-details-marker]:hidden">
                <LifeBuoy className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex-1">{t.problem}</span>
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
              </summary>
              <div className="px-5 pb-5 pl-12 text-sm leading-relaxed text-muted-foreground">
                <p>{t.solution}</p>
                <p className={cn("mt-2 text-xs", !t.sourceUrl && "italic")}>
                  {t.sourceUrl ? (
                    <a href={t.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
                      Source: {t.sourceUrl.split("/").pop()}
                    </a>
                  ) : (
                    "Based on AIRepoHub's own check."
                  )}
                </p>
              </div>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
