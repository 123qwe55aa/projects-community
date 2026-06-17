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

// ── City-district theme mapping ──────────────────────────────────────

type District = 'all' | 'active' | 'dormant' | 'ended' | 'archived';

const DISTRICT_META: Record<string, { label: string; emoji: string; tagline: string }> = {
  all:      { label: 'All Districts',          emoji: '🏙️', tagline: '全景城市' },
  active:   { label: 'Operating',              emoji: '🌆', tagline: '營運中．生機勃勃' },
  dormant:  { label: 'Dormant',                emoji: '🌙', tagline: '休眠區．靜待更新' },
  ended:    { label: 'Ended',                  emoji: '🏚️', tagline: '終結區．歷史留痕' },
  archived: { label: 'Archived',               emoji: '📦', tagline: '歸檔區．城市記憶' },
};

const GROWTH_DISTRICT: Record<string, { label: string; icon: string; description: string }> = {
  seed:     { label: '規劃區 Planning',        icon: '📐', description: '骨架未成，藍圖先行' },
  seedling: { label: '建設區 Building',        icon: '🏗️', description: '功能漸立，雛形初現' },
  growing:  { label: '成長區 Growth',          icon: '🌱', description: '密度提升，秩序為王' },
  thriving: { label: '繁榮區 CBD',             icon: '🏙️', description: '風格成熟，氣質自成' },
  mature:   { label: '成熟區 Heritage',        icon: '🏛️', description: '經典沉澱，持續迭代' },
};

const DISTRICT_CARD_STYLE: Record<string, string> = {
  active:   'border-emerald-800/50 bg-emerald-950/10 hover:border-emerald-700/60',
  dormant:  'border-amber-800/40 bg-amber-950/10 hover:border-amber-700/50',
  ended:    'border-sky-800/40 bg-sky-950/10 hover:border-sky-700/50',
  archived: 'border-zinc-700/50 bg-zinc-800/30 hover:border-zinc-600/50',
};

const GROWTH_CARD_ACCENT: Record<string, string> = {
  seed:     'border-l-2 border-l-blue-500/60',
  seedling: 'border-l-2 border-l-amber-500/60',
  growing:  'border-l-2 border-l-green-500/60',
  thriving: 'border-l-2 border-l-emerald-500/60',
  mature:   'border-l-2 border-l-teal-500/60',
};

function growthStageBadge(stage: string) {
  const d = GROWTH_DISTRICT[stage];
  if (!d) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800/70 px-2 py-0.5 text-[11px] text-zinc-400">
      <span>{d.icon}</span>
      <span>{d.label}</span>
    </span>
  );
}

