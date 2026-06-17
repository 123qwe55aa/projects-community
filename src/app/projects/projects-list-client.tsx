'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DeleteProjectButton } from '@/components/DeleteProjectButton';
import { NewProjectForm } from './new-project-form';
import { HoverPreview } from './hover-preview';
import { EnergyBar } from '@/components/ui/EnergyBar';

export interface ProjectItem {
  id: string;
  summary: string;
  background: string | null;
  buildingStyle: string;
  growthStage: string;
  decisionCount: number;
  observationCount: number;
  createdAt: string | number | null;
  imageUrl: string | null;
  deployUrl: string | null;
  lifecycleState: string | null;
  lifecycleRationale: string | null;
  energy: number;
}

type SortKey = 'energy' | 'name-asc' | 'name-desc' | 'newest' | 'oldest' | 'decisions';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'energy', label: 'Energy' },
  { key: 'name-asc', label: 'Name A-Z' },
  { key: 'name-desc', label: 'Name Z-A' },
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'decisions', label: 'Most decisions' },
];

const LIFECYCLE_ORDER = ['active', 'dormant', 'ended', 'archived'] as const;

const lifecycleStyles: Record<string, string> = {
  active: 'border-emerald-800/70 bg-emerald-950/20 text-emerald-300',
  dormant: 'border-amber-800/70 bg-amber-950/20 text-amber-300',
  ended: 'border-sky-800/70 bg-sky-950/20 text-sky-300',
  archived: 'border-zinc-700 bg-zinc-800/60 text-zinc-400',
};

function sortProjects(projects: ProjectItem[], key: SortKey): ProjectItem[] {
  const sorted = [...projects];
  switch (key) {
    case 'energy':
      return sorted.sort((a, b) => b.energy - a.energy);
    case 'name-asc':
      return sorted.sort((a, b) => a.summary.localeCompare(b.summary));
    case 'name-desc':
      return sorted.sort((a, b) => b.summary.localeCompare(a.summary));
    case 'newest':
      return sorted.sort((a, b) => (Number(b.createdAt ?? 0)) - (Number(a.createdAt ?? 0)));
    case 'oldest':
      return sorted.sort((a, b) => (Number(a.createdAt ?? 0)) - (Number(b.createdAt ?? 0)));
    case 'decisions':
      return sorted.sort((a, b) => b.decisionCount - a.decisionCount);
  }
}

