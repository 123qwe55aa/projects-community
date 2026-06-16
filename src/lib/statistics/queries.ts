import { asc, eq } from 'drizzle-orm';
import { getDatabase } from '@/db';
import {
  githubStatisticsSnapshots,
  projectStatistics,
  projects,
} from '@/db/schema';
import { rankProjectMatches } from './matching';
import {
  PROJECT_TYPES,
  type ProjectMatchSuggestion,
  type ProjectType,
  type RepositoryMatchInput,
} from './types';

export type StatisticsMetrics = {
  commitCount: number;
  pullRequestCount: number;
  issueCount: number;
  starCount: number;
  commits30d: number;
  pullRequests30d: number;
  issues30d: number;
  activityScore30d: number;
};

export type StatisticsOverviewSummary = {
  projectCount: number;
  boundProjectCount: number;
  recentContributionCount: number;
  starCount: number;
};

export type StatisticsTypeDistributionRow = {
  type: ProjectType;
  count: number;
};

export type StatisticsProjectRow = {
  projectId: string;
  summary: string | null;
  background: string | null;
  backgroundExcerpt: string | null;
  binding: {
    isBound: boolean;
    githubRepoFullName: string | null;
    repoUrl: string | null;
  };
  effectiveType: ProjectType;
  inferredType: ProjectType | null;
  manualType: ProjectType | null;
  metrics: StatisticsMetrics;
  lastAttemptedAt: Date | null;
  lastSuccessfulAt: Date | null;
  lastError: string | null;
};

export type StatisticsActivityRankingRow = Pick<
  StatisticsProjectRow,
  'projectId' | 'summary' | 'binding' | 'effectiveType' | 'metrics' | 'lastSuccessfulAt' | 'lastError'
>;

export type StatisticsOverview = {
  summary: StatisticsOverviewSummary;
  typeDistribution: StatisticsTypeDistributionRow[];
  activityRanking: StatisticsActivityRankingRow[];
  projects: StatisticsProjectRow[];
};

export type ProjectStatisticsDetail = {
  projectId: string;
  summary: string | null;
  background: string | null;
  project: {
    id: string;
    summary: string | null;
    background: string | null;
    imageUrl: string | null;
    deployUrl: string | null;
    buildingStyle: string | null;
    growthStage: string | null;
    visibility: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  };
  config: {
    githubRepoFullName: string | null;
    inferredType: ProjectType | null;
    manualType: ProjectType | null;
    lastAttemptedAt: Date | null;
    lastSuccessfulAt: Date | null;
    lastError: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  } | null;
  snapshot: {
    repoFullName: string;
    repoUrl: string;
    primaryLanguage: string | null;
    topics: string[];
    pushedAt: Date | null;
    commitCount: number;
    pullRequestCount: number;
    issueCount: number;
    starCount: number;
    commits30d: number;
    pullRequests30d: number;
    issues30d: number;
    activityScore30d: number;
    updatedAt: Date;
  } | null;
  effectiveType: ProjectType;
};

const EMPTY_METRICS: StatisticsMetrics = {
  commitCount: 0,
  pullRequestCount: 0,
  issueCount: 0,
  starCount: 0,
  commits30d: 0,
  pullRequests30d: 0,
  issues30d: 0,
  activityScore30d: 0,
};

export async function getStatisticsOverview(): Promise<StatisticsOverview> {
  const rows = overviewRows().map(toProjectRow);
  const typeCounts = new Map<ProjectType, number>();
  for (const row of rows) {
    typeCounts.set(row.effectiveType, (typeCounts.get(row.effectiveType) ?? 0) + 1);
  }

  const summary = rows.reduce<StatisticsOverviewSummary>(
    (accumulator, row) => ({
      projectCount: accumulator.projectCount + 1,
      boundProjectCount: accumulator.boundProjectCount + (row.binding.isBound ? 1 : 0),
      recentContributionCount:
        accumulator.recentContributionCount +
        row.metrics.commits30d +
        row.metrics.pullRequests30d +
        row.metrics.issues30d,
      starCount: accumulator.starCount + row.metrics.starCount,
    }),
    {
      projectCount: 0,
      boundProjectCount: 0,
      recentContributionCount: 0,
      starCount: 0,
    },
  );

  return {
    summary,
    typeDistribution: PROJECT_TYPES
      .map((type) => ({ type, count: typeCounts.get(type) ?? 0 }))
      .filter((row) => row.count > 0),
    activityRanking: rows
      .filter((row) => row.binding.isBound)
      .sort(
        (left, right) =>
          right.metrics.activityScore30d - left.metrics.activityScore30d ||
          compareStrings(left.projectId, right.projectId),
      )
      .map((row) => ({
        projectId: row.projectId,
        summary: row.summary,
        binding: row.binding,
        effectiveType: row.effectiveType,
        metrics: row.metrics,
        lastSuccessfulAt: row.lastSuccessfulAt,
        lastError: row.lastError,
      })),
    projects: rows,
  };
}

