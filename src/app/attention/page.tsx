import { desc, eq, inArray } from 'drizzle-orm';
import { getDatabase } from '@/db';
import { corrections, projectEvents, projects } from '@/db/schema';
import { getNeedsAttention } from '@/lib/v2/queries';
import {
  confirmDecisionSuggestionAction,
  confirmObservationAction,
  dismissDecisionSuggestionAction,
  ignoreObservationAction,
} from '../v2-actions';

export const metadata = {
  title: 'Needs Attention',
};

export const dynamic = 'force-dynamic';

export default async function AttentionPage() {
  const { db } = getDatabase();
  const [items, allProjects, decisionSuggestions] = await Promise.all([
    getNeedsAttention(),
    db.select().from(projects).orderBy(projects.createdAt),
    getPendingDecisionSuggestions(),
  ]);

  if (items.length === 0 && decisionSuggestions.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center p-8">
        <div className="max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400">
            Needs attention
          </p>
          <h1 className="mt-3 text-2xl font-bold text-white">Nothing needs review</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Hermes observations and Decision suggestions are all accounted for.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 p-6 sm:p-8">
      <header className="border-b border-zinc-800 pb-6">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400">
          Hermes review queue
        </p>
        <h1 className="mt-2 text-3xl font-bold text-white">Needs Attention</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Confirm Hermes&apos;s proposed assignments, reassign them, or preserve them as ignored
          evidence.
        </p>
      </header>

      {items.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Observations</h2>
          {items.map((item) => (
            <article
              key={item.observationId}
              className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900 p-5"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span className="rounded-full bg-zinc-800 px-2 py-1 uppercase tracking-wide">
                    {item.type}
                  </span>
                  <span>
                    Hermes source: {item.sourceConversationRef} / {item.sourceMessageRef}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-white">{item.summary}</h3>
                <blockquote className="border-l-2 border-emerald-500/60 pl-3 text-sm text-zinc-300">
                  &quot;{shortQuote(item.sourceQuote)}&quot;
                </blockquote>
              </div>

              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <Detail
                  label="Proposed assignment"
                  value={item.proposedProjectSummary ?? item.proposedProjectId ?? 'Unassigned'}
                />
                <Detail
                  label="Confidence"
                  value={
                    item.assignmentConfidence === null
                      ? 'Not provided'
                      : `${item.assignmentConfidence}%`
                  }
                />
                <Detail label="Rationale" value={item.assignmentRationale ?? 'Not provided'} />
              </dl>

              <div className="flex flex-wrap gap-3 border-t border-zinc-800 pt-4">
                {item.proposedProjectId && (
                  <form action={confirmObservationAction}>
                    <input type="hidden" name="observationId" value={item.observationId} />
                    <input type="hidden" name="projectId" value={item.proposedProjectId} />
                    <ActionButton label="Confirm" />
                  </form>
                )}
                <form action={confirmObservationAction} className="flex flex-wrap gap-2">
                  <input type="hidden" name="observationId" value={item.observationId} />
                  <label className="sr-only" htmlFor={`${item.observationId}-reassign-project`}>
                    Reassign {item.summary} to a Project
                  </label>
                  <select
                    id={`${item.observationId}-reassign-project`}
                    name="projectId"
                    required
                    defaultValue=""
                    className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
                  >
                    <option value="" disabled>
                      Reassign to...
                    </option>
                    {allProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.summary ?? project.background ?? project.id}
                      </option>
                    ))}
                  </select>
                  <ActionButton label="Reassign" />
                </form>
                <form action={ignoreObservationAction}>
                  <input type="hidden" name="observationId" value={item.observationId} />
                  <ActionButton label="Ignore" subdued />
                </form>
              </div>
            </article>
          ))}
        </section>
      )}

      {decisionSuggestions.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Decision Suggestions</h2>
          {decisionSuggestions.map((suggestion) => (
            <article
              key={suggestion.eventId}
              className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5"
            >
              <div>
                <p className="text-xs uppercase tracking-wide text-emerald-400">
                  Hermes suggestion for {suggestion.projectSummary}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-white">{suggestion.question}</h3>
                <p className="mt-2 text-sm text-zinc-400">{suggestion.rationale}</p>
              </div>
              <div className="flex flex-wrap gap-3 border-t border-zinc-800 pt-4">
                <form action={confirmDecisionSuggestionAction}>
                  <input type="hidden" name="eventId" value={suggestion.eventId} />
                  <input type="hidden" name="projectId" value={suggestion.projectId} />
                  <ActionButton label="Confirm Decision" />
                </form>
                <form action={dismissDecisionSuggestionAction} className="flex flex-wrap gap-2">
                  <input type="hidden" name="eventId" value={suggestion.eventId} />
                  <input type="hidden" name="projectId" value={suggestion.projectId} />
                  <label className="sr-only" htmlFor={`${suggestion.eventId}-dismiss-rationale`}>
                    Dismissal rationale for {suggestion.question}
                  </label>
                  <input
                    id={`${suggestion.eventId}-dismiss-rationale`}
                    name="rationale"
                    required
                    placeholder="Why dismiss this suggestion?"
                    className="min-w-64 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
                  />
                  <ActionButton label="Dismiss" subdued />
                </form>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

async function getPendingDecisionSuggestions() {
  const { db } = getDatabase();
  const suggestions = await db
    .select()
    .from(projectEvents)
    .where(eq(projectEvents.eventType, 'decision_suggested'))
    .orderBy(desc(projectEvents.occurredAt), desc(projectEvents.id));
  if (suggestions.length === 0) return [];

  const [reviewRows, projectRows] = await Promise.all([
    db
      .select()
      .from(corrections)
      .where(inArray(corrections.targetId, suggestions.map(({ id }) => id))),
    db
      .select()
      .from(projects)
      .where(inArray(projects.id, suggestions.map(({ projectId }) => projectId))),
  ]);
  const reviewedEventIds = new Set(
    reviewRows
      .filter(
        ({ targetType, correctionType }) =>
          targetType === 'project_event' &&
          (correctionType === 'decision_suggestion_confirmed' ||
            correctionType === 'decision_suggestion_dismissed'),
      )
      .map(({ targetId }) => targetId),
  );
  const projectsById = new Map(projectRows.map((project) => [project.id, project]));

  return suggestions
    .filter(({ id }) => !reviewedEventIds.has(id))
    .map((suggestion) => ({
      eventId: suggestion.id,
      projectId: suggestion.projectId,
      projectSummary:
        projectsById.get(suggestion.projectId)?.summary ?? suggestion.projectId,
      question: payloadQuestion(suggestion.payload),
      rationale: suggestion.rationale ?? 'Hermes identified a pending Decision.',
    }));
}

function payloadQuestion(payloadJson: string) {
  try {
    const payload = JSON.parse(payloadJson) as unknown;
    if (
      typeof payload === 'object' &&
      payload !== null &&
      !Array.isArray(payload) &&
      typeof (payload as Record<string, unknown>).question === 'string'
    ) {
      return (payload as Record<string, string>).question;
    }
  } catch {
    // Persisted malformed suggestions remain reviewable with fallback text.
  }
  return 'Review this Decision suggestion';
}

function shortQuote(quote: string) {
  return quote.length > 240 ? `${quote.slice(0, 237)}...` : quote;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-zinc-300">{value}</dd>
    </div>
  );
}

function ActionButton({ label, subdued = false }: { label: string; subdued?: boolean }) {
  return (
    <button
      type="submit"
      className={
        subdued
          ? 'rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500'
          : 'rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400'
      }
    >
      {label}
    </button>
  );
}
