// Domain types. Mirror supabase/migrations (snake_case there, camelCase here).

export type RepoStatus = "draft" | "in_review" | "published" | "rejected" | "archived";
export type Difficulty = "beginner" | "intermediate" | "advanced";
export type RepoKind = "app" | "cli" | "library" | "framework" | "platform" | "model" | "extension";
export type OsTarget = "all" | "windows" | "macos" | "linux";
export type VerificationStatus = "verified" | "official_docs" | "awaiting_verification";
export type RankingPeriod = "weekly" | "monthly" | "all_time";
export type ActivityStatus = "active" | "slowing" | "inactive" | "archived";

export interface Category {
  slug: string;
  name: string;
  description: string;
  icon: string; // lucide icon name, resolved in components/repo/category-icon.tsx
}

export interface Repository {
  id: string;
  githubId: number;
  owner: string;
  name: string;
  fullName: string;
  slug: string;
  githubUrl: string;
  homepageUrl: string | null;
  description: string | null;
  summary: string | null;
  kind: RepoKind | null;
  primaryLanguage: string | null;
  licenseKey: string | null;
  topics: string[];
  stars: number;
  forks: number;
  openIssues: number;
  avatarUrl: string | null;
  isArchived: boolean;
  createdAtGithub: string | null;
  updatedAtGithub: string | null;
  lastPushedAt: string | null;
  statsCheckedAt: string | null;
  publishedAt: string | null;
  status: RepoStatus;
  difficulty: Difficulty | null;
  featured: boolean;
  categorySlugs: string[];
  /** true when approved product-page content exists (sections B–G) */
  hasFullContent: boolean;
}

export interface CodeStep {
  title: string;
  body?: string;
  code?: string;
  lang?: "bash" | "powershell" | "text";
}

export interface InstallationGuide {
  os: OsTarget;
  label: string;
  method: string;
  steps: CodeStep[];
}

export interface RepositoryContent {
  sourceUrls: string[];
  sourceCommitSha: string | null;
  lastReviewedAt: string;
  heroCommands: { comment?: string; command: string }[];
  sixtySeconds: {
    whatItDoes: string;
    problem: string;
    whoFor: string[];
    whyChoose: string;
    requirements: string[];
  };
  overview: string[];
  features: { title: string; body: string; icon: string }[];
  strengths: string[];
  limitations: string[];
  useCases: { title: string; body: string }[];
  install: {
    verification: VerificationStatus;
    verificationNote: string;
    sourceUrl: string;
    prerequisites: string[];
    supportedOs: string[];
    guides: InstallationGuide[];
    environment: { name: string; required: boolean; description: string }[];
    firstRun: CodeStep[];
    expectedOutput: string | null;
  };
  tutorial: {
    title: string;
    useCase: string;
    setup: string[];
    steps: CodeStep[];
    expected: string;
    nextSteps: string[];
    sourceUrl: string;
  };
  costs: { label: string; value: string; tone?: "free" | "paid" | "depends" }[];
  troubleshooting: { problem: string; solution: string; sourceUrl?: string }[];
  bestFor: string[];
  facts: { label: string; value: string }[];
}

export interface LeaderboardEntry {
  rank: number;
  repository: Repository;
  score: number;
  /** stars gained in the window; null when no snapshot history exists */
  starGrowth: number | null;
  /** previous rank − current rank; null when no previous snapshot exists */
  movement: number | null;
}

export interface Leaderboard {
  period: RankingPeriod;
  categorySlug: string | null;
  calculatedAt: string | null;
  signalsUsed: string[];
  entries: LeaderboardEntry[];
  /** why the board is empty, when it is */
  emptyReason: string | null;
}
