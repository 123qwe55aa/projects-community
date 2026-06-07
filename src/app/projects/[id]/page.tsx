import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDatabase } from '@/db';
import { projects, decisions, decisionLinks, adoptionSnapshots, candidates } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { NewDecisionForm } from './new-decision-form';
import { ProjectSummary } from '@/components/ProjectSummary';
import { UnresolvedQuestions } from '@/components/UnresolvedQuestions';
import { AdoptionHistory } from '@/components/AdoptionHistory';

export const metadata = {
  title: 'Project Details',
};

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

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db } = getDatabase();

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) notFound();

  // Decisions linked to this project
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

  // Adoption snapshots for this project
  const snapshots = await db
    .select()
    .from(adoptionSnapshots)
    .where(eq(adoptionSnapshots.projectId, id));

  // Candidate names for snapshot display
  const candidateIds = [...new Set(snapshots.map((s) => s.candidateId))];
  const snapshotCandidates =
    candidateIds.length > 0
      ? await db
          .select({ id: candidates.id, name: candidates.name })
          .from(candidates)
          .where(inArray(candidates.id, candidateIds))
      : [];

  const totalDecisions = linkedDecisions.length;
  const resolvedCount = linkedDecisions.filter((d) => d.state === 'decided').length;
  const openCount = linkedDecisions.filter(
    (d) => d.state === 'researching' || d.state === 'deferred'
  ).length;

  return (
    <div className="flex flex-1 flex-col p-8 max-w-5xl mx-auto w-full space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/projects" className="hover:text-zinc-300 transition">Projects</Link>
        <span>/</span>
        <span className="text-zinc-300">{project.summary || 'Project'}</span>
      </div>

      {/* Project Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <h1 className="text-2xl font-bold text-white">
            {project.summary || 'Untitled Project'}
          </h1>
          <div className="flex items-center gap-3 flex-wrap text-xs text-zinc-500">
            <span className="px-2 py-0.5 rounded-full border bg-zinc-800 text-zinc-400 border-zinc-700">
              {styleLabels[project.buildingStyle ?? ''] || project.buildingStyle}
            </span>
            <span className="capitalize">{project.growthStage || 'seed'} stage</span>
            <span className="text-zinc-600">·</span>
            <span>
              {totalDecisions} decisions · {resolvedCount} resolved · {openCount} open
            </span>
          </div>
        </div>
        <NewDecisionForm projectId={project.id} />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          <ProjectSummary project={project} />

          {/* All Decisions */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
            <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
              Decisions ({totalDecisions})
            </h2>

            {linkedDecisions.length === 0 ? (
              <p className="text-sm text-zinc-500 italic">
                No decisions yet. Add one to start structuring your choices.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {linkedDecisions.map((decision) => {
                  const badge = stateBadge[decision.state] || stateBadge.researching;
                  return (
                    <li key={decision.id}>
                      <Link
                        href={`/decisions/${decision.id}`}
                        className="group flex items-center justify-between gap-3 rounded-md px-3 py-2 hover:bg-zinc-800 transition"
                      >
                        <span className="text-sm text-zinc-300 group-hover:text-white line-clamp-1 flex-1">
                          {decision.question}
                        </span>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${badge.classes}`}
                        >
                          {badge.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <UnresolvedQuestions decisions={linkedDecisions} />
          <AdoptionHistory snapshots={snapshots} candidates={snapshotCandidates} />
        </div>
      </div>
    </div>
  );
}