import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDatabase } from '@/db';
import {
  githubStatisticsSnapshots,
  projectStatistics,
  projects,
} from '@/db/schema';
import { createTestDatabase } from '@/test/db';
import {
  getGitHubImportMatchSuggestions,
  getProjectStatisticsDetail,
  getStatisticsOverview,
} from './queries';

type Harness = ReturnType<typeof createTestDatabase>;

const baseDate = new Date('2026-06-16T10:00:00.000Z');

describe('statistics queries', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createTestDatabase();
    seedStatisticsProjects();
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('builds overview totals, deterministic type distribution, ranking, and table status from local rows', async () => {
    const overview = await getStatisticsOverview();

    expect(overview.summary).toEqual({
      projectCount: 5,
      boundProjectCount: 3,
      recentContributionCount: 20,
      starCount: 26,
    });
    expect(overview.typeDistribution).toEqual([
      { type: 'application', count: 1 },
      { type: 'library', count: 1 },
      { type: 'tooling', count: 1 },
      { type: 'other', count: 2 },
    ]);
    expect(overview.activityRanking.map((row) => ({
      projectId: row.projectId,
      activityScore30d: row.metrics.activityScore30d,
    }))).toEqual([
      { projectId: 'project-bound-manual', activityScore30d: 20 },
      { projectId: 'project-bound-inferred', activityScore30d: 8 },
      { projectId: 'project-bound-failed', activityScore30d: 0 },
    ]);

    expect(overview.projects.map((row) => row.projectId)).toEqual([
      'project-bound-failed',
      'project-bound-inferred',
      'project-bound-manual',
      'project-unbound-manual',
      'project-unbound-other',
    ]);
    expect(overview.projects.find((row) => row.projectId === 'project-bound-failed')).toMatchObject({
      projectId: 'project-bound-failed',
      summary: 'Failed sync project',
      binding: {
        isBound: true,
        githubRepoFullName: 'owner/failed',
      },
      effectiveType: 'other',
      inferredType: null,
      manualType: null,
      metrics: {
        commitCount: 0,
        pullRequestCount: 0,
        issueCount: 0,
        starCount: 0,
        commits30d: 0,
        pullRequests30d: 0,
        issues30d: 0,
        activityScore30d: 0,
      },
      lastAttemptedAt: new Date('2026-06-16T09:00:00.000Z'),
      lastSuccessfulAt: null,
      lastError: 'rate limited',
    });
    expect(overview.projects.find((row) => row.projectId === 'project-unbound-other')).toMatchObject({
      binding: {
        isBound: false,
        githubRepoFullName: null,
      },
      effectiveType: 'other',
    });
  });

  it('returns project detail with project config, latest snapshot, and manual type precedence', async () => {
    const detail = await getProjectStatisticsDetail('project-bound-manual');

    expect(detail).toMatchObject({
      projectId: 'project-bound-manual',
      summary: 'Manual library',
      background: 'Manual library background with enough prose for the UI.',
      effectiveType: 'library',
      config: {
        githubRepoFullName: 'owner/manual',
        inferredType: 'application',
        manualType: 'library',
        lastAttemptedAt: baseDate,
        lastSuccessfulAt: baseDate,
        lastError: null,
      },
      snapshot: {
        repoFullName: 'Owner/Manual',
        repoUrl: 'https://github.com/Owner/Manual',
        primaryLanguage: 'TypeScript',
        topics: ['web-app', 'nextjs'],
        commitCount: 10,
        pullRequestCount: 4,
        issueCount: 2,
        starCount: 11,
        commits30d: 5,
        pullRequests30d: 3,
        issues30d: 2,
        activityScore30d: 20,
        updatedAt: baseDate,
      },
    });
  });

  it('returns null detail for a missing project', async () => {
    await expect(getProjectStatisticsDetail('missing-project')).resolves.toBeNull();
  });

  it('suggests GitHub import matches from unbound projects only', async () => {
    const suggestions = await getGitHubImportMatchSuggestions({
      name: 'Manual library',
      description: 'Manual library background nextjs',
    });

    expect(suggestions.map((suggestion) => suggestion.projectId)).toEqual([
      'project-unbound-manual',
    ]);
    expect(suggestions[0]?.score).toBeGreaterThanOrEqual(0.6);
  });
});

