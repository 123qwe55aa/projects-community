'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  synchronizeAllProjectStatisticsAction,
  synchronizeProjectStatisticsAction,
} from '@/app/statistics-actions';
import {
  type StatisticsActivityRankingRow,
  type StatisticsOverview,
  type StatisticsProjectRow,
} from '@/lib/statistics/queries';
import { PROJECT_TYPES, type ProjectType } from '@/lib/statistics/types';

type SerializableActivityRankingRow = Omit<StatisticsActivityRankingRow, 'lastSuccessfulAt'> & {
  lastSuccessfulAt: string | null;
};

type SerializableProjectRow = Omit<
  StatisticsProjectRow,
  'lastAttemptedAt' | 'lastSuccessfulAt'
> & {
  lastAttemptedAt: string | null;
  lastSuccessfulAt: string | null;
};

export type SerializableStatisticsOverview = Omit<
  StatisticsOverview,
  'activityRanking' | 'projects'
> & {
  activityRanking: SerializableActivityRankingRow[];
  projects: SerializableProjectRow[];
};

type BindingFilter = 'all' | 'bound' | 'unbound';
type TypeFilter = 'all' | ProjectType;

const summaryCards = [
  { key: 'projectCount', label: 'Total Projects' },
  { key: 'boundProjectCount', label: 'GitHub Bound' },
  { key: 'recentContributionCount', label: '30-Day Contributions' },
  { key: 'starCount', label: 'Stars' },
] as const;

