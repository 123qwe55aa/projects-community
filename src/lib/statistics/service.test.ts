import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase } from '@/db';
import {
  decisions,
  githubStatisticsSnapshots,
  projectStatistics,
  projects,
} from '@/db/schema';
import { createTestDatabase } from '@/test/db';
import {
  bindRepository,
  createProjectFromGitHub,
  setManualProjectType,
  synchronizeAllProjectStatistics,
  synchronizeProjectStatistics,
  type StatisticsDependencies,
} from './service';
import type { GitHubRepositoryStatistics } from './github-client';

type Harness = ReturnType<typeof createTestDatabase>;

const fixedNow = new Date('2026-06-16T10:00:00.000Z');

describe('statistics service', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createTestDatabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    harness.cleanup();
  });

  it('bindRepository normalizes repositories and rejects duplicate case variants', async () => {
    insertProject('project-1');
    insertProject('project-2');

    await bindRepository({ projectId: 'project-1', repoFullName: ' HTTPS://github.com/Owner/Repo.git/ ' });

    expect(statisticsFor('project-1')?.githubRepoFullName).toBe('owner/repo');
    expect(snapshots()).toHaveLength(0);
    await expect(
      bindRepository({ projectId: 'project-2', repoFullName: 'OWNER/REPO' }),
    ).rejects.toThrow(/already bound/i);
  });

  it('setManualProjectType sets, clears, and rejects invalid manual types', async () => {
    insertProject('project-1');
    await bindRepository({ projectId: 'project-1', repoFullName: 'owner/repo' });

    await setManualProjectType({ projectId: 'project-1', manualType: 'library' });
    expect(statisticsFor('project-1')?.manualType).toBe('library');

    await setManualProjectType({ projectId: 'project-1', manualType: null });
    expect(statisticsFor('project-1')?.manualType).toBeNull();

    await expect(
      setManualProjectType({ projectId: 'project-1', manualType: 'website' as never }),
    ).rejects.toThrow(/invalid project type/i);
  });

  it('synchronizeProjectStatistics writes config, snapshot, activity score, inferred type, and preserves manual type', async () => {
    insertProject('project-1');
    await bindRepository({ projectId: 'project-1', repoFullName: 'owner/repo' });
    await setManualProjectType({ projectId: 'project-1', manualType: 'library' });

    const result = await synchronizeProjectStatistics('project-1', {
      now: () => fixedNow,
      githubClient: clientReturning(statistics({ topics: ['cli'], primaryLanguage: 'Shell' })),
    });

    expect(result).toMatchObject({
      projectId: 'project-1',
      repoFullName: 'owner/repo',
      ok: true,
      error: null,
    });
    expect(statisticsFor('project-1')).toMatchObject({
      githubRepoFullName: 'owner/repo',
      inferredType: 'tooling',
      manualType: 'library',
      lastAttemptedAt: fixedNow,
      lastSuccessfulAt: fixedNow,
      lastError: null,
    });
    expect(snapshotFor('project-1')).toMatchObject({
      repoFullName: 'Owner/Repo',
      repoUrl: 'https://github.com/Owner/Repo',
      primaryLanguage: 'Shell',
      topics: JSON.stringify(['cli']),
      commitCount: 12,
      pullRequestCount: 3,
      issueCount: 5,
      starCount: 8,
      commits30d: 4,
      pullRequests30d: 2,
      issues30d: 1,
      activityScore30d: 11,
      updatedAt: fixedNow,
    });
  });

  it('synchronizeProjectStatistics preserves prior metrics and lastSuccessfulAt while recording fetch failures', async () => {
    insertProject('project-1');
    await bindRepository({ projectId: 'project-1', repoFullName: 'owner/repo' });
    const firstSuccess = new Date('2026-06-15T10:00:00.000Z');
    await synchronizeProjectStatistics('project-1', {
      now: () => firstSuccess,
      githubClient: clientReturning(statistics({ commitCount: 20 })),
    });

    const result = await synchronizeProjectStatistics('project-1', {
      now: () => fixedNow,
      githubClient: clientFailing('GitHub unavailable'),
    });

    expect(result).toMatchObject({
      projectId: 'project-1',
      repoFullName: 'owner/repo',
      ok: false,
      error: 'GitHub unavailable',
    });
    expect(statisticsFor('project-1')).toMatchObject({
      lastAttemptedAt: fixedNow,
      lastSuccessfulAt: firstSuccess,
      lastError: 'GitHub unavailable',
    });
    expect(snapshotFor('project-1')).toMatchObject({
      commitCount: 20,
      updatedAt: firstSuccess,
    });
  });

  it('records first sync failure in config without creating a fake snapshot', async () => {
    insertProject('project-1');
    await bindRepository({ projectId: 'project-1', repoFullName: 'owner/repo' });

    const result = await synchronizeProjectStatistics('project-1', {
      now: () => fixedNow,
      githubClient: clientFailing('rate limited'),
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'rate limited',
      repoFullName: 'owner/repo',
    });
    expect(statisticsFor('project-1')).toMatchObject({
      lastAttemptedAt: fixedNow,
      lastSuccessfulAt: null,
      lastError: 'rate limited',
    });
    expect(snapshots()).toHaveLength(0);
  });

  it('synchronizeAllProjectStatistics continues sequentially after a project fails', async () => {
    insertProject('project-1');
    insertProject('project-2');
    insertProject('project-3');
    await bindRepository({ projectId: 'project-1', repoFullName: 'owner/one' });
    await bindRepository({ projectId: 'project-2', repoFullName: 'owner/two' });
    await bindRepository({ projectId: 'project-3', repoFullName: 'owner/three' });
    const calls: string[] = [];
    const client: StatisticsDependencies['githubClient'] = {
      async fetchRepositoryStatistics(repoFullName) {
        calls.push(repoFullName);
        if (repoFullName === 'owner/two') throw new Error('repo two failed');
        return statistics({ repoFullName });
      },
    };

    const results = await synchronizeAllProjectStatistics({ now: () => fixedNow, githubClient: client });

    expect(calls).toEqual(['owner/one', 'owner/two', 'owner/three']);
    expect(results.map((result) => [result.projectId, result.ok, result.error])).toEqual([
      ['project-1', true, null],
      ['project-2', false, 'repo two failed'],
      ['project-3', true, null],
    ]);
    expect(snapshotFor('project-1')).toBeDefined();
    expect(snapshotFor('project-3')).toBeDefined();
  });

  it('bindRepository on an existing project changes no project fields and no unrelated-record counts', async () => {
    insertProject('project-1', {
      summary: 'Original summary',
      background: 'Original background',
      deployUrl: 'https://example.com',
    });
    const { db } = getDatabase();
    db.insert(decisions).values({
      id: 'decision-1',
      question: 'Keep this?',
      state: 'researching',
      scope: 'project',
      projectId: 'project-1',
    }).run();
    const projectBefore = projectFor('project-1');
    const countsBefore = relatedCounts();

    await bindRepository({ projectId: 'project-1', repoFullName: 'owner/repo' });

    expect(projectFor('project-1')).toEqual(projectBefore);
    expect(relatedCounts()).toEqual({
      ...countsBefore,
      projectStatistics: countsBefore.projectStatistics + 1,
    });
    expect(statisticsFor('project-1')?.githubRepoFullName).toBe('owner/repo');
  });

  it('createProjectFromGitHub creates a project and binding atomically and rejects duplicate repos without an orphan project', async () => {
    const beforeProjectCount = allProjects().length;
    const created = await createProjectFromGitHub({
      repoFullName: 'Owner/Repo',
      metadata: {
        description: 'A useful repository',
        topics: ['cli', 'typescript'],
        language: 'TypeScript',
        readmeText: 'README '.repeat(600),
        homepage: 'https://owner.example/repo',
        avatarUrl: 'https://avatars.example/owner.png',
      },
    });

    const project = projectFor(created.projectId);
    expect(project).toMatchObject({
      summary: 'A useful repository',
      deployUrl: 'https://owner.example/repo',
      buildingStyle: 'studio',
      growthStage: 'seed',
      visibility: 'private',
      imageUrl: 'https://avatars.example/owner.png',
    });
    expect(project?.background).toContain('[GitHub] owner/repo');
    expect(project?.background).toContain('A useful repository');
    expect(project?.background).toContain('Topics: cli, typescript');
    expect(project?.background?.length).toBeLessThanOrEqual(5000);
    expect(statisticsFor(created.projectId)?.githubRepoFullName).toBe('owner/repo');

    await expect(
      createProjectFromGitHub({
        repoFullName: 'OWNER/REPO',
        metadata: { description: 'Duplicate', topics: [], language: '' },
      }),
    ).rejects.toThrow(/already bound/i);
    expect(allProjects()).toHaveLength(beforeProjectCount + 1);
  });
});