export async function getProjectStatisticsDetail(
  projectId: string,
): Promise<ProjectStatisticsDetail | null> {
  const { db } = getDatabase();
  const row = db
    .select({
      project: projects,
      config: projectStatistics,
      snapshot: githubStatisticsSnapshots,
    })
    .from(projects)
    .leftJoin(projectStatistics, eq(projectStatistics.projectId, projects.id))
    .leftJoin(githubStatisticsSnapshots, eq(githubStatisticsSnapshots.projectId, projects.id))
    .where(eq(projects.id, projectId))
    .get();

  if (!row) return null;

  return {
    projectId: row.project.id,
    summary: row.project.summary,
    background: row.project.background,
    project: {
      id: row.project.id,
      summary: row.project.summary,
      background: row.project.background,
      imageUrl: row.project.imageUrl,
      deployUrl: row.project.deployUrl,
      buildingStyle: row.project.buildingStyle,
      growthStage: row.project.growthStage,
      visibility: row.project.visibility,
      createdAt: row.project.createdAt,
      updatedAt: row.project.updatedAt,
    },
    config: row.config
      ? {
          githubRepoFullName: row.config.githubRepoFullName,
          inferredType: projectTypeOrNull(row.config.inferredType),
          manualType: projectTypeOrNull(row.config.manualType),
          lastAttemptedAt: row.config.lastAttemptedAt,
          lastSuccessfulAt: row.config.lastSuccessfulAt,
          lastError: row.config.lastError,
          createdAt: row.config.createdAt,
          updatedAt: row.config.updatedAt,
        }
      : null,
    snapshot: row.snapshot
      ? {
          repoFullName: row.snapshot.repoFullName,
          repoUrl: row.snapshot.repoUrl,
          primaryLanguage: row.snapshot.primaryLanguage,
          topics: parseTopics(row.snapshot.topics),
          pushedAt: row.snapshot.pushedAt,
          commitCount: row.snapshot.commitCount,
          pullRequestCount: row.snapshot.pullRequestCount,
          issueCount: row.snapshot.issueCount,
          starCount: row.snapshot.starCount,
          commits30d: row.snapshot.commits30d,
          pullRequests30d: row.snapshot.pullRequests30d,
          issues30d: row.snapshot.issues30d,
          activityScore30d: row.snapshot.activityScore30d,
          updatedAt: row.snapshot.updatedAt,
        }
      : null,
    effectiveType: effectiveType(row.config?.manualType ?? null, row.config?.inferredType ?? null),
  };
}

export async function getGitHubImportMatchSuggestions(
  repo: RepositoryMatchInput,
): Promise<ProjectMatchSuggestion[]> {
  const { db } = getDatabase();
  const rows = db
    .select({
      projectId: projects.id,
      summary: projects.summary,
      background: projects.background,
      githubRepoFullName: projectStatistics.githubRepoFullName,
    })
    .from(projects)
    .leftJoin(projectStatistics, eq(projectStatistics.projectId, projects.id))
    .orderBy(asc(projects.id))
    .all();

  return rankProjectMatches(
    repo,
    rows
      .filter((row) => row.githubRepoFullName === null)
      .map((row) => ({
        projectId: row.projectId,
        summary: row.summary,
        background: row.background,
      })),
  );
}

function overviewRows() {
  const { db } = getDatabase();
  return db
    .select({
      project: projects,
      config: projectStatistics,
      snapshot: githubStatisticsSnapshots,
    })
    .from(projects)
    .leftJoin(projectStatistics, eq(projectStatistics.projectId, projects.id))
    .leftJoin(githubStatisticsSnapshots, eq(githubStatisticsSnapshots.projectId, projects.id))
    .orderBy(asc(projects.id))
    .all();
}

function toProjectRow(row: ReturnType<typeof overviewRows>[number]): StatisticsProjectRow {
  const metrics = row.snapshot
    ? {
        commitCount: row.snapshot.commitCount,
        pullRequestCount: row.snapshot.pullRequestCount,
        issueCount: row.snapshot.issueCount,
        starCount: row.snapshot.starCount,
        commits30d: row.snapshot.commits30d,
        pullRequests30d: row.snapshot.pullRequests30d,
        issues30d: row.snapshot.issues30d,
        activityScore30d: row.snapshot.activityScore30d,
      }
    : { ...EMPTY_METRICS };

  return {
    projectId: row.project.id,
    summary: row.project.summary,
    background: row.project.background,
    backgroundExcerpt: excerpt(row.project.background),
    binding: {
      isBound: row.config?.githubRepoFullName !== null && row.config?.githubRepoFullName !== undefined,
      githubRepoFullName: row.config?.githubRepoFullName ?? null,
      repoUrl: row.snapshot?.repoUrl ?? null,
    },
    effectiveType: effectiveType(row.config?.manualType ?? null, row.config?.inferredType ?? null),
    inferredType: projectTypeOrNull(row.config?.inferredType ?? null),
    manualType: projectTypeOrNull(row.config?.manualType ?? null),
    metrics,
    lastAttemptedAt: row.config?.lastAttemptedAt ?? null,
    lastSuccessfulAt: row.config?.lastSuccessfulAt ?? null,
    lastError: row.config?.lastError ?? null,
  };
}

function effectiveType(
  manualType: string | null,
  inferredType: string | null,
): ProjectType {
  return projectTypeOrNull(manualType) ?? projectTypeOrNull(inferredType) ?? 'other';
}

function projectTypeOrNull(value: string | null): ProjectType | null {
  return isProjectType(value) ? value : null;
}

function isProjectType(value: string | null): value is ProjectType {
  return PROJECT_TYPES.some((type) => type === value);
}

function parseTopics(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((topic): topic is string => typeof topic === 'string')
      : [];
  } catch {
    return [];
  }
}

function excerpt(value: string | null): string | null {
  if (!value) return null;
  return value.length > 240 ? `${value.slice(0, 237)}...` : value;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
