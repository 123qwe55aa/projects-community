'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DeleteProjectButton } from '@/components/DeleteProjectButton';
import { NewProjectForm } from './new-project-form';
import { HoverPreview } from './hover-preview';

export interface ProjectItem {
  id: string;
  summary: string;
  background: string | null;
  buildingStyle: string;
  growthStage: string;
  decisionCount: number;
  observationCount: number;
  createdAt: number | null;
  lifecycleState: string | null;
  lifecycleRationale: string | null;
  obstacles: string | null;
  recentChanges: string | null;
  activeThemes: string | null;
}

export function ProjectsListClient({ refreshKey = 0 }: { refreshKey?: number }) {
  const [projects, setProjects] = useState<ProjectItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);

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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((project) => (
        <div
          key={project.id}
          className="group relative rounded-lg border border-zinc-800 bg-zinc-900 p-5 space-y-3 hover:border-zinc-600 transition-colors"
        >
          <HoverPreview project={project} />

          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/projects/${project.id}`}
              className="flex-1 min-w-0"
            >
              <h3 className="font-semibold text-white group-hover:text-zinc-200 line-clamp-2">
                {project.summary}
              </h3>
            </Link>
            <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
              {project.buildingStyle}
            </span>
            <DeleteProjectButton projectId={project.id} onDeleted={() => setLocalRefresh((k) => k + 1)} />
          </div>
          {project.background && (
            <p className="text-sm text-zinc-500 line-clamp-2">{project.background}</p>
          )}
          <div className="flex items-center justify-between gap-3 text-xs text-zinc-600">
            <div className="flex items-center gap-3">
              <span className="capitalize">{project.growthStage}</span>
              <span>·</span>
              <span>{project.decisionCount} decisions</span>
            </div>
            <Link
              href={`/projects/${project.id}/dashboard`}
              className="text-zinc-500 hover:text-zinc-300 transition"
              title="Dashboard"
            >
              📊
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
