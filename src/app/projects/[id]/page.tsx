import Link from 'next/link';
import { notFound } from 'next/navigation';
import { inArray } from 'drizzle-orm';
import { AdoptionHistory } from '@/components/AdoptionHistory';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ProjectGovernance } from '@/components/v2/ProjectGovernance';
import { ProjectRelationships } from '@/components/v2/ProjectRelationships';
import {
  ProjectSnapshotPanel,
  type ProjectSnapshotView,
} from '@/components/v2/ProjectSnapshotPanel';
import { ProjectTimeline } from '@/components/v2/ProjectTimeline';
import { getDatabase } from '@/db';
import { adoptionSnapshots, candidates } from '@/db/schema';
import { getProjectWithDecisions } from '@/db/queries';
import { getCurrentProjectSnapshot } from '@/lib/v2/projection/project';
import {
  getProjectRelationships,
  getProjectGovernanceContext,
  getProjectTimeline,
  type LifecycleState,
} from '@/lib/v2/queries';

export const metadata = {
  title: 'Project Details',
};

export const dynamic = 'force-dynamic';

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
  const [projectWithDecisions, snapshot, timeline, relationships, governance] = await Promise.all([
    getProjectWithDecisions(id),
    getCurrentProjectSnapshot(id),
    getProjectTimeline(id),
    getProjectRelationships(id),
    getProjectGovernanceContext(id),
  ]);
  if (!projectWithDecisions) notFound();

  const adoptionRows = await db
    .select()
    .from(adoptionSnapshots)
    .where(inArray(adoptionSnapshots.projectId, [id]));
  const candidateIds = [...new Set(adoptionRows.map(({ candidateId }) => candidateId))];
  const adoptionCandidates = candidateIds.length > 0
    ? await db
        .select({ id: candidates.id, name: candidates.name })
        .from(candidates)
        .where(inArray(candidates.id, candidateIds))
    : [];
  const { project, decisions } = projectWithDecisions;
  const currentSnapshot = snapshotView(snapshot);

  return (
    <ErrorBoundary>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 p-6 sm:p-8">
        <header className="space-y-4 border-b border-zinc-800 pb-6">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Link href="/projects" className="transition hover:text-zinc-300">Projects</Link>
            <span>/</span>
            <span className="truncate text-zinc-300">{projectName(project)}</span>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400">
              Evidence-backed Project
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">{projectName(project)}</h1>
            {project.background && project.background !== project.summary && (
              <p className="mt-2 max-w-3xl text-sm text-zinc-400">{project.background}</p>
            )}
          </div>
        </header>
        <ProjectSnapshotPanel snapshot={currentSnapshot} />
        <ProjectTimeline items={timeline} />
        <ProjectRelationships relationships={relationships} />
        <ProjectGovernance
          project={project}
          governance={governance}
          currentLifecycleState={currentSnapshot?.lifecycleState ?? 'active'}
        />

        {decisions.length > 0 && (
          <section aria-labelledby="project-decisions-heading" className="space-y-4">
            <h2 id="project-decisions-heading" className="text-xl font-semibold text-white">
              Decisions ({decisions.length})
            </h2>
            <ul className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
              {decisions.map((decision) => {
                const badge = stateBadge[decision.state] ?? stateBadge.researching;
                return (
                  <li key={decision.id}>
                    <Link
                      href={`/decisions/${decision.id}`}
                      className="flex items-center justify-between gap-3 p-4 transition hover:bg-zinc-800/70"
                    >
                      <span className="text-sm text-zinc-200">{decision.question}</span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${badge.classes}`}>
                        {badge.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {adoptionRows.length > 0 && (
          <section aria-label="Project adoption history">
            <AdoptionHistory snapshots={adoptionRows} candidates={adoptionCandidates} />
          </section>
        )}
      </main>
    </ErrorBoundary>
  );
}

function snapshotView(
  snapshot: Awaited<ReturnType<typeof getCurrentProjectSnapshot>>,
): ProjectSnapshotView | null {
  if (!snapshot) return null;
  return {
    summary: snapshot.summary,
    lifecycleState: snapshot.lifecycleState as LifecycleState,
    lifecycleRationale: snapshot.lifecycleRationale,
    activeThemes: parseStringArray(snapshot.activeThemes),
    obstacles: parseStringArray(snapshot.obstacles),
    unresolvedQuestions: parseStringArray(snapshot.unresolvedQuestions),
    recentChanges: parseObjectArray(snapshot.recentChanges),
  };
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function parseObjectArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is Record<string, unknown> => (
          typeof item === 'object' && item !== null && !Array.isArray(item)
        ))
      : [];
  } catch {
    return [];
  }
}

function projectName(project: { id: string; summary: string | null; background: string | null }) {
  return project.summary ?? project.background ?? project.id;
}