function formatDate(value: string | number | null): string {
  if (!value) return '—';
  const d = new Date(Number(value) * 1000);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ProjectsListClient({ refreshKey = 0 }: { refreshKey?: number }) {
  const [projects, setProjects] = useState<ProjectItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('energy');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setProjects(null);
    setError(null);
    fetch('/api/projects/list')
      .then((r) => r.json())
      .then((data) => setProjects(data.projects))
      .catch((e) => setError(e.message));
  }, [refreshKey, localRefresh]);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <div className="text-center space-y-4">
          <div className="text-6xl">⚠️</div>
          <p className="text-red-400 text-sm">Failed to load projects: {error}</p>
        </div>
      </div>
    );
  }

  if (!projects) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="animate-pulse rounded-lg border border-zinc-800 bg-zinc-900 p-5 space-y-3">
            <div className="h-4 w-2/3 rounded bg-zinc-800" />
            <div className="h-3 w-full rounded bg-zinc-800/70" />
            <div className="flex gap-3">
              <div className="h-3 w-16 rounded bg-zinc-800" />
              <div className="h-3 w-20 rounded bg-zinc-800" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <div className="text-center space-y-5 max-w-sm">
          <div className="text-6xl">🏗️</div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-white">No projects yet</h2>
            <p className="text-zinc-500 text-sm">
              Create your first project to start organizing your research.
            </p>
          </div>
          <NewProjectForm />
        </div>
      </div>
    );
  }

  // ── Filter + sort ──────────────────────────────────────────────────────
  const filteredProjects = useMemo(() => {
    let pool = projects;
    const q = searchTerm.trim().toLowerCase();
    if (q) {
      pool = pool.filter(
        (p) =>
          p.summary.toLowerCase().includes(q) ||
          (p.background ?? '').toLowerCase().includes(q),
      );
    }
    return sortProjects(pool, sortKey);
  }, [projects, searchTerm, sortKey]);

  // ── Group by lifecycle state ────────────────────────────────────────────
  const groups = useMemo(() => {
    const gs: { state: string; label: string; projects: ProjectItem[] }[] = [];
    for (const state of LIFECYCLE_ORDER) {
      const match = filteredProjects.filter((p) => p.lifecycleState === state);
      if (match.length > 0) gs.push({ state, label: state, projects: match });
    }
    const uncat = filteredProjects.filter(
      (p) => !p.lifecycleState || !(LIFECYCLE_ORDER as readonly string[]).includes(p.lifecycleState),
    );
    if (uncat.length > 0) gs.push({ state: 'uncategorized', label: 'Uncategorized', projects: uncat });
    return gs;
  }, [filteredProjects]);

  return (
    <div className="space-y-8">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          {filteredProjects.length}
          {filteredProjects.length !== projects.length && ` / ${projects.length}`}
          {' '}project{filteredProjects.length !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-44 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 pl-8 text-xs text-zinc-300 placeholder-zinc-600 outline-none focus:border-zinc-600"
            />
            <svg
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"
              >
                ✕
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="sort-projects" className="text-xs text-zinc-500">Sort</label>
            <select
              id="sort-projects"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-zinc-600"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Grouped lifecycle sections ──────────────────────────────────── */}
      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-sm text-zinc-500">No projects match &ldquo;{searchTerm}&rdquo;</p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.state} aria-label={group.label} className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold capitalize text-zinc-200">{group.label}</h2>
              <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs text-zinc-400">
                {group.projects.length}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onDeleted={() => setLocalRefresh((k) => k + 1)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

// ── Project Card ────────────────────────────────────────────────────────────
function ProjectCard({
  project,
  onDeleted,
}: {
  project: ProjectItem;
  onDeleted: () => void;
}) {
  return (
    <article className="group relative rounded-xl border border-zinc-800 bg-zinc-900 p-5 hover:border-zinc-600">
      <HoverPreview project={project} />

      {/* Header row: title + lifecycle badge + delete */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`/projects/${project.id}`}
            className="text-base font-semibold text-white transition hover:text-emerald-300"
          >
            <span className="line-clamp-2">{project.summary}</span>
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {project.lifecycleState && (
            <span
              className={`rounded-full border px-2 py-0.5 text-xs capitalize ${
                lifecycleStyles[project.lifecycleState] ?? 'border-zinc-700 bg-zinc-800/60 text-zinc-400'
              }`}
            >
              {project.lifecycleState}
            </span>
          )}
          <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
            {project.buildingStyle}
          </span>
          <DeleteProjectButton projectId={project.id} onDeleted={onDeleted} />
        </div>
      </div>

      {/* Energy bar (active only) */}
      {project.lifecycleState === 'active' && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Energy</span>
          <EnergyBar value={project.energy} className="flex-1" showValue />
        </div>
      )}

      {/* Structured metadata grid */}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <MetadataItem label="Growth" value={project.growthStage} />
        <MetadataItem label="Decisions" value={String(project.decisionCount)} />
        <MetadataItem label="Observations" value={String(project.observationCount)} />
        <MetadataItem label="Created" value={formatDate(project.createdAt)} />
      </dl>

      {/* Background description */}
      {project.background && (
        <p className="mt-3 text-xs leading-relaxed text-zinc-500 line-clamp-2">
          {project.background}
        </p>
      )}
    </article>
  );
}

// ── Metadata helper ─────────────────────────────────────────────────────────
function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-zinc-300">{value}</dd>
    </div>
  );
}
