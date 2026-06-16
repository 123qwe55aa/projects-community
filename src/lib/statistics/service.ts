import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDatabase } from '@/db';
import {
  githubStatisticsSnapshots,
  projectStatistics,
  projects,
} from '@/db/schema';
import { activityScore30d, inferProjectType } from './classification';
import {
  createGitHubClient,
  normalizeGitHubRepo,
  type GitHubRepositoryStatistics,
} from './github-client';
import { PROJECT_TYPES, type ProjectType } from './types';

export type SynchronizationResult = {
  projectId: string;
  repoFullName: string | null;
  ok: boolean;
  error: string | null;
  attemptedAt?: Date;
  successfulAt?: Date | null;
};

export type StatisticsDependencies = {
  now?: () => Date;
  githubClient?: {
    fetchRepositoryStatistics(repoFullName: string): Promise<GitHubRepositoryStatistics>;
  };
};

const STYLE_MAP: Record<string, string> = {
  python: 'workshop',
  javascript: 'studio',
  typescript: 'studio',
  rust: 'workshop',
  go: 'workshop',
  java: 'workshop',
  ruby: 'workshop',
  c: 'workshop',
  'c++': 'workshop',
  'c#': 'studio',
  swift: 'studio',
  kotlin: 'studio',
  php: 'workshop',
  shell: 'data-center',
  dockerfile: 'data-center',
  html: 'studio',
  css: 'studio',
  'jupyter notebook': 'data-center',
};

