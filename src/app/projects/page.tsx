import { Suspense } from 'react';
import Link from 'next/link';
import { getDatabase } from '@/db';
import { projects, decisionLinks } from '@/db/schema';
import { count } from 'drizzle-orm';
import { NewProjectForm } from './new-project-form';
import { DeleteProjectButton } from '@/components/DeleteProjectButton';
import { ProjectsListSkeleton } from '@/components/Skeletons';

export const metadata = {
  title: 'Projects',
};

async function ProjectsList() {
  const { db } = getDatabase();

  const allProjects = await db.select().from(projects).orderBy(projects.createdAt);

  // Get decision counts per project
  const decisionCounts = await db
    .select({
      projectId: decisionLinks.projectId,
      count: count(),
    })
    .from(decisionLinks)
    .groupBy(decisionLinks.projectId);

  const countMap = new Map(decisionCounts.map((r) => [r.projectId, r.count]));

  if (allProjects.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <div className="text-center space-y-5 max-w-sm">
          <div className="text-6xl">🏗️</div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-white">No projects yet</h2>
            <p className="text-zinc-500 text-sm">
              Create your first project to start organizing your research. Each project gets its own building on the community map.
            </p>
          </div>
          <NewProjectForm />
        </div>
      </div>
    );
  }

  const styleLabels: Record<string, string> = {
    workshop: '🔨 Workshop',
    'data-center': '📊 Data Center',
    studio: '🎨 Studio',
    'community-hall': '🏛️ Community Hall',
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {allProjects.map((project) => (
        <div
          key={project.id}
          className="group rounded-lg border border-zinc-800 bg-zinc-900 p-5 space-y-3 hover:border-zinc-600 transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/projects/${project.id}`}
              className="flex-1 min-w-0"
            >
              <h3 className="font-semibold text-white group-hover:text-zinc-200 line-clamp-2">
                {project.summary || project.background || 'Untitled Project'}
              </h3>
            </Link>
            <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
              {styleLabels[project.buildingStyle ?? ''] || project.buildingStyle}
            </span>
            <DeleteProjectButton projectId={project.id} />
          </div>
          {project.background && project.background !== project.summary && (
            <p className="text-sm text-zinc-500 line-clamp-2">{project.background}</p>
          )}
          <div className="flex items-center justify-between gap-3 text-xs text-zinc-600">
            <div className="flex items-center gap-3">
              <span className="capitalize">{project.growthStage || 'seed'}</span>
              <span>·</span>
              <span>{countMap.get(project.id) ?? 0} decisions</span>
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

export default async function ProjectsPage() {
  return (
    <div className="flex flex-1 flex-col p-8 max-w-6xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-sm text-zinc-500 mt-1">Organize your research around meaningful goals</p>
        </div>
        <NewProjectForm />
      </div>

      <Suspense fallback={<ProjectsListSkeleton />}>
        <ProjectsList />
      </Suspense>
    </div>
  );
}
