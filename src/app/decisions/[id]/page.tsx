import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { getDatabase } from '@/db';
import { decisions, projects, candidates, conversations, decisionLinks, adoptionSnapshots } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { AddCandidateForm } from './add-candidate-form';
import { ChangeStateForm } from './change-state-form';
import { AdoptButton } from './adopt-button';
import { PinnedMessages } from '@/components/PinnedMessages';
import { RecommendationCard } from '@/components/RecommendationCard';

export const metadata = {
  title: 'Decision Details',
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

export default async function DecisionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db } = getDatabase();

  const [decision] = await db.select().from(decisions).where(eq(decisions.id, id));
  if (!decision) notFound();

  // Candidates for this decision
  const decisionCandidates = await db
    .select()
    .from(candidates)
    .where(eq(candidates.decisionId, id))
    .orderBy(candidates.createdAt);

  // Conversations
  const decisionConversations = await db
    .select()
    .from(conversations)
    .where(eq(conversations.contextId, id));

  // Current adoption snapshot
  const allAdoptions = await db
    .select()
    .from(adoptionSnapshots)
    .where(eq(adoptionSnapshots.decisionId, id));
  const currentAdoption = allAdoptions.find((a) => a.isCurrent) ?? null;

  // Adopted candidate
  const adoptedCandidate = currentAdoption
    ? (decisionCandidates.find((c) => c.id === currentAdoption.candidateId) ?? null)
    : null;

  // Project info
  const linkedProject = decision.projectId
    ? (await db.select().from(projects).where(eq(projects.id, decision.projectId)))[0] ?? null
    : null;

  const links = await db
    .select({ projectId: decisionLinks.projectId })
    .from(decisionLinks)
    .where(eq(decisionLinks.decisionId, id));

  const linkedProjectFromLink =
    !decision.projectId && links.length > 0
      ? (await db.select().from(projects).where(eq(projects.id, links[0].projectId)))[0] ?? null
      : null;

  const project = linkedProject || linkedProjectFromLink;

  const badge = stateBadge[decision.state] || stateBadge.researching;
  const scope = scopeBadge[decision.scope] || scopeBadge.independent;

  return (
    <div className="flex flex-1 flex-col p-8 max-w-5xl mx-auto w-full space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/decisions" className="hover:text-zinc-300 transition">Decisions</Link>
        {project && (
          <>
            <span>/</span>
            <Link href={`/projects/${project.id}`} className="hover:text-zinc-300 transition">
              {project.summary || 'Project'}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-zinc-300 truncate max-w-xs">{decision.question}</span>
      </div>

      {/* Decision Header */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2 flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-white">{decision.question}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`rounded-full border px-2 py-0.5 text-xs ${scope.classes}`}>
                {scope.label}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-xs ${badge.classes}`}>
                {badge.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <Link
              href={`/decisions/${decision.id}/chat`}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition"
            >
              Realizer Chat
            </Link>
            {decisionCandidates.length >= 2 && (
              <Link
                href={`/decisions/${decision.id}/compare`}
                className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition"
              >
                Compare
              </Link>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">State:</span>
              <ChangeStateForm decisionId={decision.id} currentState={decision.state} />
            </div>
          </div>
        </div>

        {/* Current Adoption banner */}
        {currentAdoption && adoptedCandidate && (
          <div className="rounded-lg border border-green-800 bg-green-950/30 p-4 space-y-1">
            <p className="text-sm font-medium text-green-400">✓ Current Adoption</p>
            <p className="text-base font-semibold text-white">{adoptedCandidate.name}</p>
            {currentAdoption.reasoning && (
              <p className="text-sm text-green-300/70">{currentAdoption.reasoning}</p>
            )}
          </div>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recommendation card */}
          <Suspense fallback={null}>
            <RecommendationCard decisionId={decision.id} decisionState={decision.state} />
          </Suspense>

          {/* Candidates */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Candidates ({decisionCandidates.length})
              </h2>
              <AddCandidateForm decisionId={decision.id} />
            </div>

            {decisionCandidates.length === 0 ? (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-center">
                <p className="text-zinc-500">No candidates yet</p>
                <p className="text-sm text-zinc-600 mt-1">
                  Add candidates — options you&apos;re considering for this decision
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {decisionCandidates.map((candidate) => {
                  const isAdopted = currentAdoption?.candidateId === candidate.id;
                  return (
                    <div
                      key={candidate.id}
                      className={[
                        'flex items-start justify-between rounded-lg border p-4 gap-3',
                        isAdopted
                          ? 'border-green-800 bg-green-950/20'
                          : 'border-zinc-800 bg-zinc-900',
                      ].join(' ')}
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-white">{candidate.name}</h3>
                        {candidate.currentFormSummary && (
                          <p className="text-sm text-zinc-400 line-clamp-2">
                            {candidate.currentFormSummary}
                          </p>
                        )}
                        <Link
                          href={`/decisions/${decision.id}/chat?candidate=${candidate.id}`}
                          className="inline-block text-xs text-blue-400 hover:text-blue-300 transition"
                        >
                          Chat about this candidate →
                        </Link>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        {isAdopted ? (
                          <span className="rounded-full border border-green-700 bg-green-900/40 px-2 py-0.5 text-xs text-green-400">
                            Adopted
                          </span>
                        ) : (
                          <AdoptButton
                            decisionId={decision.id}
                            candidateId={candidate.id}
                            candidateName={candidate.name}
                            candidateSummary={candidate.currentFormSummary}
                            decisionState={decision.state}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Conversations */}
          {decisionConversations.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-white">
                Conversations ({decisionConversations.length})
              </h2>
              <div className="space-y-2">
                {decisionConversations.map((conv) => (
                  <div
                    key={conv.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                        {conv.contextType}
                      </span>
                      <span className="text-sm text-zinc-300">
                        Conversation {conv.id.slice(0, 8)}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-600">
                      {conv.createdAt ? new Date(conv.createdAt).toLocaleDateString() : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <Suspense fallback={null}>
            <PinnedMessages decisionId={decision.id} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}