export async function bindRepository({
  projectId,
  repoFullName,
}: {
  projectId: string;
  repoFullName: string;
}): Promise<void> {
  const normalizedRepo = normalizeGitHubRepo(repoFullName);
  const { db } = getDatabase();
  const now = new Date();

  const project = db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw new Error(`Project ${projectId} was not found.`);

  const duplicate = findBindingByRepo(normalizedRepo);
  if (duplicate && duplicate.projectId !== projectId) {
    throw new Error(`GitHub repository ${normalizedRepo} is already bound to another project.`);
  }

  try {
    db.transaction((tx) => {
      const existing = tx
        .select()
        .from(projectStatistics)
        .where(eq(projectStatistics.projectId, projectId))
        .get();

      if (!existing) {
        tx.insert(projectStatistics)
          .values({
            projectId,
            githubRepoFullName: normalizedRepo,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        return;
      }

      const repoChanged = existing.githubRepoFullName !== normalizedRepo;
      if (!repoChanged) {
        tx.update(projectStatistics)
          .set({
            githubRepoFullName: normalizedRepo,
            updatedAt: now,
          })
          .where(eq(projectStatistics.projectId, projectId))
          .run();
        return;
      }

      tx.update(projectStatistics)
        .set({
          githubRepoFullName: normalizedRepo,
          inferredType: null,
          lastAttemptedAt: null,
          lastSuccessfulAt: null,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(projectStatistics.projectId, projectId))
        .run();

      tx.delete(githubStatisticsSnapshots)
        .where(eq(githubStatisticsSnapshots.projectId, projectId))
        .run();
    });
  } catch (error) {
    throw readableBindingError(error, normalizedRepo);
  }
}

export async function bindRepositoryToUnboundProject({
  projectId,
  repoFullName,
}: {
  projectId: string;
  repoFullName: string;
}): Promise<void> {
  const normalizedRepo = normalizeGitHubRepo(repoFullName);
  const { db } = getDatabase();
  const now = new Date();

  const project = db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw new Error(`Project ${projectId} was not found.`);

  const existing = db
    .select({ githubRepoFullName: projectStatistics.githubRepoFullName })
    .from(projectStatistics)
    .where(eq(projectStatistics.projectId, projectId))
    .get();
  if (existing?.githubRepoFullName) {
    throw new Error(`Project ${projectId} is already bound to a GitHub repository.`);
  }

  const duplicate = findBindingByRepo(normalizedRepo);
  if (duplicate && duplicate.projectId !== projectId) {
    throw new Error(`GitHub repository ${normalizedRepo} is already bound to another project.`);
  }

  try {
    db.insert(projectStatistics)
      .values({
        projectId,
        githubRepoFullName: normalizedRepo,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: projectStatistics.projectId,
        set: {
          githubRepoFullName: normalizedRepo,
          updatedAt: now,
        },
        where: sql`${projectStatistics.githubRepoFullName} is null`,
      })
      .run();
  } catch (error) {
    throw readableBindingError(error, normalizedRepo);
  }

  const current = db
    .select({ githubRepoFullName: projectStatistics.githubRepoFullName })
    .from(projectStatistics)
    .where(eq(projectStatistics.projectId, projectId))
    .get();
  if (current?.githubRepoFullName !== normalizedRepo) {
    throw new Error(`Project ${projectId} is already bound to a GitHub repository.`);
  }
}

export async function setManualProjectType({
  projectId,
  manualType,
}: {
  projectId: string;
  manualType: ProjectType | null;
}): Promise<void> {
  if (manualType !== null && !PROJECT_TYPES.includes(manualType)) {
    throw new Error(`Invalid project type: ${String(manualType)}.`);
  }

  const { db } = getDatabase();
  const now = new Date();
  const project = db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw new Error(`Project ${projectId} was not found.`);

  db.insert(projectStatistics)
    .values({
      projectId,
      manualType,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: projectStatistics.projectId,
      set: {
        manualType,
        updatedAt: now,
      },
    })
    .run();
}

export async function synchronizeProjectStatistics(
  projectId: string,
  dependencies: StatisticsDependencies = {},
): Promise<SynchronizationResult> {
  const { db } = getDatabase();
  const now = dependencies.now ?? (() => new Date());
  const attemptedAt = now();
  const project = db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).get();
  if (!project) {
    return {
      projectId,
      repoFullName: null,
      ok: false,
      error: `Project ${projectId} was not found.`,
      attemptedAt,
      successfulAt: null,
    };
  }

  const config = db
    .select()
    .from(projectStatistics)
    .where(eq(projectStatistics.projectId, projectId))
    .get();
  const repoFullName = config?.githubRepoFullName ?? null;
  if (!repoFullName) {
    return {
      projectId,
      repoFullName: null,
      ok: false,
      error: `Project ${projectId} is not bound to a GitHub repository.`,
      attemptedAt,
      successfulAt: config?.lastSuccessfulAt ?? null,
    };
  }

  const githubClient = dependencies.githubClient ?? createGitHubClient({ now });
  let repository: GitHubRepositoryStatistics;
  try {
    repository = await githubClient.fetchRepositoryStatistics(repoFullName);
  } catch (error) {
    const message = errorMessage(error);
    const updateResult = db.update(projectStatistics)
      .set({
        lastAttemptedAt: attemptedAt,
        lastError: message,
        updatedAt: attemptedAt,
      })
      .where(
        and(
          eq(projectStatistics.projectId, projectId),
          eq(projectStatistics.githubRepoFullName, repoFullName),
        ),
      )
      .run();

    if (updateResult.changes === 0) {
      return bindingChangedResult(projectId, repoFullName, attemptedAt, config?.lastSuccessfulAt ?? null);
    }

    return {
      projectId,
      repoFullName,
      ok: false,
      error: message,
      attemptedAt,
      successfulAt: config?.lastSuccessfulAt ?? null,
    };
  }

  const inferredType = inferProjectType({
    topics: repository.topics,
    primaryLanguage: repository.primaryLanguage,
  });
  const score = activityScore30d(repository);
  let bindingChanged = false;

  db.transaction((tx) => {
    const currentConfig = tx
      .select({ githubRepoFullName: projectStatistics.githubRepoFullName })
      .from(projectStatistics)
      .where(eq(projectStatistics.projectId, projectId))
      .get();
    if (currentConfig?.githubRepoFullName !== repoFullName) {
      bindingChanged = true;
      return;
    }

    tx.update(projectStatistics)
      .set({
        inferredType,
        lastAttemptedAt: attemptedAt,
        lastSuccessfulAt: attemptedAt,
        lastError: null,
        updatedAt: attemptedAt,
      })
      .where(eq(projectStatistics.projectId, projectId))
      .run();

    tx.insert(githubStatisticsSnapshots)
      .values({
        projectId,
        repoFullName: repository.repoFullName,
        repoUrl: repository.repoUrl,
        primaryLanguage: repository.primaryLanguage,
        topics: JSON.stringify(repository.topics),
        pushedAt: repository.pushedAt,
        commitCount: repository.commitCount,
        pullRequestCount: repository.pullRequestCount,
        issueCount: repository.issueCount,
        starCount: repository.starCount,
        commits30d: repository.commits30d,
        pullRequests30d: repository.pullRequests30d,
        issues30d: repository.issues30d,
        activityScore30d: score,
        updatedAt: attemptedAt,
      })
      .onConflictDoUpdate({
        target: githubStatisticsSnapshots.projectId,
        set: {
          repoFullName: repository.repoFullName,
          repoUrl: repository.repoUrl,
          primaryLanguage: repository.primaryLanguage,
          topics: JSON.stringify(repository.topics),
          pushedAt: repository.pushedAt,
          commitCount: repository.commitCount,
          pullRequestCount: repository.pullRequestCount,
          issueCount: repository.issueCount,
          starCount: repository.starCount,
          commits30d: repository.commits30d,
          pullRequests30d: repository.pullRequests30d,
          issues30d: repository.issues30d,
          activityScore30d: score,
          updatedAt: attemptedAt,
        },
      })
      .run();
  });

  if (bindingChanged) {
    return bindingChangedResult(projectId, repoFullName, attemptedAt, config?.lastSuccessfulAt ?? null);
  }

  return {
    projectId,
    repoFullName,
    ok: true,
    error: null,
    attemptedAt,
    successfulAt: attemptedAt,
  };
}

export async function synchronizeAllProjectStatistics(
  dependencies: StatisticsDependencies = {},
): Promise<SynchronizationResult[]> {
  const { db } = getDatabase();
  const boundProjects = db
    .select({ projectId: projectStatistics.projectId })
    .from(projectStatistics)
    .where(isNotNull(projectStatistics.githubRepoFullName))
    .orderBy(asc(projectStatistics.projectId))
    .all();
  const results: SynchronizationResult[] = [];

  for (const { projectId } of boundProjects) {
    results.push(await synchronizeProjectStatistics(projectId, dependencies));
  }

  return results;
}

export async function createProjectFromGitHub(input: {
  repoFullName: string;
  metadata: {
    description: string;
    topics: string[];
    language: string;
    readmeText?: string;
  };
}): Promise<{ projectId: string }> {
  const normalizedRepoFullName = normalizeGitHubRepo(input.repoFullName);
  const duplicate = findBindingByRepo(normalizedRepoFullName);
  if (duplicate) {
    throw new Error(`GitHub repository ${normalizedRepoFullName} is already bound to another project.`);
  }

  const { db } = getDatabase();
  const now = new Date();
  const projectId = nanoid();
  const displayRepoFullName = displayRepositoryName(input.repoFullName, normalizedRepoFullName);
  const repoName = displayRepoFullName.split('/')[1] ?? normalizedRepoFullName.split('/')[1] ?? normalizedRepoFullName;
  const description = input.metadata.description.trim() || repoName;
  const topics = input.metadata.topics.filter((topic) => topic.trim()).map((topic) => topic.trim());
  const language = input.metadata.language.trim();
  const readmeText = input.metadata.readmeText?.trim() ?? '';
  const githubUrl = `https://github.com/${displayRepoFullName}`;

  const background = [
    `[GitHub] ${displayRepoFullName}`,
    description,
    topics.length ? `Topics: ${topics.join(', ')}` : '',
    readmeText ? `\n${readmeText.slice(0, 2000)}` : '',
  ].filter(Boolean).join('\n').trim();

  try {
    db.transaction((tx) => {
      tx.insert(projects)
        .values({
          id: projectId,
          summary: description.slice(0, 120),
          background: background.slice(0, 5000),
          buildingStyle: STYLE_MAP[language.toLowerCase()] || 'workshop',
          growthStage: 'seed',
          visibility: 'private',
          imageUrl: null,
          deployUrl: githubUrl,
        })
        .run();

      tx.insert(projectStatistics)
        .values({
          projectId,
          githubRepoFullName: normalizedRepoFullName,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    });
  } catch (error) {
    throw readableBindingError(error, normalizedRepoFullName);
  }

  return { projectId };
}

function findBindingByRepo(repoFullName: string): { projectId: string } | undefined {
  const { db } = getDatabase();
  return db
    .select({ projectId: projectStatistics.projectId })
    .from(projectStatistics)
    .where(sql`lower(${projectStatistics.githubRepoFullName}) = ${repoFullName.toLowerCase()}`)
    .get();
}

function readableBindingError(error: unknown, repoFullName: string): Error {
  if (errorMessage(error).includes('project_statistics.github_repo_full_name')) {
    return new Error(`GitHub repository ${repoFullName} is already bound to another project.`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

function bindingChangedResult(
  projectId: string,
  repoFullName: string,
  attemptedAt: Date,
  successfulAt: Date | null,
): SynchronizationResult {
  return {
    projectId,
    repoFullName,
    ok: false,
    error: `Project ${projectId} GitHub binding changed during synchronization.`,
    attemptedAt,
    successfulAt,
  };
}

function displayRepositoryName(input: string, normalizedRepoFullName: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return normalizedRepoFullName;
  return trimmed.replace(/\.git$/i, '');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
