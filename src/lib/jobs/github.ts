// Minimal GitHub REST client for the scheduled jobs. Counts API calls (logged in automation_runs)
// and stops before exhausting the rate limit instead of failing half-way.

export interface GithubRepo {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string; avatar_url: string };
  html_url: string;
  homepage: string | null;
  description: string | null;
  language: string | null;
  license: { spdx_id: string | null } | null;
  topics?: string[];
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  archived: boolean;
  fork: boolean;
  disabled?: boolean;
  default_branch: string;
  created_at: string;
  updated_at: string;
  pushed_at: string | null;
}

export class RateLimitError extends Error {}

export interface GithubApi {
  calls: number;
  getRepoById(id: number): Promise<GithubRepo | null>;
  searchRepos(query: string, perPage?: number): Promise<GithubRepo[]>;
}

export class GithubClient implements GithubApi {
  calls = 0;
  private token: string | undefined;
  private fetchImpl: typeof fetch;
  private minRemaining: number;
  // No TypeScript parameter properties: these files run under Node's type stripping.
  constructor(token: string | undefined, fetchImpl: typeof fetch = fetch, minRemaining = 20) {
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.minRemaining = minRemaining;
  }

  private async get<T>(path: string): Promise<{ status: number; body: T | null }> {
    this.calls++;
    const res = await this.fetchImpl(`https://api.github.com${path}`, {
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "airepohub-jobs",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
    });
    const remainingHeader = res.headers.get("x-ratelimit-remaining");
    const remaining = remainingHeader === null ? Infinity : Number(remainingHeader);
    if (res.status === 429 || (res.status === 403 && (remaining === 0 || res.headers.has("retry-after")))) {
      throw new RateLimitError(`GitHub rate limit hit on ${path} (${res.status})`);
    }
    if (res.status === 404 || res.status === 451) return { status: res.status, body: null };
    if (!res.ok) throw new Error(`GitHub ${path}: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as T;
    if (remaining < this.minRemaining) throw new RateLimitError(`GitHub rate limit nearly used (${remaining} left)`);
    return { status: res.status, body };
  }

  /** By numeric id, so renamed or transferred repos still resolve. Null when deleted or hidden. */
  async getRepoById(id: number): Promise<GithubRepo | null> {
    return (await this.get<GithubRepo>(`/repositories/${id}`)).body;
  }

  async searchRepos(query: string, perPage = 50): Promise<GithubRepo[]> {
    const q = encodeURIComponent(query);
    const res = await this.get<{ items: GithubRepo[] }>(`/search/repositories?q=${q}&sort=stars&order=desc&per_page=${perPage}`);
    return res.body?.items ?? [];
  }
}
