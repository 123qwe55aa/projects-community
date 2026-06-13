import { asc, desc, eq } from 'drizzle-orm';
import { getDatabase } from '@/db';
import {
  corrections,
  eventEvidence,
  hypothesisEvidence,
  observations,
  projectEvents,
  projectHypotheses,
  projectSnapshots,
  projects,
} from '@/db/schema';

export type LifecycleState = 'active' | 'dormant' | 'ended' | 'archived';

export type EvidenceReference = {
  observationId: string;
  summary: string;
  sourceQuote: string;
  sourceConversationRef: string;
  sourceMessageRef: string;
  observedAt: string;
};

export type RecentChange = {
  eventId: string;
  projectId: string;
  projectSummary: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  rationale: string | null;
  actor: string;
  occurredAt: string;
  evidence: EvidenceReference[];
  sourceQuote: string | null;
};

export type CurrentProjectCard = {
  projectId: string;
  summary: string;
  lifecycleState: LifecycleState;
  lifecycleRationale: string | null;
  activeThemes: string[];
  obstacles: string[];
  unresolvedQuestions: string[];
  recentChanges: Array<Record<string, unknown>>;
  evidenceCount: number;
};

export type AttentionItem = {
  observationId: string;
  summary: string;
  type: string;
  sourceQuote: string;
  sourceConversationRef: string;
  sourceMessageRef: string;
  proposedProjectId: string | null;
  proposedProjectSummary: string | null;
  assignmentConfidence: number | null;
  assignmentRationale: string | null;
  observedAt: string;
};

export type HypothesisQuote = EvidenceReference;

export type ProjectHypothesisCard = {
  id: string;
  title: string;
  explanation: string;
  state: string;
  firstSeenAt: string;
  lastSeenAt: string;
  supportingEvidenceCount: number;
  latestQuotes: HypothesisQuote[];
};

export type ProjectTimelineItem = {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  rationale: string | null;
  actor: string;
  occurredAt: string;
  evidence: EvidenceReference[];
};

export async function getDashboardData(): Promise<{
  currentProjects: CurrentProjectCard[];
  needsAttention: AttentionItem[];
  recentChanges: RecentChange[];
  hypotheses: ProjectHypothesisCard[];
}> {
  const [currentProjects, needsAttention, recentChanges, hypotheses] = await Promise.all([
    getCurrentProjects(),
    getNeedsAttention(),
    getRecentChanges(),
    getProjectHypotheses(),
  ]);
  return { currentProjects, needsAttention, recentChanges, hypotheses };
}

export async function getNeedsAttention(): Promise<AttentionItem[]> {
  const db = getDatabase().db;
  const [observationRows, eventRows, evidenceRows, correctionRows, projectRows] =
    await Promise.all([
      db
        .select()
        .from(observations)
        .orderBy(desc(observations.observedAt), desc(observations.recordedAt), desc(observations.id)),
      db.select().from(projectEvents).where(eq(projectEvents.eventType, 'observation_attached')),
      db.select().from(eventEvidence),
      db.select().from(corrections).where(eq(corrections.targetType, 'observation')),
      db.select().from(projects),
    ]);
  const attachmentEventIds = new Set(eventRows.map(({ id }) => id));
  const attachedObservationIds = new Set(
    evidenceRows
      .filter(({ eventId }) => attachmentEventIds.has(eventId))
      .map(({ observationId }) => observationId),
  );
  const reviewedObservationIds = new Set(
    correctionRows
      .filter(({ correctionType }) => isConfirmOrIgnore(correctionType))
      .map(({ targetId }) => targetId),
  );
  const projectsById = new Map(projectRows.map((project) => [project.id, project]));

  return observationRows
    .filter(
      ({ id }) => !attachedObservationIds.has(id) && !reviewedObservationIds.has(id),
    )
    .map((observation) => ({
      observationId: observation.id,
      summary: observation.summary,
      type: observation.type,
      sourceQuote: observation.sourceQuote,
      sourceConversationRef: observation.sourceConversationRef,
      sourceMessageRef: observation.sourceMessageRef,
      proposedProjectId: observation.proposedProjectId,
      proposedProjectSummary: observation.proposedProjectId
        ? (projectsById.get(observation.proposedProjectId)?.summary ?? null)
        : null,
      assignmentConfidence: observation.assignmentConfidence,
      assignmentRationale: observation.assignmentRationale,
      observedAt: observation.observedAt.toISOString(),
    }));
}

export async function getRecentChanges(limit = 20): Promise<RecentChange[]> {
  if (limit <= 0) return [];

  const db = getDatabase().db;
  const events = await db
    .select()
    .from(projectEvents)
    .orderBy(desc(projectEvents.occurredAt), desc(projectEvents.createdAt), desc(projectEvents.id))
    .limit(limit);
  const [projectRows, evidenceRows, observationRows] = await Promise.all([
    db.select().from(projects),
    db.select().from(eventEvidence),
    db.select().from(observations),
  ]);
  const projectsById = new Map(projectRows.map((project) => [project.id, project]));
  const evidenceByEvent = buildEventEvidence(evidenceRows, observationRows);

  return events.map((event) => {
    const evidence = evidenceByEvent.get(event.id) ?? [];
    return {
      eventId: event.id,
      projectId: event.projectId,
      projectSummary: projectsById.get(event.projectId)?.summary ?? null,
      eventType: event.eventType,
      payload: parseObject(event.payload),
      rationale: event.rationale,
      actor: event.actor,
      occurredAt: event.occurredAt.toISOString(),
      evidence,
      sourceQuote: evidence[0]?.sourceQuote ?? null,
    };
  });
}

