'use client';

import Link from 'next/link';
import { useState, useMemo } from 'react';
import type { CurrentProjectCard, LifecycleState } from '@/lib/v2/queries';
import { EnergyBar } from '@/components/ui/EnergyBar';

const lifecycleOrder: LifecycleState[] = ['active', 'dormant', 'ended', 'archived'];

const lifecycleStyles: Record<LifecycleState, string> = {
  active: 'border-emerald-800/70 bg-emerald-950/20 text-emerald-300',
  dormant: 'border-amber-800/70 bg-amber-950/20 text-amber-300',
  ended: 'border-sky-800/70 bg-sky-950/20 text-sky-300',
  archived: 'border-zinc-700 bg-zinc-800/60 text-zinc-400',
};

type SortKey = 'default' | 'name' | 'energy' | 'evidence';

const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'default', label: 'State' },
  { key: 'name', label: 'Name' },
  { key: 'energy', label: 'Energy' },
  { key: 'evidence', label: 'Evidence' },
];

function sortProjects(projects: CurrentProjectCard[], sortKey: SortKey): CurrentProjectCard[] {
  const sorted = [...projects];
  switch (sortKey) {
    case 'name':
      sorted.sort((a, b) => a.summary.localeCompare(b.summary));
      break;
    case 'energy':
      sorted.sort((a, b) => b.energy - a.energy);
      break;
    case 'evidence':
      sorted.sort((a, b) => b.evidenceCount - a.evidenceCount);
      break;
    case 'default':
    default:
      break; // keep insertion order (lifecycle then db)
  }
  return sorted;
}

export function CurrentProjects({ projects }: { projects: CurrentProjectCard[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('default');

  const sortedProjects = useMemo(() => sortProjects(projects, sortKey), [projects, sortKey]);

  if (projects.length === 0) {
    return (
      <section aria-label="Current Projects">
        <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <p className="text-sm text-zinc-400">No current project snapshots yet.</p>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Current Projects" className="space-y-8">
      {/* Sort controls */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Sort by:</span>
        <div className="flex flex-wrap gap-1">
          {sortOptions.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                sortKey === key
                  ? 'bg-emerald-800/60 text-emerald-200'
                  : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped or flat list depending on sort */}
      {sortKey === 'default' ? (
        lifecycleOrder.map((state) => {
          const groupedProjects = sortedProjects.filter((project) => project.lifecycleState === state);
          if (groupedProjects.length === 0) return null;

          return (
            <div key={state} className="space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold capitalize text-zinc-200">{state}</h2>
                <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs text-zinc-400">
                  {groupedProjects.length}
                </span>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {groupedProjects.map((project) => (
                  <ProjectCard key={project.projectId} project={project} />
                ))}
              </div>
            </div>
          );
        })
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sortedProjects.map((project) => (
            <ProjectCard key={project.projectId} project={project} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectCard({ project }: { project: CurrentProjectCard }) {
  const latestChange = project.recentChanges[0];

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-base font-semibold text-white">
          <Link
            href={`/projects/${project.projectId}`}
            className="transition hover:text-emerald-300"
          >
            {project.summary}
          </Link>
        </h3>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs capitalize ${lifecycleStyles[project.lifecycleState]}`}
        >
          {project.lifecycleState}
        </span>
      </div>

      {/* Energy bar: only for active projects */}
      {project.lifecycleState === 'active' && (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Energy
            </span>
            <EnergyBar value={project.energy} className="flex-1" showValue />
          </div>
        </div>
      )}

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <ProjectDetail label="Lifecycle rationale" value={project.lifecycleRationale} />
        <ProjectDetail label="Latest change" value={describeChange(latestChange)} />
        <ProjectDetail
          label="Obstacles"
          value={project.obstacles.length > 0 ? project.obstacles.join(', ') : null}
        />
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">Evidence</dt>
          <dd className="mt-1 text-zinc-300">
            {project.evidenceCount} {project.evidenceCount === 1 ? 'source' : 'sources'}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function ProjectDetail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</dt>
      <dd className="mt-1 text-zinc-300">{value ?? 'None recorded'}</dd>
    </div>
  );
}

function describeChange(change: Record<string, unknown> | undefined): string | null {
  if (!change) return null;
  for (const key of ['summary', 'rationale', 'description', 'eventType', 'event_type', 'type']) {
    const value = change[key];
    if (typeof value === 'string' && value.trim()) return value.replaceAll('_', ' ');
  }
  return 'Project state updated';
}
