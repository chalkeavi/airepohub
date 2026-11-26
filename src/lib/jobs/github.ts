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

export interface SearchPage {
  total: number;
  items: GithubRepo[];
}

/** owner/name pair used for batched GraphQL lookups. */
export interface RepoRef {
  githubId: number;
  fullName: string;
}

export class RateLimitError extends Error {}

export interface GithubApi {
  calls: number;
  getRepoById(id: number): Promise<GithubRepo | null>;
  searchRepos(query: string, perPage?: number): Promise<GithubRepo[]>;
  /** One page of a search (GitHub caps every query at 1,000 results). Optional: only the import job uses it. */
  searchPage?(query: string, page: number, perPage?: number): Promise<SearchPage>;
  /**
   * Many repos in one GraphQL call, keyed by GitHub id. A repo missing from the result
   * (deleted, renamed to a reused name, hidden) should be looked up with getRepoById.
   */
  getReposBatch?(refs: RepoRef[]): Promise<Map<number, GithubRepo>>;
  /** Current commit SHA of a branch. Optional: only the writer job uses it. */
  getHeadSha?(fullName: string, branch: string): Promise<string | null>;
  /** The repo's README at a commit (text and path). Null when there is none. */
  getReadme?(fullName: string, ref: string): Promise<{ path: string; text: string } | null>;
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

  private headers(): Record<string, string> {
    return {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "airepohub-jobs",
      ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
    };
  }

  private async get<T>(path: string): Promise<{ status: number; body: T | null }> {
    this.calls++;
    const res = await this.fetchImpl(`https://api.github.com${path}`, { headers: this.headers() });
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

  async searchPage(query: string, page: number, perPage = 100): Promise<SearchPage> {
    const q = encodeURIComponent(query);
    const res = await this.get<{ total_count: number; items: GithubRepo[] }>(
      `/search/repositories?q=${q}&sort=stars&order=desc&per_page=${perPage}&page=${page}`,
    );
    return { total: res.body?.total_count ?? 0, items: res.body?.items ?? [] };
  }

  async getHeadSha(fullName: string, branch: string): Promise<string | null> {
    const res = await this.get<{ sha: string }>(`/repos/${fullName}/commits/${encodeURIComponent(branch)}`);
    return res.body?.sha ?? null;
  }

  async getReadme(fullName: string, ref: string): Promise<{ path: string; text: string } | null> {
    const res = await this.get<{ path: string; content: string; encoding: string }>(`/repos/${fullName}/readme?ref=${encodeURIComponent(ref)}`);
    if (!res.body || res.body.encoding !== "base64") return null;
    return { path: res.body.path, text: Buffer.from(res.body.content, "base64").toString("utf8") };
  }

  async getReposBatch(refs: RepoRef[]): Promise<Map<number, GithubRepo>> {
    const out = new Map<number, GithubRepo>();
    if (!refs.length) return out;
    if (!this.token) return out; // GraphQL needs a token; callers fall back to REST
    const parts = refs.map((r, i) => {
      const [owner, name] = r.fullName.split("/");
      return `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ...F }`;
    });
    const query = `query { ${parts.join("\n")} }\n${GRAPHQL_FIELDS}`;
    this.calls++;
    const res = await this.fetchImpl("https://api.github.com/graphql", {
      method: "POST",
      headers: { ...this.headers(), "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (res.status === 429 || (res.status === 403 && (res.headers.get("x-ratelimit-remaining") === "0" || res.headers.has("retry-after")))) {
      throw new RateLimitError(`GitHub GraphQL rate limit (${res.status})`);
    }
    if (!res.ok) throw new Error(`GitHub GraphQL: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { data?: Record<string, GraphqlRepo | null> | null; errors?: { type?: string; message: string }[] };
    if (body.errors?.some((e) => e.type === "RATE_LIMITED")) throw new RateLimitError("GitHub GraphQL rate limit");
    if (!body.data) throw new Error(`GitHub GraphQL: ${body.errors?.map((e) => e.message).join("; ") ?? "no data"}`);
    for (const node of Object.values(body.data)) {
      if (node) out.set(node.databaseId, fromGraphql(node));
    }
    return out;
  }
}

const GRAPHQL_FIELDS = `fragment F on Repository {
  databaseId name nameWithOwner url homepageUrl description isArchived isFork isDisabled
  owner { login avatarUrl } primaryLanguage { name } licenseInfo { spdxId }
  repositoryTopics(first: 20) { nodes { topic { name } } }
  stargazerCount forkCount issues(states: OPEN) { totalCount } pullRequests(states: OPEN) { totalCount }
  defaultBranchRef { name } createdAt updatedAt pushedAt
}`;

interface GraphqlRepo {
  databaseId: number;
  name: string;
  nameWithOwner: string;
  url: string;
  homepageUrl: string | null;
  description: string | null;
  isArchived: boolean;
  isFork: boolean;
  isDisabled: boolean;
  owner: { login: string; avatarUrl: string };
  primaryLanguage: { name: string } | null;
  licenseInfo: { spdxId: string | null } | null;
  repositoryTopics: { nodes: { topic: { name: string } }[] };
  stargazerCount: number;
  forkCount: number;
  issues: { totalCount: number };
  pullRequests: { totalCount: number };
  defaultBranchRef: { name: string } | null;
  createdAt: string;
  updatedAt: string;
  pushedAt: string | null;
}

/** GraphQL → REST shape. open_issues matches REST's open_issues_count (issues + pull requests). */
export function fromGraphql(n: GraphqlRepo): GithubRepo {
  return {
    id: n.databaseId,
    full_name: n.nameWithOwner,
    name: n.name,
    owner: { login: n.owner.login, avatar_url: n.owner.avatarUrl },
    html_url: n.url,
    homepage: n.homepageUrl || null,
    description: n.description,
    language: n.primaryLanguage?.name ?? null,
    license: n.licenseInfo ? { spdx_id: n.licenseInfo.spdxId } : null,
    topics: n.repositoryTopics.nodes.map((t) => t.topic.name),
    stargazers_count: n.stargazerCount,
    forks_count: n.forkCount,
    open_issues_count: n.issues.totalCount + n.pullRequests.totalCount,
    archived: n.isArchived,
    fork: n.isFork,
    disabled: n.isDisabled,
    default_branch: n.defaultBranchRef?.name ?? "main",
    created_at: n.createdAt,
    updated_at: n.updatedAt,
    pushed_at: n.pushedAt,
  };
}
