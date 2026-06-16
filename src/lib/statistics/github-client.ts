export type GitHubRepositoryStatistics = {
  repoFullName: string;
  repoUrl: string;
  description: string;
  primaryLanguage: string | null;
  topics: string[];
  pushedAt: Date | null;
  starCount: number;
  commitCount: number;
  pullRequestCount: number;
  issueCount: number;
  commits30d: number;
  pullRequests30d: number;
  issues30d: number;
};

type ClientOptions = {
  token?: string;
  baseUrl?: string;
  now?: () => Date;
};

type RepositoryResponse = {
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  topics: string[];
  pushed_at: string | null;
  stargazers_count: number;
  default_branch: string;
};

const DEFAULT_BASE_URL = 'https://api.github.com';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizeGitHubRepo(value: string): string {
  const trimmed = value.trim();
  let repository = trimmed;

  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw invalidRepositoryError();
    }

    if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase()) || url.search || url.hash) {
      throw invalidRepositoryError();
    }
    repository = url.pathname.replace(/^\/|\/$/g, '');
  } else if (trimmed.includes('://') || trimmed.startsWith('/') || trimmed.endsWith('/')) {
    throw invalidRepositoryError();
  }

  repository = repository.replace(/\.git$/i, '');
  const segments = repository.split('/');
  if (
    segments.length !== 2 ||
    !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(segments[0]) ||
    !/^[a-z\d._-]+$/i.test(segments[1]) ||
    segments[1] === '.' ||
    segments[1] === '..'
  ) {
    throw invalidRepositoryError();
  }

  return repository.toLowerCase();
}