export async function getProjectHypotheses(): Promise<ProjectHypothesisCard[]> {
  const db = getDatabase().db;
  const [hypotheses, evidenceRows, observationRows] = await Promise.all([
    db
      .select()
      .from(projectHypotheses)
      .where(eq(projectHypotheses.state, 'emerging'))
      .orderBy(desc(projectHypotheses.lastSeenAt), desc(projectHypotheses.id)),
    db.select().from(hypothesisEvidence),
    db.select().from(observations),
  ]);
  const observationsById = new Map(observationRows.map((observation) => [observation.id, observation]));

  return hypotheses.map((hypothesis) => {
    const supportingEvidence = evidenceRows.filter(
      ({ hypothesisId }) => hypothesisId === hypothesis.id,
    );
    const latestQuotes = supportingEvidence
      .flatMap(({ observationId }) => {
        const observation = observationId ? observationsById.get(observationId) : undefined;
        return observation ? [toEvidenceReference(observation)] : [];
      })
      .sort(compareEvidenceNewestFirst)
      .slice(0, 3);

    return {
      id: hypothesis.id,
      title: hypothesis.title,
      explanation: hypothesis.explanation,
      state: hypothesis.state,
      firstSeenAt: hypothesis.firstSeenAt.toISOString(),
      lastSeenAt: hypothesis.lastSeenAt.toISOString(),
      supportingEvidenceCount: supportingEvidence.length,
      latestQuotes,
    };
  });
}

export async function getProjectTimeline(projectId: string): Promise<ProjectTimelineItem[]> {
  const db = getDatabase().db;
  const events = await db
    .select()
    .from(projectEvents)
    .where(eq(projectEvents.projectId, projectId))
    .orderBy(desc(projectEvents.occurredAt), desc(projectEvents.createdAt), desc(projectEvents.id));
  if (events.length === 0) return [];

  const [evidenceRows, observationRows] = await Promise.all([
    db.select().from(eventEvidence),
    db.select().from(observations),
  ]);
  const evidenceByEvent = buildEventEvidence(evidenceRows, observationRows);

  return events.map((event) => ({
    eventId: event.id,
    eventType: event.eventType,
    payload: parseObject(event.payload),
    rationale: event.rationale,
    actor: event.actor,
    occurredAt: event.occurredAt.toISOString(),
    evidence: evidenceByEvent.get(event.id) ?? [],
  }));
}

async function getCurrentProjects(): Promise<CurrentProjectCard[]> {
  const db = getDatabase().db;
  const [snapshotRows, evidenceRows, eventRows] = await Promise.all([
    db
      .select()
      .from(projectSnapshots)
      .where(eq(projectSnapshots.isCurrent, true))
      .orderBy(desc(projectSnapshots.createdAt), asc(projectSnapshots.projectId)),
    db.select().from(eventEvidence),
    db.select().from(projectEvents),
  ]);
  const projectIdByEventId = new Map(eventRows.map((event) => [event.id, event.projectId]));
  const evidenceByProjectId = new Map<string, Set<string>>();
  for (const evidence of evidenceRows) {
    const projectId = projectIdByEventId.get(evidence.eventId);
    if (!projectId) continue;
    const observationIds = evidenceByProjectId.get(projectId) ?? new Set<string>();
    observationIds.add(evidence.observationId);
    evidenceByProjectId.set(projectId, observationIds);
  }

  return snapshotRows.map((snapshot) => ({
    projectId: snapshot.projectId,
    summary: snapshot.summary,
    lifecycleState: snapshot.lifecycleState as LifecycleState,
    lifecycleRationale: snapshot.lifecycleRationale,
    activeThemes: parseStringArray(snapshot.activeThemes),
    obstacles: parseStringArray(snapshot.obstacles),
    unresolvedQuestions: parseStringArray(snapshot.unresolvedQuestions),
    recentChanges: parseObjectArray(snapshot.recentChanges),
    evidenceCount: evidenceByProjectId.get(snapshot.projectId)?.size ?? 0,
  }));
}

function buildEventEvidence(
  evidenceRows: Array<typeof eventEvidence.$inferSelect>,
  observationRows: Array<typeof observations.$inferSelect>,
) {
  const observationsById = new Map(observationRows.map((observation) => [observation.id, observation]));
  const result = new Map<string, EvidenceReference[]>();
  for (const evidence of evidenceRows) {
    const observation = observationsById.get(evidence.observationId);
    if (!observation) continue;
    const references = result.get(evidence.eventId) ?? [];
    references.push(toEvidenceReference(observation));
    result.set(evidence.eventId, references);
  }
  for (const references of result.values()) references.sort(compareEvidenceNewestFirst);
  return result;
}

function toEvidenceReference(observation: typeof observations.$inferSelect): EvidenceReference {
  return {
    observationId: observation.id,
    summary: observation.summary,
    sourceQuote: observation.sourceQuote,
    sourceConversationRef: observation.sourceConversationRef,
    sourceMessageRef: observation.sourceMessageRef,
    observedAt: observation.observedAt.toISOString(),
  };
}

function compareEvidenceNewestFirst(left: EvidenceReference, right: EvidenceReference) {
  return right.observedAt.localeCompare(left.observedAt) || right.observationId.localeCompare(left.observationId);
}

function isConfirmOrIgnore(correctionType: string) {
  return ['confirm', 'ignore', 'confirmed', 'ignored', 'observation_confirmed', 'observation_ignored'].includes(
    correctionType,
  );
}

function parseObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function parseStringArray(value: string): string[] {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
}

function parseObjectArray(value: string): Array<Record<string, unknown>> {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed)
    ? parsed.filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null && !Array.isArray(item),
      )
    : [];
}