function lifecycleBadge(state: string | null) {
  if (!state) return null;
  const colors: Record<string, string> = {
    active:   'border-emerald-800/60 bg-emerald-950/30 text-emerald-300',
    dormant:  'border-amber-800/60 bg-amber-950/30 text-amber-300',
    ended:    'border-sky-800/60 bg-sky-950/30 text-sky-300',
    archived: 'border-zinc-700/60 bg-zinc-800/60 text-zinc-400',
  };
  const icons: Record<string, string> = {
    active:   '●',
    dormant:  '◐',
    ended:    '○',
    archived: '◻',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${colors[state] ?? 'border-zinc-700 text-zinc-500'}`}>
      <span className="text-[10px]">{icons[state] ?? '◇'}</span>
      <span>{state}</span>
    </span>
  );
}

// ── Sort ─────────────────────────────────────────────────────────────

type SortKey = 'energy' | 'name-asc' | 'name-desc' | 'newest' | 'oldest' | 'decisions';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'energy', label: 'Energy' },
  { key: 'name-asc', label: 'Name A-Z' },
  { key: 'name-desc', label: 'Name Z-A' },
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'decisions', label: 'Most decisions' },
];

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
    default:
      return sorted;
  }
}

// ── Component ────────────────────────────────────────────────────────

export function ProjectsListClient({ refreshKey = 0 }: { refreshKey?: number }) {
  const [projects, setProjects] = useState<ProjectItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('energy');
  const [district, setDistrict] = useState<District>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setProjects(null);
    setError(null);
    fetch('/api/projects/list')
      .then((r) => r.json())
      .then((data) => setProjects(data.projects))
      .catch((e) => setError(e.message));
  }, [refreshKey, localRefresh]);

  const districts: District[] = ['all', 'active', 'dormant', 'ended', 'archived'];

  const filtered = useMemo(() => {
    if (!projects) return [];
    let result = projects;
    if (district !== 'all') {
      result = result.filter((p) => (p.lifecycleState ?? 'active') === district);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (p) =>
          p.summary.toLowerCase().includes(q) ||
          (p.background ?? '').toLowerCase().includes(q),
      );
    }
    return sortProjects(result, sortKey);
  }, [projects, district, searchQuery, sortKey]);

  // ── Error state ────────────────────────────────────────────────────

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

  // ── Loading state ──────────────────────────────────────────────────

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

  // ── Empty state ────────────────────────────────────────────────────

  if (projects.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <div className="text-center space-y-5 max-w-sm">
          <div className="text-6xl">🏗️</div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-white">No projects yet</h2>
            <p className="text-zinc-500 text-sm">
              Create your first project to start building your city.
            </p>
          </div>
          <NewProjectForm />
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────

  const districtMeta = DISTRICT_META[district] ?? DISTRICT_META.all;
  const districtCount =
    district === 'all'
      ? projects.length
      : projects.filter((p) => (p.lifecycleState ?? 'active') === district).length;

  return (
    <div className="space-y-6">
      {/* District header */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{districtMeta.emoji}</span>
          <div>
            <h2 className="text-base font-semibold text-white">{districtMeta.label}</h2>
            <p className="text-xs text-zinc-500">{districtMeta.tagline} · {districtCount} project{districtCount !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Toolbar: search + district pills + sort */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[160px] max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">🔍</span>
          <input
            type="text"
            placeholder="Search districts…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 py-2 pl-8 pr-3 text-sm text-zinc-300 placeholder-zinc-600 outline-none focus:border-zinc-600"
          />
        </div>

        {/* District filter pills */}
        <div className="flex flex-wrap gap-1">
          {districts.map((d) => (
            <button
              key={d}
              onClick={() => setDistrict(d)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                district === d
                  ? 'bg-emerald-800/60 text-emerald-200'
                  : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              {DISTRICT_META[d]?.emoji} {DISTRICT_META[d]?.label ?? d}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2 ml-auto">
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

      {/* Project grid */}
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-zinc-500">
            {searchQuery
              ? `No projects match "${searchQuery}" in this district.`
              : 'No projects in this district.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((project) => {
            const state = project.lifecycleState ?? 'active';
            const stage = project.growthStage ?? 'seed';
            const districtStyle = DISTRICT_CARD_STYLE[state] ?? 'border-zinc-800 bg-zinc-900 hover:border-zinc-600';
            const accentStyle = GROWTH_CARD_ACCENT[stage] ?? '';

            return (
              <div
                key={project.id}
                className={`group relative rounded-lg border p-5 space-y-3 transition-colors ${districtStyle} ${accentStyle}`}
              >
                <HoverPreview project={project} />

                {/* Top row: lifecycle badge + growth-stage pill */}
                <div className="flex flex-wrap items-center gap-2">
                  {lifecycleBadge(state)}
                  {growthStageBadge(stage)}
                </div>

                {/* Title */}
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex-1 min-w-0"
                  >
                    <h3 className="font-semibold text-white group-hover:text-zinc-200 line-clamp-2">
                      {project.summary}
                    </h3>
                  </Link>
                  <DeleteProjectButton
                    projectId={project.id}
                    onDeleted={() => setLocalRefresh((k) => k + 1)}
                  />
                </div>

                {/* Energy bar (active only) */}
                {project.lifecycleState === 'active' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Energy</span>
                    <EnergyBar value={project.energy} className="flex-1" showValue />
                  </div>
                )}

                {/* Background excerpt */}
                {project.background && (
                  <p className="text-sm text-zinc-500 line-clamp-2">{project.background}</p>
                )}

                {/* Footer metadata */}
                <div className="flex items-center justify-between gap-3 text-xs text-zinc-600">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px]">{project.buildingStyle}</span>
                    <span>·</span>
                    <span>{project.decisionCount} decision{project.decisionCount !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] opacity-60">{lifecycleDistrictIcon(state)}</span>
                    <Link
                      href={`/projects/${project.id}/dashboard`}
                      className="text-zinc-500 hover:text-zinc-300 transition"
                      title="Dashboard"
                    >
                      📊
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function lifecycleDistrictIcon(state: string): string {
  const icons: Record<string, string> = {
    active:   '🌆',
    dormant:  '🌙',
    ended:    '🏚️',
    archived: '📦',
  };
  return icons[state] ?? '🏙️';
}