export function StatisticsManager({ overview }: { overview: SerializableStatisticsOverview }) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [bindingFilter, setBindingFilter] = useState<BindingFilter>('all');

  async function syncAllAction() {
    await synchronizeAllProjectStatisticsAction();
  }

  async function syncProjectAction(formData: FormData) {
    await synchronizeProjectStatisticsAction(formData);
  }

  const filteredProjects = useMemo(
    () =>
      overview.projects.filter((project) => {
        const matchesType = typeFilter === 'all' || project.effectiveType === typeFilter;
        const matchesBinding =
          bindingFilter === 'all' ||
          (bindingFilter === 'bound' && project.binding.isBound) ||
          (bindingFilter === 'unbound' && !project.binding.isBound);
        return matchesType && matchesBinding;
      }),
    [bindingFilter, overview.projects, typeFilter],
  );

  const activityRows = overview.activityRanking.filter(
    (project) => project.binding.isBound && project.metrics.activityScore30d > 0,
  );
  const maxTypeCount = Math.max(1, ...overview.typeDistribution.map((row) => row.count));
  const maxActivityScore = Math.max(1, ...activityRows.map((row) => row.metrics.activityScore30d));

  return (
    <div className="space-y-8">
      <section aria-label="Portfolio summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <article
            key={card.key}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"
            aria-label={card.label}
          >
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
              {card.label}
            </p>
            <p className="mt-3 text-3xl font-semibold text-white">
              {formatNumber(overview.summary[card.key])}
            </p>
          </article>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-label="Project type distribution"
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"
        >
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-white">Project Type Distribution</h2>
            <p className="mt-1 text-sm text-zinc-500">Effective type across the portfolio.</p>
          </div>
          {overview.typeDistribution.length > 0 ? (
            <div className="space-y-3">
              {overview.typeDistribution.map((row) => (
                <BarRow
                  key={row.type}
                  label={labelize(row.type)}
                  value={row.count}
                  max={maxTypeCount}
                  valueLabel={`${formatNumber(row.count)} projects`}
                />
              ))}
            </div>
          ) : (
            <EmptyState>No projects have been classified yet.</EmptyState>
          )}
        </section>

        <section
          aria-label="Recent activity ranking"
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"
        >
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-white">Recent Activity Ranking</h2>
            <p className="mt-1 text-sm text-zinc-500">Bound projects ranked by 30-day activity.</p>
          </div>
          {activityRows.length > 0 ? (
            <div className="space-y-3">
              {activityRows.map((row) => (
                <BarRow
                  key={row.projectId}
                  label={projectTitle(row)}
                  value={row.metrics.activityScore30d}
                  max={maxActivityScore}
                  valueLabel={`${formatNumber(row.metrics.activityScore30d)} score`}
                />
              ))}
            </div>
          ) : (
            <EmptyState>No bound projects have recent activity in the local snapshot.</EmptyState>
          )}
        </section>
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm text-zinc-300">
              <span className="block text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                Project type filter
              </span>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
              >
                <option value="all">All project types</option>
                {PROJECT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {labelize(type)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm text-zinc-300">
              <span className="block text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                GitHub binding filter
              </span>
              <select
                value={bindingFilter}
                onChange={(event) => setBindingFilter(event.target.value as BindingFilter)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
              >
                <option value="all">All projects</option>
                <option value="bound">Bound only</option>
                <option value="unbound">Unbound only</option>
              </select>
            </label>
          </div>

          <form action={syncAllAction}>
            <button
              type="submit"
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
            >
              Sync all
            </button>
          </form>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          <div className="border-b border-zinc-800 px-5 py-4">
            <h2 className="text-lg font-semibold text-white">Projects</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Showing {formatNumber(filteredProjects.length)} of{' '}
              {formatNumber(overview.projects.length)} projects.
            </p>
          </div>

          {filteredProjects.length > 0 ? (
            <ul className="divide-y divide-zinc-800">
              {filteredProjects.map((project) => (
                <li key={project.projectId} className="space-y-4 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <Link
                        href={`/projects/${project.projectId}/statistics`}
                        className="text-base font-semibold text-white transition hover:text-emerald-300"
                      >
                        {projectTitle(project)}
                      </Link>
                      {project.backgroundExcerpt && (
                        <p className="max-w-3xl text-sm leading-6 text-zinc-400">
                          {project.backgroundExcerpt}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge>{labelize(project.effectiveType)}</Badge>
                        {project.binding.isBound ? (
                          <RepoBadge project={project} />
                        ) : (
                          <Badge>Unbound</Badge>
                        )}
                        {project.manualType && <Badge>Manual: {labelize(project.manualType)}</Badge>}
                        {project.inferredType && (
                          <Badge>Inferred: {labelize(project.inferredType)}</Badge>
                        )}
                      </div>
                    </div>

                    {project.binding.isBound && (
                      <form action={syncProjectAction}>
                        <input type="hidden" name="projectId" value={project.projectId} />
                        <button
                          type="submit"
                          className="rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
                        >
                          Sync project
                        </button>
                      </form>
                    )}
                  </div>

                  <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                    <MetricGroup
                      label="Cumulative metrics"
                      value={`${formatNumber(project.metrics.commitCount)} commits · ${formatNumber(
                        project.metrics.pullRequestCount,
                      )} PRs · ${formatNumber(project.metrics.issueCount)} issues · ${formatNumber(
                        project.metrics.starCount,
                      )} stars`}
                    />
                    <MetricGroup
                      label="Recent metrics"
                      value={`${formatNumber(project.metrics.commits30d)} commits · ${formatNumber(
                        project.metrics.pullRequests30d,
                      )} PRs · ${formatNumber(project.metrics.issues30d)} issues`}
                    />
                    <MetricGroup
                      label="30-day activity"
                      value={formatNumber(project.metrics.activityScore30d)}
                    />
                    <MetricGroup
                      label="Last successful sync"
                      value={formatDate(project.lastSuccessfulAt)}
                    />
                  </dl>

                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <MetricGroup label="Last attempted sync" value={formatDate(project.lastAttemptedAt)} />
                    <MetricGroup label="Latest error" value={project.lastError ?? 'None'} tone="error" />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-8">
              <EmptyState>No projects match the selected filters.</EmptyState>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  valueLabel,
}: {
  label: string;
  value: number;
  max: number;
  valueLabel: string;
}) {
  const width = `${Math.max(4, Math.round((value / max) * 100))}%`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate text-zinc-300">{label}</span>
        <span className="shrink-0 tabular-nums text-zinc-500">{valueLabel}</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-800">
        <div className="h-2 rounded-full bg-emerald-500" style={{ width }} />
      </div>
    </div>
  );
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

function RepoBadge({ project }: { project: SerializableProjectRow }) {
  const label = project.binding.githubRepoFullName ?? 'Bound';
  if (!project.binding.repoUrl) return <Badge>{label}</Badge>;

  return (
    <a
      href={project.binding.repoUrl}
      className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-300 transition hover:border-zinc-500 hover:text-white"
    >
      {label}
    </a>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-400">
      {children}
    </span>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/60 p-6 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}

function projectTitle(project: { projectId: string; summary: string | null; background?: string | null }) {
  return project.summary ?? project.background ?? project.projectId;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDate(value: string | null) {
  if (!value) return 'Never';
  return value.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

function labelize(value: string) {
  return value.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