function seedStatisticsProjects() {
  insertProject({
    id: 'project-bound-manual',
    summary: 'Manual library',
    background: 'Manual library background with enough prose for the UI.',
  });
  insertProject({
    id: 'project-bound-inferred',
    summary: 'Inferred tooling',
    background: 'Command line tooling project.',
  });
  insertProject({
    id: 'project-bound-failed',
    summary: 'Failed sync project',
    background: 'Repository with a failed latest synchronization.',
  });
  insertProject({
    id: 'project-unbound-manual',
    summary: 'Manual library',
    background: 'Manual library background nextjs',
  });
  insertProject({
    id: 'project-unbound-other',
    summary: 'Untyped notebook',
    background: 'No GitHub repository yet.',
  });

  insertConfig({
    projectId: 'project-bound-manual',
    githubRepoFullName: 'owner/manual',
    inferredType: 'application',
    manualType: 'library',
    lastAttemptedAt: baseDate,
    lastSuccessfulAt: baseDate,
  });
  insertConfig({
    projectId: 'project-bound-inferred',
    githubRepoFullName: 'owner/tooling',
    inferredType: 'tooling',
    lastAttemptedAt: new Date('2026-06-15T10:00:00.000Z'),
    lastSuccessfulAt: new Date('2026-06-15T10:00:00.000Z'),
  });
  insertConfig({
    projectId: 'project-bound-failed',
    githubRepoFullName: 'owner/failed',
    lastAttemptedAt: new Date('2026-06-16T09:00:00.000Z'),
    lastError: 'rate limited',
  });
  insertConfig({
    projectId: 'project-unbound-manual',
    manualType: 'application',
  });

  insertSnapshot({
    projectId: 'project-bound-manual',
    repoFullName: 'Owner/Manual',
    repoUrl: 'https://github.com/Owner/Manual',
    primaryLanguage: 'TypeScript',
    topics: JSON.stringify(['web-app', 'nextjs']),
    commitCount: 10,
    pullRequestCount: 4,
    issueCount: 2,
    starCount: 11,
    commits30d: 5,
    pullRequests30d: 3,
    issues30d: 2,
    activityScore30d: 20,
    updatedAt: baseDate,
  });
  insertSnapshot({
    projectId: 'project-bound-inferred',
    repoFullName: 'Owner/Tooling',
    repoUrl: 'https://github.com/Owner/Tooling',
    primaryLanguage: 'Shell',
    topics: JSON.stringify(['cli']),
    commitCount: 7,
    pullRequestCount: 1,
    issueCount: 3,
    starCount: 15,
    commits30d: 6,
    pullRequests30d: 1,
    issues30d: 3,
    activityScore30d: 8,
    updatedAt: new Date('2026-06-15T10:00:00.000Z'),
  });
}

function insertProject(values: typeof projects.$inferInsert) {
  const { db } = getDatabase();
  db.insert(projects).values({
    buildingStyle: 'workshop',
    growthStage: 'seed',
    visibility: 'private',
    ...values,
  }).run();
}

function insertConfig(values: Partial<typeof projectStatistics.$inferInsert> & { projectId: string }) {
  const { db } = getDatabase();
  db.insert(projectStatistics).values({
    createdAt: baseDate,
    updatedAt: baseDate,
    ...values,
  }).run();
}

function insertSnapshot(values: typeof githubStatisticsSnapshots.$inferInsert) {
  const { db } = getDatabase();
  db.insert(githubStatisticsSnapshots).values(values).run();
}