function insertProject(
  id: string,
  values: Partial<typeof projects.$inferInsert> = {},
) {
  const { db } = getDatabase();
  db.insert(projects).values({
    id,
    summary: values.summary ?? id,
    background: values.background ?? `${id} background`,
    deployUrl: values.deployUrl ?? null,
    buildingStyle: values.buildingStyle ?? 'workshop',
    growthStage: values.growthStage ?? 'seed',
    visibility: values.visibility ?? 'private',
  }).run();
}

function projectFor(projectId: string) {
  const { db } = getDatabase();
  return db.select().from(projects).where(eq(projects.id, projectId)).get();
}

function allProjects() {
  const { db } = getDatabase();
  return db.select().from(projects).all();
}

function statisticsFor(projectId: string) {
  const { db } = getDatabase();
  return db.select().from(projectStatistics).where(eq(projectStatistics.projectId, projectId)).get();
}

function snapshotFor(projectId: string) {
  const { db } = getDatabase();
  return db
    .select()
    .from(githubStatisticsSnapshots)
    .where(eq(githubStatisticsSnapshots.projectId, projectId))
    .get();
}

function snapshots() {
  const { db } = getDatabase();
  return db.select().from(githubStatisticsSnapshots).all();
}

function relatedCounts() {
  const { sqlite } = getDatabase();
  return {
    decisions: (sqlite.prepare('select count(*) as count from decisions').get() as { count: number }).count,
    projectStatistics: (
      sqlite.prepare('select count(*) as count from project_statistics').get() as { count: number }
    ).count,
    snapshots: (
      sqlite.prepare('select count(*) as count from github_statistics_snapshots').get() as { count: number }
    ).count,
  };
}

function clientReturning(
  result: GitHubRepositoryStatistics,
): NonNullable<StatisticsDependencies['githubClient']> {
  return {
    async fetchRepositoryStatistics() {
      return result;
    },
  };
}

function clientFailing(message: string): NonNullable<StatisticsDependencies['githubClient']> {
  return {
    async fetchRepositoryStatistics() {
      throw new Error(message);
    },
  };
}

function statistics(overrides: Partial<GitHubRepositoryStatistics> = {}): GitHubRepositoryStatistics {
  return {
    repoFullName: 'Owner/Repo',
    repoUrl: 'https://github.com/Owner/Repo',
    description: 'Repository description',
    primaryLanguage: 'TypeScript',
    topics: ['web-app'],
    pushedAt: new Date('2026-06-15T12:00:00.000Z'),
    starCount: 8,
    commitCount: 12,
    pullRequestCount: 3,
    issueCount: 5,
    commits30d: 4,
    pullRequests30d: 2,
    issues30d: 1,
    ...overrides,
  };
}
