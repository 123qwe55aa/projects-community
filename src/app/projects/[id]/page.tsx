import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDatabase } from '@/db';
import { projects, decisions, decisionLinks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { NewDecisionForm } from './new-decision-form';

export const metadata = {
  title: 'Project Details',
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db } = getDatabase();

  const [project] = await db.select().from(projects).where(eq(projects.id, id));

  if (!project) {
    notFound();
  }

  // Get all decisions linked to this project
  const linkedDecisions = await db
    .select({
      id: decisions.id,
      question: decisions.question,
      state: decisions.state,
      scope: decisions.scope,
      createdAt: decisions.createdAt,
    })
    .from(decisionLinks)
    .innerJoin(decisions, eq(decisionLinks.decisionId, decisions.id))
    .where(eq(decisionLinks.projectId, id));

  const styleLabels: Record<string, string> = {
    workshop: '🔨 Workshop',
    'data-center': '📊 Data Center',
    studio: '🎨 Studio',
    'community-hall': '🏛️ Community Hall',
  };

  const stateBadge: Record<string, { label: string; classes: string }> = {
    researching: { label: 'Researching', classes: 'bg-yellow-900/40 text-yellow-400 border-yellow-700' },
    deferred: { label: 'Deferred', classes: 'bg-zinc-800 text-zinc-400 border-zinc-600' },
    decided: { label: 'Decided', classes: 'bg-green-900/40 text-green-400 border-green-700' },
    archived: { label: 'Archived', classes: 'bg-zinc-800 text-zinc-500 border-zinc-700' },
  };

  return (
    <div className="flex flex-1 flex-col p-8 max-w-4xl mx-auto w-full space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/projects" className="hover:text-zinc-300 transition">Projects</Link>
        <span>/</span>
        <span className="text-zinc-300">{project.summary || 'Project'}</span>
      </div>

      {/* Project Header */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-white">
              {project.summary || 'Untitled Project'}
            </h1>
            <div className="flex items-center gap-3 text-sm text-zinc-500">
              <span className="px-2 py-0.5 rounded-full border bg-zinc-800 text-zinc-400 border-zinc-700 text-xs">
                {styleLabels[project.buildingStyle ?? ''] || project.buildingStyle}
              </span>
              <span className="capitalize">{project.growthStage || 'seed'} stage</span>
            </div>
          </div>
          <NewDecisionForm projectId={project.id} />
        </div>

        {project.background && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-sm text-zinc-400 font-medium mb-1">Background</p>
            <p className="text-sm text-zinc-300 whitespace-pre-wrap">{project.background}</p>
          </div>
        )}
      </div>

      {/* Decisions */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">
          Decisions ({linkedDecisions.length})
        </h2>

        {linkedDecisions.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-center">
            <p className="text-zinc-500">No decisions yet</p>
            <p className="text-sm text-zinc-600 mt-1">Add a decision to start structuring your choices</p>
          </div>
        ) : (
          <div className="space-y-2">
            {linkedDecisions.map((decision) => {
              const badge = stateBadge[decision.state] || stateBadge.researching;
              return (
                <Link
                  key={decision.id}
                  href={`/decisions/${decision.id}`}
                  className="group flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-600 transition-colors"
                >
                  <span className="text-sm text-zinc-200 group-hover:text-white line-clamp-1">
                    {decision.question}
                  </span>
                  <span
                    className={`shrink-0 ml-3 rounded-full border px-2 py-0.5 text-xs ${badge.classes}`}
                  >
                    {badge.label}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}