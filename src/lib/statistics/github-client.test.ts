import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGitHubClient, normalizeGitHubRepo } from './github-client';

const jsonResponse = (
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });

const metadata = {
  full_name: 'Owner/Repo',
  html_url: 'https://github.com/Owner/Repo',
  description: 'Repository description',
  language: 'TypeScript',
  topics: ['community', 'tooling'],
  pushed_at: '2026-06-14T12:00:00Z',
  stargazers_count: 8,
  default_branch: 'main',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('normalizeGitHubRepo', () => {
  it.each([
    [' Owner/Repo ', 'owner/repo'],
    ['https://github.com/Owner/Repo', 'owner/repo'],
    ['http://github.com/Owner/Repo.git/', 'owner/repo'],
    ['https://www.github.com/Owner/Repo/', 'owner/repo'],
  ])('normalizes %s', (value, expected) => {
    expect(normalizeGitHubRepo(value)).toBe(expected);
  });

  it.each([
    '',
    'owner',
    '/owner/repo',
    'owner/repo/extra',
    'https://github.com/owner',
    'https://github.com/owner/repo/issues',
    'https://example.com/owner/repo',
    'git@github.com:owner/repo.git',
  ])('rejects malformed repository value %s', (value) => {
    expect(() => normalizeGitHubRepo(value)).toThrow(/GitHub repository/i);
  });
});

describe('createGitHubClient', () => {
  it('aggregates metadata and cumulative and recent counts with the exact cutoff', async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        requestedUrls.push(url);
        const parsed = new URL(url);

        if (parsed.pathname === '/repos/owner/repo' && !parsed.search) {
          return jsonResponse(metadata);
        }
        if (parsed.pathname === '/repos/owner/repo/commits' && parsed.searchParams.has('since')) {
          return jsonResponse([{}], {
            headers: {
              Link: '<https://github.test/repos/owner/repo/commits?page=5>; rel="last"',
            },
          });
        }
        if (parsed.pathname === '/repos/owner/repo/commits') {
          return jsonResponse([{}], {
            headers: {
              Link: '<https://github.test/repos/owner/repo/commits?page=41>; rel="last"',
            },
          });
        }
        if (parsed.pathname === '/repos/owner/repo/pulls') {
          return jsonResponse([{}], {
            headers: {
              Link: '<https://github.test/repos/owner/repo/pulls?page=12>; rel="last"',
            },
          });
        }
        if (parsed.pathname === '/repos/owner/repo/issues') {
          return jsonResponse([
            { number: 1 },
            { number: 2, pull_request: { url: 'https://github.test/pulls/2' } },
            { number: 3 },
            { number: 4 },
            { number: 5 },
            { number: 6 },
            { number: 7 },
            { number: 8 },
          ]);
        }
        if (parsed.pathname === '/search/issues') {
          return jsonResponse({ total_count: parsed.searchParams.get('q')?.includes('is:pr') ? 2 : 3 });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }),
    );

    const client = createGitHubClient({
      token: 'test-token',
      baseUrl: 'https://github.test/',
      now: () => new Date('2026-06-15T00:00:00.000Z'),
    });

    await expect(client.fetchRepositoryStatistics('Owner/Repo')).resolves.toEqual({
      repoFullName: 'Owner/Repo',
      repoUrl: 'https://github.com/Owner/Repo',
      description: 'Repository description',
      primaryLanguage: 'TypeScript',
      topics: ['community', 'tooling'],
      pushedAt: new Date('2026-06-14T12:00:00Z'),
      starCount: 8,
      commitCount: 41,
      pullRequestCount: 12,
      issueCount: 7,
      commits30d: 5,
      pullRequests30d: 2,
      issues30d: 3,
    });

    const recentCommitUrl = requestedUrls.find(
      (url) => url.includes('/commits?') && url.includes('since='),
    );
    expect(new URL(recentCommitUrl!).searchParams.get('since')).toBe('2026-05-16T00:00:00.000Z');
    expect(requestedUrls.some((url) => url.includes('sha=main'))).toBe(true);
    expect(requestedUrls.some((url) => url.includes('state=all'))).toBe(true);
    expect(requestedUrls.some((url) => url.includes('is%3Apr'))).toBe(true);
    expect(requestedUrls.some((url) => url.includes('is%3Aissue'))).toBe(true);
  });

  it.each([
    [[], undefined, 0],
    [[{}], undefined, 1],
    [
      [{}],
      '<https://github.test/repos/owner/repo/commits?per_page=1&page=2>; rel="next", <https://github.test/repos/owner/repo/commits?per_page=1&page=17>; rel="last"',
      17,
    ],
  ] as const)('counts list responses using Link metadata when available', async (body, link, expected) => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === '/repos/owner/repo') return jsonResponse(metadata);
      if (url.pathname === '/repos/owner/repo/commits') {
        return jsonResponse(body, { headers: link ? { Link: link } : undefined });
      }
      if (url.pathname === '/repos/owner/repo/pulls') return jsonResponse([]);
      if (url.pathname === '/repos/owner/repo/issues') return jsonResponse([]);
      if (url.pathname === '/search/issues') return jsonResponse({ total_count: 0 });
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await createGitHubClient({ token: 'token', baseUrl: 'https://github.test' })
      .fetchRepositoryStatistics('owner/repo');

    expect(result.commitCount).toBe(expected);
    expect(result.commits30d).toBe(expected);
  });

  it('follows issue pages and excludes pull request records', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        if (url.pathname === '/repos/owner/repo') return jsonResponse(metadata);
        if (url.pathname === '/repos/owner/repo/commits') return jsonResponse([]);
        if (url.pathname === '/repos/owner/repo/pulls') return jsonResponse([]);
        if (url.pathname === '/search/issues') return jsonResponse({ total_count: 0 });
        if (url.pathname === '/repos/owner/repo/issues' && url.searchParams.get('page') === '2') {
          return jsonResponse([{ number: 3 }, { number: 4, pull_request: {} }]);
        }
        if (url.pathname === '/repos/owner/repo/issues') {
          return jsonResponse([{ number: 1 }, { number: 2, pull_request: {} }], {
            headers: {
              Link: '<https://github.test/repos/owner/repo/issues?state=all&per_page=100&page=2>; rel="next", <https://github.test/repos/owner/repo/issues?state=all&per_page=100&page=2>; rel="last"',
            },
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }),
    );

    const result = await createGitHubClient({ token: 'token', baseUrl: 'https://github.test' })
      .fetchRepositoryStatistics('owner/repo');

    expect(result.issueCount).toBe(2);
  });

  it('sends required headers and uses configured base URL', async () => {
    const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return jsonResponse(metadata);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createGitHubClient({ token: 'secret', baseUrl: 'https://fixture.test/api/' })
        .fetchRepositoryStatistics('owner/repo'),
    ).rejects.toThrow();

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://fixture.test/api/repos/owner/repo');
    expect(init?.headers).toMatchObject({
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer secret',
      'User-Agent': 'projects-community',
      'X-GitHub-Api-Version': '2022-11-28',
    });
  });

  it('fails before fetch when GITHUB_TOKEN is missing', async () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(createGitHubClient().fetchRepositoryStatistics('owner/repo')).rejects.toThrow(
      /GITHUB_TOKEN/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports inaccessible or missing repositories', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'Not Found' }, { status: 404 })));

    await expect(
      createGitHubClient({ token: 'secret' }).fetchRepositoryStatistics('owner/repo'),
    ).rejects.toThrow(/inaccessible|not found/i);
  });

  it('reports malformed and non-JSON responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not json', { headers: { 'Content-Type': 'text/plain' } })),
    );

    await expect(
      createGitHubClient({ token: 'secret' }).fetchRepositoryStatistics('owner/repo'),
    ).rejects.toThrow(/malformed|JSON/i);
  });

  it('reports network errors without leaking the token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('socket closed secret-token'))));

    const error = await createGitHubClient({ token: 'secret-token' })
      .fetchRepositoryStatistics('owner/repo')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/network/i);
    expect((error as Error).message).not.toContain('secret-token');
  });

  it('reports rate-limit reset time without leaking the token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { message: 'API rate limit exceeded for secret-token' },
          {
            status: 403,
            headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1781481600' },
          },
        ),
      ),
    );

    const error = await createGitHubClient({ token: 'secret-token' })
      .fetchRepositoryStatistics('owner/repo')
      .catch((caught: unknown) => caught);

    expect((error as Error).message).toMatch(/rate limit/i);
    expect((error as Error).message).toContain(new Date(1781481600 * 1000).toISOString());
    expect((error as Error).message).not.toContain('secret-token');
  });
});