export function createGitHubClient(options: ClientOptions = {}): {
  fetchRepositoryStatistics(repoFullName: string): Promise<GitHubRepositoryStatistics>;
} {
  const token = options.token ?? process.env.GITHUB_TOKEN;
  const baseUrl = (options.baseUrl ?? process.env.GITHUB_API_BASE_URL ?? DEFAULT_BASE_URL).replace(
    /\/+$/,
    '',
  );
  const now = options.now ?? (() => new Date());

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token ?? ''}`,
    'User-Agent': 'projects-community',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  async function requestJson(url: string): Promise<{ data: unknown; response: Response }> {
    if (!token) {
      throw new Error('GITHUB_TOKEN is required to fetch GitHub repository statistics.');
    }

    let response: Response;
    try {
      response = await fetch(url, { headers });
    } catch {
      throw new Error('GitHub API network request failed. Check your connection and try again.');
    }

    if (!response.ok) {
      if (
        (response.status === 403 || response.status === 429) &&
        response.headers.get('X-RateLimit-Remaining') === '0'
      ) {
        const reset = response.headers.get('X-RateLimit-Reset');
        const resetMessage = formatRateLimitReset(reset);
        throw new Error(`GitHub API rate limit exceeded.${resetMessage}`);
      }
      if (response.status === 404) {
        throw new Error('GitHub repository was not found or is inaccessible with the configured token.');
      }
      throw new Error(`GitHub API request failed with status ${response.status}.`);
    }

    try {
      return { data: await response.json(), response };
    } catch {
      throw new Error('GitHub API returned a malformed or non-JSON response.');
    }
  }

  const apiUrl = (path: string, params?: Record<string, string>) => {
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  };

  async function countList(url: string): Promise<number> {
    let count = 0;
    let nextUrl: string | undefined = url;
    const visited = new Set<string>();

    while (nextUrl && !visited.has(nextUrl)) {
      visited.add(nextUrl);
      const { data, response } = await requestJson(nextUrl);
      if (!Array.isArray(data)) {
        throw new Error('GitHub API returned a malformed list response.');
      }

      count += data.length;
      if (data.length === 0) return count;

      if (visited.size === 1) {
        const lastPage = linkPage(response.headers.get('Link'), 'last');
        if (lastPage !== undefined) return lastPage;
      }

      nextUrl = linkUrl(response.headers.get('Link'), 'next');
    }

    return count;
  }

  async function countNonPullRequestIssues(url: string): Promise<number> {
    let count = 0;
    let nextUrl: string | undefined = url;
    const visited = new Set<string>();

    while (nextUrl && !visited.has(nextUrl)) {
      visited.add(nextUrl);
      const { data, response } = await requestJson(nextUrl);
      if (!Array.isArray(data) || !data.every(isRecord)) {
        throw new Error('GitHub API returned a malformed issue list response.');
      }
      count += data.filter((issue) => !issue.pull_request).length;
      nextUrl = linkUrl(response.headers.get('Link'), 'next');
    }

    return count;
  }

  async function countSearch(url: string): Promise<number> {
    const { data } = await requestJson(url);
    if (!isRecord(data) || !Number.isSafeInteger(data.total_count) || (data.total_count as number) < 0) {
      throw new Error('GitHub API returned a malformed search response.');
    }
    return data.total_count as number;
  }

  return {
    async fetchRepositoryStatistics(value: string): Promise<GitHubRepositoryStatistics> {
      if (!token) {
        throw new Error('GITHUB_TOKEN is required to fetch GitHub repository statistics.');
      }

      const repository = normalizeGitHubRepo(value);
      const { data } = await requestJson(apiUrl(`/repos/${repository}`));
      const metadata = parseRepository(data);
      const cutoff = new Date(now().getTime() - THIRTY_DAYS_MS).toISOString();

      const [
        commitCount,
        pullRequestCount,
        issueCount,
        commits30d,
        pullRequests30d,
        issues30d,
      ] = await Promise.all([
        countList(
          apiUrl(`/repos/${repository}/commits`, { sha: metadata.default_branch, per_page: '1' }),
        ),
        countList(apiUrl(`/repos/${repository}/pulls`, { state: 'all', per_page: '1' })),
        countNonPullRequestIssues(
          apiUrl(`/repos/${repository}/issues`, { state: 'all', per_page: '100' }),
        ),
        countList(
          apiUrl(`/repos/${repository}/commits`, {
            sha: metadata.default_branch,
            since: cutoff,
            per_page: '1',
          }),
        ),
        countSearch(
          apiUrl('/search/issues', {
            q: `repo:${repository} is:pr created:>=${cutoff}`,
            per_page: '1',
          }),
        ),
        countSearch(
          apiUrl('/search/issues', {
            q: `repo:${repository} is:issue created:>=${cutoff}`,
            per_page: '1',
          }),
        ),
      ]);

      return {
        repoFullName: metadata.full_name,
        repoUrl: metadata.html_url,
        description: metadata.description ?? '',
        primaryLanguage: metadata.language,
        topics: metadata.topics,
        pushedAt: metadata.pushed_at ? new Date(metadata.pushed_at) : null,
        starCount: metadata.stargazers_count,
        commitCount,
        pullRequestCount,
        issueCount,
        commits30d,
        pullRequests30d,
        issues30d,
      };
    },
  };
}

function invalidRepositoryError(): Error {
  return new Error('GitHub repository must be an owner/repo value or standard github.com URL.');
}

function linkUrl(header: string | null, relation: string): string | undefined {
  for (const part of header?.split(',') ?? []) {
    const match = part.match(/^\s*<([^>]+)>;\s*rel="([^"]+)"\s*$/);
    if (match?.[2].split(' ').includes(relation)) return match[1];
  }
  return undefined;
}

function linkPage(header: string | null, relation: string): number | undefined {
  const url = linkUrl(header, relation);
  if (!url) return undefined;

  try {
    const page = Number(new URL(url).searchParams.get('page'));
    return Number.isSafeInteger(page) && page >= 1 ? page : undefined;
  } catch {
    return undefined;
  }
}

function formatRateLimitReset(reset: string | null): string {
  if (!reset) return '';

  const resetDate = new Date(Number(reset) * 1000);
  return Number.isFinite(resetDate.getTime()) ? ` Reset time: ${resetDate.toISOString()}.` : '';
}

function parseRepository(data: unknown): RepositoryResponse {
  if (
    !isRecord(data) ||
    typeof data.full_name !== 'string' ||
    typeof data.html_url !== 'string' ||
    !(typeof data.description === 'string' || data.description === null) ||
    !(typeof data.language === 'string' || data.language === null) ||
    !Array.isArray(data.topics) ||
    !data.topics.every((topic) => typeof topic === 'string') ||
    !(typeof data.pushed_at === 'string' || data.pushed_at === null) ||
    typeof data.stargazers_count !== 'number' ||
    typeof data.default_branch !== 'string'
  ) {
    throw new Error('GitHub API returned malformed repository metadata.');
  }
  return data as RepositoryResponse;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
