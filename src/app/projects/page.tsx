import Link from 'next/link';
import { getDatabase } from '@/db';
import { projects, decisionLinks } from '@/db/schema';
import { count } from 'drizzle-orm';
import { NewProjectForm } from './new-project-form';

export const metadata = {
  title: 'Projects',
};

export default async function ProjectsPage() {
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

  return (
    <div className="flex flex-1 flex-col p-8 max-w-6xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-sm text-zinc-500 mt-1">Organize your research around meaningful goals</p>
        </div>
        <NewProjectForm />
      </div>

      {allProjects.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-zinc-500">No projects yet</p>
            <p className="text-sm text-zinc-600">Create your first project to get started</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {allProjects.map((project) => {
            const styleLabels: Record<string, string> = {
              workshop: '🔨 Workshop',
              'data-center': '📊 Data Center',
              studio: '🎨 Studio',
              'community-hall': '🏛️ Community Hall',
            };
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group rounded-lg border border-zinc-800 bg-zinc-900 p-5 space-y-3 hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-white group-hover:text-zinc-200 line-clamp-2">
                    {project.summary || project.background || 'Untitled Project'}
                  </h3>
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                    {styleLabels[project.buildingStyle ?? ''] || project.buildingStyle}
                  </span>
                </div>
                {project.background && project.background !== project.summary && (
                  <p className="text-sm text-zinc-500 line-clamp-2">{project.background}</p>
                )}
                <div className="flex items-center gap-3 text-xs text-zinc-600">
                  <span className="capitalize">{project.growthStage || 'seed'}</span>
                  <span>·</span>
                  <span>{countMap.get(project.id) ?? 0} decisions</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}