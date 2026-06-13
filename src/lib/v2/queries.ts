import { and, asc, desc, eq, inArray } from 'drizzle-orm';
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
  signalEvidence,
  signals,
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
  projectId: string;
  eventType: string;
  payload: Record<string, unknown>;
  rationale: string | null;
  actor: string;
  occurredAt: string;
  evidence: EvidenceReference[];
};

export type RelatedProject = {
  projectId: string;
  summary: string;
  relationships: Array<'merged' | 'shared_evidence'>;
  sharedEvidenceCount: number;
};

export type RelatedSignal = {
  signalId: string;
  title: string;
  description: string;
  supportingObservationCount: number;
};

export type ProjectRelationships = {
  relatedProjects: RelatedProject[];
  relatedSignals: RelatedSignal[];
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
  const [observationRows, attachedEvidenceRows, correctionRows] = await Promise.all([
    db
      .select()
      .from(observations)
      .orderBy(desc(observations.observedAt), desc(observations.recordedAt), desc(observations.id)),
    db
      .select({ observationId: eventEvidence.observationId })
      .from(eventEvidence)
      .innerJoin(projectEvents, eq(eventEvidence.eventId, projectEvents.id))
      .where(eq(projectEvents.eventType, 'observation_attached')),
    db
      .select()
      .from(corrections)
      .where(
        and(
          eq(corrections.targetType, 'observation'),
          inArray(corrections.correctionType, [
            'confirm',
            'ignore',
            'confirmed',
            'ignored',
            'observation_confirmed',
            'observation_ignored',
          ]),
        ),
      ),
  ]);
  const attachedObservationIds = new Set(
    attachedEvidenceRows.map(({ observationId }) => observationId),
  );
  const reviewedObservationIds = new Set(
    correctionRows
      .filter(({ correctionType }) => isConfirmOrIgnore(correctionType))
      .map(({ targetId }) => targetId),
  );
  const pendingObservationRows = observationRows.filter(
    ({ id }) => !attachedObservationIds.has(id) && !reviewedObservationIds.has(id),
  );
  const proposedProjectIds = unique(
    pendingObservationRows.flatMap(({ proposedProjectId }) => (proposedProjectId ? [proposedProjectId] : [])),
  );
  const projectRows = proposedProjectIds.length
    ? await db.select().from(projects).where(inArray(projects.id, proposedProjectIds))
    : [];
  const projectsById = new Map(projectRows.map((project) => [project.id, project]));

  return pendingObservationRows.map((observation) => ({
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
  if (events.length === 0) return [];

  const eventIds = events.map(({ id }) => id);
  const projectIds = unique(events.map(({ projectId }) => projectId));
  const evidenceRows = await db
    .select()
    .from(eventEvidence)
    .where(inArray(eventEvidence.eventId, eventIds));
  const observationIds = unique(evidenceRows.map(({ observationId }) => observationId));
  const [projectRows, observationRows] = await Promise.all([
    db.select().from(projects).where(inArray(projects.id, projectIds)),
    observationIds.length
      ? db.select().from(observations).where(inArray(observations.id, observationIds))
      : Promise.resolve([]),
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
  const hypotheses = await db
    .select()
    .from(projectHypotheses)
    .where(eq(projectHypotheses.state, 'emerging'))
    .orderBy(desc(projectHypotheses.lastSeenAt), desc(projectHypotheses.id));
  if (hypotheses.length === 0) return [];

  const evidenceRows = await db
    .select()
    .from(hypothesisEvidence)
    .where(inArray(hypothesisEvidence.hypothesisId, hypotheses.map(({ id }) => id)));
  const signalIds = unique(evidenceRows.flatMap(({ signalId }) => (signalId ? [signalId] : [])));
  const signalEvidenceRows = signalIds.length
    ? await db.select().from(signalEvidence).where(inArray(signalEvidence.signalId, signalIds))
    : [];
  const observationIds = unique([
    ...evidenceRows.flatMap(({ observationId }) => (observationId ? [observationId] : [])),
    ...signalEvidenceRows.map(({ observationId }) => observationId),
  ]);
  const observationRows = observationIds.length
    ? await db.select().from(observations).where(inArray(observations.id, observationIds))
    : [];
  const observationsById = new Map(observationRows.map((observation) => [observation.id, observation]));
  const observationIdsBySignalId = new Map<string, string[]>();
  for (const evidence of signalEvidenceRows) {
    const ids = observationIdsBySignalId.get(evidence.signalId) ?? [];
    ids.push(evidence.observationId);
    observationIdsBySignalId.set(evidence.signalId, ids);
  }

  return hypotheses.map((hypothesis) => {
    const supportingEvidence = evidenceRows.filter(
      ({ hypothesisId }) => hypothesisId === hypothesis.id,
    );
    const supportingObservationIds = unique(
      supportingEvidence.flatMap(({ observationId, signalId }) => [
        ...(observationId ? [observationId] : []),
        ...(signalId ? (observationIdsBySignalId.get(signalId) ?? []) : []),
      ]),
    );
    const latestQuotes = supportingObservationIds
      .flatMap((observationId) => {
        const observation = observationsById.get(observationId);
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
  const mergeCorrections = await db
    .select()
    .from(corrections)
    .where(
      and(
        eq(corrections.targetType, 'project'),
        eq(corrections.correctionType, 'project_merged'),
      ),
    );
  const visibleProjectIds = [projectId, ...mergedSourceProjectIds(projectId, mergeCorrections)];
  const events = await db
    .select()
    .from(projectEvents)
    .where(inArray(projectEvents.projectId, visibleProjectIds))
    .orderBy(desc(projectEvents.occurredAt), desc(projectEvents.createdAt), desc(projectEvents.id));
  if (events.length === 0) return [];

  const evidenceRows = await db
    .select()
    .from(eventEvidence)
    .where(inArray(eventEvidence.eventId, events.map(({ id }) => id)));
  const observationIds = unique(evidenceRows.map(({ observationId }) => observationId));
  const observationRows = observationIds.length
    ? await db.select().from(observations).where(inArray(observations.id, observationIds))
    : [];
  const evidenceByEvent = buildEventEvidence(evidenceRows, observationRows);

  return events.map((event) => ({
    eventId: event.id,
    projectId: event.projectId,
    eventType: event.eventType,
    payload: parseObject(event.payload),
    rationale: event.rationale,
    actor: event.actor,
    occurredAt: event.occurredAt.toISOString(),
    evidence: evidenceByEvent.get(event.id) ?? [],
  }));
}

export async function getProjectRelationships(projectId: string): Promise<ProjectRelationships> {
  const db = getDatabase().db;
  const project = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (!project) return { relatedProjects: [], relatedSignals: [] };

  const mergeCorrections = await db
    .select()
    .from(corrections)
    .where(
      and(
        eq(corrections.targetType, 'project'),
        eq(corrections.correctionType, 'project_merged'),
      ),
    );
  const mergedProjectIds = mergeConnectedProjectIds(projectId, mergeCorrections);
  const visibleProjectIds = [projectId, ...mergedSourceProjectIds(projectId, mergeCorrections)];
  const projectEvidenceRows = await db
    .select({
      projectId: projectEvents.projectId,
      observationId: eventEvidence.observationId,
    })
    .from(eventEvidence)
    .innerJoin(projectEvents, eq(eventEvidence.eventId, projectEvents.id))
    .where(inArray(projectEvents.projectId, visibleProjectIds));
  const projectObservationIds = unique(projectEvidenceRows.map(({ observationId }) => observationId));
  const matchingSignalEvidence = projectObservationIds.length
    ? await db
        .select()
        .from(signalEvidence)
        .where(inArray(signalEvidence.observationId, projectObservationIds))
    : [];
  const relatedSignalIds = unique(matchingSignalEvidence.map(({ signalId }) => signalId));
  const [signalRows, allRelatedSignalEvidence] = await Promise.all([
    relatedSignalIds.length
      ? db.select().from(signals).where(inArray(signals.id, relatedSignalIds))
      : Promise.resolve([]),
    relatedSignalIds.length
      ? db.select().from(signalEvidence).where(inArray(signalEvidence.signalId, relatedSignalIds))
      : Promise.resolve([]),
  ]);
  const relatedObservationIds = unique([
    ...projectObservationIds,
    ...allRelatedSignalEvidence.map(({ observationId }) => observationId),
  ]);
  const relatedProjectEvidence = relatedObservationIds.length
    ? await db
        .select({
          projectId: projectEvents.projectId,
          observationId: eventEvidence.observationId,
        })
        .from(eventEvidence)
        .innerJoin(projectEvents, eq(eventEvidence.eventId, projectEvents.id))
        .where(inArray(eventEvidence.observationId, relatedObservationIds))
    : [];
  const sharedEvidenceByProjectId = new Map<string, Set<string>>();
  const visibleProjectIdSet = new Set(visibleProjectIds);
  for (const evidence of relatedProjectEvidence) {
    if (visibleProjectIdSet.has(evidence.projectId)) continue;
    const observationIds = sharedEvidenceByProjectId.get(evidence.projectId) ?? new Set<string>();
    observationIds.add(evidence.observationId);
    sharedEvidenceByProjectId.set(evidence.projectId, observationIds);
  }
  const relatedProjectIds = unique([
    ...mergedProjectIds,
    ...sharedEvidenceByProjectId.keys(),
  ]).filter((id) => id !== projectId);
  const projectRows = relatedProjectIds.length
    ? await db.select().from(projects).where(inArray(projects.id, relatedProjectIds))
    : [];
  const mergedProjectIdSet = new Set(mergedProjectIds);

  return {
    relatedProjects: projectRows
      .map((relatedProject) => ({
        projectId: relatedProject.id,
        summary: relatedProject.summary ?? relatedProject.background ?? relatedProject.id,
        relationships: [
          ...(mergedProjectIdSet.has(relatedProject.id) ? ['merged' as const] : []),
          ...(sharedEvidenceByProjectId.has(relatedProject.id) ? ['shared_evidence' as const] : []),
        ],
        sharedEvidenceCount: sharedEvidenceByProjectId.get(relatedProject.id)?.size ?? 0,
      }))
      .sort(compareRelatedProjects),
    relatedSignals: signalRows
      .map((signal) => ({
        signalId: signal.id,
        title: signal.title,
        description: signal.description,
        supportingObservationCount: new Set(
          allRelatedSignalEvidence
            .filter(({ signalId }) => signalId === signal.id)
            .map(({ observationId }) => observationId),
        ).size,
      }))
      .sort(compareRelatedSignals),
  };
}

async function getCurrentProjects(): Promise<CurrentProjectCard[]> {
  const db = getDatabase().db;
  const snapshotRows = await db
    .select()
    .from(projectSnapshots)
    .where(eq(projectSnapshots.isCurrent, true))
    .orderBy(desc(projectSnapshots.createdAt), asc(projectSnapshots.projectId));
  if (snapshotRows.length === 0) return [];

  const mergeCorrections = await db
    .select()
    .from(corrections)
    .where(
      and(
        eq(corrections.targetType, 'project'),
        eq(corrections.correctionType, 'project_merged'),
      ),
    );
  const allVisibleProjectIds = unique(
    snapshotRows.flatMap(({ projectId }) => [
      projectId,
      ...mergedSourceProjectIds(projectId, mergeCorrections),
    ]),
  );
  const visibleEventRows = await db
    .select()
    .from(projectEvents)
    .where(inArray(projectEvents.projectId, allVisibleProjectIds));
  const evidenceRows = visibleEventRows.length
    ? await db
        .select()
        .from(eventEvidence)
        .where(inArray(eventEvidence.eventId, visibleEventRows.map(({ id }) => id)))
    : [];
  const projectIdByEventId = new Map(visibleEventRows.map((event) => [event.id, event.projectId]));

  return snapshotRows.map((snapshot) => {
    const visibleProjectIds = new Set([
      snapshot.projectId,
      ...mergedSourceProjectIds(snapshot.projectId, mergeCorrections),
    ]);
    const evidenceIds = new Set(
      evidenceRows.flatMap((evidence) => {
        const eventProjectId = projectIdByEventId.get(evidence.eventId);
        return eventProjectId && visibleProjectIds.has(eventProjectId) ? [evidence.observationId] : [];
      }),
    );
    return {
      projectId: snapshot.projectId,
      summary: snapshot.summary,
      lifecycleState: snapshot.lifecycleState as LifecycleState,
      lifecycleRationale: snapshot.lifecycleRationale,
      activeThemes: parseStringArray(snapshot.activeThemes),
      obstacles: parseStringArray(snapshot.obstacles),
      unresolvedQuestions: parseStringArray(snapshot.unresolvedQuestions),
      recentChanges: parseObjectArray(snapshot.recentChanges),
      evidenceCount: evidenceIds.size,
    };
  });
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
  const parsed = parseJson(value);
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function parseStringArray(value: string): string[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
}

function parseObjectArray(value: string): Array<Record<string, unknown>> {
  const parsed = parseJson(value);
  return Array.isArray(parsed)
    ? parsed.filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null && !Array.isArray(item),
      )
    : [];
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function mergedSourceProjectIds(
  targetProjectId: string,
  mergeCorrections: Array<typeof corrections.$inferSelect>,
) {
  const sourcesByTargetId = new Map<string, string[]>();
  for (const correction of mergeCorrections) {
    const targetId = parseObject(correction.payload).targetProjectId;
    if (typeof targetId !== 'string' || !targetId) continue;
    const sourceIds = sourcesByTargetId.get(targetId) ?? [];
    sourceIds.push(correction.targetId);
    sourcesByTargetId.set(targetId, sourceIds);
  }

  const result: string[] = [];
  const visited = new Set([targetProjectId]);
  const visit = (projectId: string) => {
    for (const sourceId of sourcesByTargetId.get(projectId) ?? []) {
      if (visited.has(sourceId)) continue;
      visited.add(sourceId);
      result.push(sourceId);
      visit(sourceId);
    }
  };
  visit(targetProjectId);
  return result;
}

function mergeConnectedProjectIds(
  projectId: string,
  mergeCorrections: Array<typeof corrections.$inferSelect>,
) {
  const adjacentProjectIds = new Map<string, string[]>();
  for (const correction of mergeCorrections) {
    const targetId = parseObject(correction.payload).targetProjectId;
    if (typeof targetId !== 'string' || !targetId) continue;
    adjacentProjectIds.set(correction.targetId, [
      ...(adjacentProjectIds.get(correction.targetId) ?? []),
      targetId,
    ]);
    adjacentProjectIds.set(targetId, [
      ...(adjacentProjectIds.get(targetId) ?? []),
      correction.targetId,
    ]);
  }

  const result: string[] = [];
  const visited = new Set([projectId]);
  const visit = (currentProjectId: string) => {
    for (const relatedProjectId of adjacentProjectIds.get(currentProjectId) ?? []) {
      if (visited.has(relatedProjectId)) continue;
      visited.add(relatedProjectId);
      result.push(relatedProjectId);
      visit(relatedProjectId);
    }
  };
  visit(projectId);
  return result;
}

function compareRelatedProjects(left: RelatedProject, right: RelatedProject) {
  return left.summary.localeCompare(right.summary) || left.projectId.localeCompare(right.projectId);
}

function compareRelatedSignals(left: RelatedSignal, right: RelatedSignal) {
  return left.title.localeCompare(right.title) || left.signalId.localeCompare(right.signalId);
}
