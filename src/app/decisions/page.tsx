import Link from 'next/link';
import { Suspense } from 'react';
import { getDatabase } from '@/db';
import { decisions, projects, decisionLinks } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { NewDecisionForm } from './new-decision-form';
import { StateFilterTabs } from './state-filter-tabs';

export const metadata = {
  title: 'Decisions',
};

const stateBadge: Record<string, { label: string; classes: string }> = {
  researching: { label: 'Researching', classes: 'bg-yellow-900/40 text-yellow-400 border-yellow-700' },
  deferred: { label: 'Deferred', classes: 'bg-zinc-800 text-zinc-400 border-zinc-600' },
  decided: { label: 'Decided', classes: 'bg-green-900/40 text-green-400 border-green-700' },
  archived: { label: 'Archived', classes: 'bg-zinc-800 text-zinc-500 border-zinc-700' },
};

const scopeBadge: Record<string, { label: string; classes: string }> = {
  independent: { label: 'Independent', classes: 'bg-blue-900/40 text-blue-400 border-blue-700' },
  project: { label: 'Project', classes: 'bg-purple-900/40 text-purple-400 border-purple-700' },
  global: { label: 'Global', classes: 'bg-rose-900/40 text-rose-400 border-rose-700' },
};

async function DecisionsList({ filter }: { filter: string | null }) {
  const { db } = getDatabase();

  const allDecisions = filter
    ? await db.select().from(decisions).where(eq(decisions.state, filter)).orderBy(desc(decisions.createdAt))
    : await db.select().from(decisions).orderBy(desc(decisions.createdAt));

  // Fetch all projects for linking and for the new-decision form
  const allProjects = await db.select().from(projects).orderBy(projects.createdAt);

  // Build a project lookup map
  const projectMap = new Map(allProjects.map((p) => [p.id, p]));

  // Get decision-project links
  const allLinks = await db.select().from(decisionLinks);
  const linkMap = new Map<string, string>(); // decisionId -> projectId
  for (const link of allLinks) {
    if (link.projectId) {
      linkMap.set(link.decisionId, link.projectId);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Decisions</h1>
          <p className="text-sm text-zinc-500 mt-1">Track and compare your choices</p>
        </div>
        <NewDecisionForm projects={allProjects} />
      </div>

      <Suspense fallback={<div className="h-9 rounded-lg bg-zinc-900" />}>
        <StateFilterTabs />
      </Suspense>

      {allDecisions.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <div className="text-center space-y-3">
            <p className="text-zinc-500">No decisions yet</p>
            <p className="text-sm text-zinc-600">
              {filter ? `No ${filter} decisions found` : 'Create your first decision to get started'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {allDecisions.map((decision) => {
            const badge = stateBadge[decision.state] || stateBadge.researching;
            const scope = scopeBadge[decision.scope] || scopeBadge.independent;
            const linkedProjectId = decision.projectId || linkMap.get(decision.id);
            const linkedProject = linkedProjectId ? projectMap.get(linkedProjectId) : null;

            return (
              <Link
                key={decision.id}
                href={`/decisions/${decision.id}`}
                className="group flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-600 transition-colors"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <span className="text-sm text-zinc-200 group-hover:text-white line-clamp-2">
                    {decision.question}
                  </span>
                  {linkedProject && (
                    <span className="block text-xs text-zinc-500">
                      Project: {linkedProject.summary || linkedProject.background?.slice(0, 40) || linkedProject.id}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${scope.classes}`}
                  >
                    {scope.label}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${badge.classes}`}
                  >
                    {badge.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

export default async function DecisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;

  return (
    <div className="flex flex-1 flex-col p-8 max-w-4xl mx-auto w-full space-y-6">
      <Suspense fallback={<div className="text-zinc-500">Loading...</div>}>
        <DecisionsList filter={state || null} />
      </Suspense>
    </div>
  );
}