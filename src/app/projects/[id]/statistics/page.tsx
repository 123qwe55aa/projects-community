import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getProjectStatisticsDetail,
  type ProjectStatisticsDetail,
} from '@/lib/statistics/queries';
import { type ProjectType } from '@/lib/statistics/types';
import {
  ProjectStatisticsManager,
  type ProjectStatisticsManagerModel,
} from './project-statistics-manager';

export const metadata = {
  title: 'Project Statistics',
};

export const dynamic = 'force-dynamic';

type SerializableProjectStatisticsDetail = Omit<
  ProjectStatisticsDetail,
  'project' | 'config' | 'snapshot'
> & {
  project: Omit<ProjectStatisticsDetail['project'], 'createdAt' | 'updatedAt'> & {
    createdAt: string | null;
    updatedAt: string | null;
  };
  config: (Omit<
    NonNullable<ProjectStatisticsDetail['config']>,
    'lastAttemptedAt' | 'lastSuccessfulAt' | 'createdAt' | 'updatedAt'
  > & {
    lastAttemptedAt: string | null;
    lastSuccessfulAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  }) | null;
  snapshot: (Omit<NonNullable<ProjectStatisticsDetail['snapshot']>, 'pushedAt' | 'updatedAt'> & {
    pushedAt: string | null;
    updatedAt: string | null;
  }) | null;
};

export default async function ProjectStatisticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getProjectStatisticsDetail(id);

  if (!detail) notFound();

  const serialized = serializeDetail(detail);
  const projectTitle = projectName(serialized.project);
  const repository = repositoryModel(serialized);
  const managerModel: ProjectStatisticsManagerModel = {
    projectId: serialized.projectId,
    repository: {
      isBound: repository.isBound,
      githubRepoFullName: repository.githubRepoFullName,
    },
    effectiveType: serialized.effectiveType,
    inferredType: serialized.config?.inferredType ?? null,
    manualType: serialized.config?.manualType ?? null,
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 p-6 sm:p-8">
      <header className="space-y-4 border-b border-zinc-800 pb-6">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/projects" className="transition hover:text-zinc-300">
            Projects
          </Link>
          <span>/</span>
          <Link href={`/projects/${serialized.projectId}`} className="truncate transition hover:text-zinc-300">
            {projectTitle}
          </Link>
          <span>/</span>
          <span className="text-zinc-300">Statistics</span>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400">
              Project Statistics
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
              {projectTitle} Project Statistics
            </h1>
            {serialized.project.background && serialized.project.background !== serialized.project.summary && (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                {serialized.project.background}
              </p>
            )}
          </div>
          <Link
            href={`/projects/${serialized.projectId}`}
            className="shrink-0 rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800"
          >
            Back to project
          </Link>
        </div>
      </header>

      <section aria-label="Repository status" className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Repository</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {repository.isBound ? 'Bound to a GitHub repository.' : 'No GitHub repository is bound yet.'}
            </p>
          </div>
          {repository.repoUrl ? (
            <a
              href={repository.repoUrl}
              className="text-sm font-medium text-emerald-300 transition hover:text-emerald-200"
            >
              {repository.githubRepoFullName}
            </a>
          ) : (
            <span className="text-sm text-zinc-400">{repository.githubRepoFullName ?? 'Unbound'}</span>
          )}
        </div>
      </section>

      <ProjectStatisticsManager detail={managerModel} />

      <section aria-labelledby="type-heading" className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 id="type-heading" className="text-lg font-semibold text-white">
          Classification
        </h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <MetricGroup label="Effective type" value={labelize(serialized.effectiveType)} />
          <MetricGroup
            label="Inferred type"
            value={serialized.config?.inferredType ? labelize(serialized.config.inferredType) : 'None'}
          />
          <MetricGroup
            label="Manual type"
            value={serialized.config?.manualType ? labelize(serialized.config.manualType) : 'Automatic'}
          />
        </dl>
      </section>

      <section aria-labelledby="metrics-heading" className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 id="metrics-heading" className="text-lg font-semibold text-white">
          Metrics
        </h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <MetricGroup
            label="Cumulative metrics"
            value={`${formatNumber(serialized.snapshot?.commitCount ?? 0)} commits · ${formatNumber(
              serialized.snapshot?.pullRequestCount ?? 0,
            )} PRs · ${formatNumber(serialized.snapshot?.issueCount ?? 0)} issues · ${formatNumber(
              serialized.snapshot?.starCount ?? 0,
            )} stars`}
          />
          <MetricGroup
            label="Recent metrics"
            value={`${formatNumber(serialized.snapshot?.commits30d ?? 0)} commits · ${formatNumber(
              serialized.snapshot?.pullRequests30d ?? 0,
            )} PRs · ${formatNumber(serialized.snapshot?.issues30d ?? 0)} issues`}
          />
          <MetricGroup
            label="Activity score"
            value={formatNumber(serialized.snapshot?.activityScore30d ?? 0)}
          />
          <MetricGroup label="Pushed time" value={formatDate(serialized.snapshot?.pushedAt ?? null)} />
        </dl>
      </section>

      <section aria-labelledby="sync-heading" className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 id="sync-heading" className="text-lg font-semibold text-white">
          Sync Status
        </h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <MetricGroup label="Last attempted sync" value={formatDate(serialized.config?.lastAttemptedAt ?? null)} />
          <MetricGroup label="Last successful sync" value={formatDate(serialized.config?.lastSuccessfulAt ?? null)} />
          <MetricGroup label="Snapshot updated" value={formatDate(serialized.snapshot?.updatedAt ?? null)} />
          <MetricGroup label="Latest error" value={serialized.config?.lastError ?? 'None'} tone="error" />
        </dl>
      </section>
    </main>
  );
}

function serializeDetail(detail: ProjectStatisticsDetail): SerializableProjectStatisticsDetail {
  return {
    ...detail,
    project: {
      ...detail.project,
      createdAt: serializeDate(detail.project.createdAt),
      updatedAt: serializeDate(detail.project.updatedAt),
    },
    config: detail.config
      ? {
          ...detail.config,
          lastAttemptedAt: serializeDate(detail.config.lastAttemptedAt),
          lastSuccessfulAt: serializeDate(detail.config.lastSuccessfulAt),
          createdAt: serializeDate(detail.config.createdAt),
          updatedAt: serializeDate(detail.config.updatedAt),
        }
      : null,
    snapshot: detail.snapshot
      ? {
          ...detail.snapshot,
          pushedAt: serializeDate(detail.snapshot.pushedAt),
          updatedAt: serializeDate(detail.snapshot.updatedAt),
        }
      : null,
  };
}

function repositoryModel(detail: SerializableProjectStatisticsDetail) {
  const githubRepoFullName = detail.config?.githubRepoFullName ?? detail.snapshot?.repoFullName ?? null;
  return {
    isBound: Boolean(detail.config?.githubRepoFullName),
    githubRepoFullName,
    repoUrl: detail.snapshot?.repoUrl ?? (githubRepoFullName ? `https://github.com/${githubRepoFullName}` : null),
  };
}

function MetricGroup({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'error';
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
      <dt className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-600">{label}</dt>
      <dd className={['mt-1 break-words', tone === 'error' ? 'text-amber-300' : 'text-zinc-300'].join(' ')}>
        {value}
      </dd>
    </div>
  );
}

function projectName(project: { id: string; summary: string | null; background: string | null }) {
  return project.summary ?? project.background ?? project.id;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDate(value: string | null) {
  if (!value) return 'Never';
  return value.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

function labelize(value: ProjectType | string) {
  return value.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function serializeDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
