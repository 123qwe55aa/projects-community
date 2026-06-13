import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDatabase, type DB } from '@/db';
import {
  corrections,
  eventEvidence,
  observations,
  projectEvents,
  projectSnapshots,
  projects,
} from '@/db/schema';

export const PROJECT_PROJECTION_VERSION = 1;

type JsonObject = Record<string, unknown>;
type LifecycleState = 'active' | 'dormant' | 'ended' | 'archived';
export type ProjectProjectionTransaction = Parameters<Parameters<DB['transaction']>[0]>[0];
const FIELD_MAX_LENGTH: Record<string, number> = {
  summary: 1000,
  obstacle: 1000,
  theme: 1000,
  rationale: 1000,
  question: 1000,
  background: 2000,
  observationId: 200,
  sourceProjectId: 200,
  targetProjectId: 200,
  hypothesisId: 200,
  decisionId: 200,
};

export async function projectProject(projectId: string) {
  return getDatabase().db.transaction((tx) => projectProjectInTransaction(tx, projectId));
}

export function projectProjectInTransaction(tx: ProjectProjectionTransaction, projectId: string) {
  const project = tx.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const mergedProjectIds = mergedSourceProjectIds(tx, projectId);
  const visibleProjectIds = [projectId, ...mergedProjectIds];

  const events = tx
    .select()
    .from(projectEvents)
    .where(inArray(projectEvents.projectId, visibleProjectIds))
    .orderBy(asc(projectEvents.occurredAt), asc(projectEvents.createdAt), asc(projectEvents.id))
    .all()
    .map((event) => ({ event, payload: validateProjectEvent(event) }));
  const questionEvidence = tx
    .select({
      id: observations.id,
      summary: observations.summary,
      schemaVersion: observations.schemaVersion,
    })
    .from(eventEvidence)
    .innerJoin(projectEvents, eq(eventEvidence.eventId, projectEvents.id))
    .innerJoin(observations, eq(eventEvidence.observationId, observations.id))
    .where(and(inArray(projectEvents.projectId, visibleProjectIds), eq(observations.type, 'question')))
    .orderBy(asc(observations.observedAt), asc(observations.recordedAt), asc(observations.id))
    .all();
  const lifecycleCorrections = tx
    .select()
    .from(corrections)
    .where(
      and(
        eq(corrections.targetType, 'project'),
        eq(corrections.targetId, projectId),
        eq(corrections.correctionType, 'lifecycle_state'),
      ),
    )
    .orderBy(asc(corrections.createdAt), asc(corrections.id))
    .all();
  const mergeCorrection = tx
    .select()
    .from(corrections)
    .where(
      and(
        eq(corrections.targetType, 'project'),
        eq(corrections.targetId, projectId),
        eq(corrections.correctionType, 'project_merged'),
      ),
    )
    .orderBy(asc(corrections.createdAt), asc(corrections.id))
    .get();

  for (const evidence of questionEvidence) validateQuestionEvidence(evidence);

  let summary = project.summary ?? '';
  let lifecycleState: LifecycleState = 'active';
  let lifecycleRationale: string | null = null;
  let lifecycleOccurredAt: Date | null = null;
  const activeThemes = new Set<string>();
  const obstacles = new Set<string>();

  for (const { event, payload } of events) {
    const eventSummary = stringValue(payload.summary);
    if (eventSummary !== null) summary = eventSummary;

    if (event.eventType === 'interest_increased') addValue(activeThemes, payload.theme);
    if (event.eventType === 'interest_decreased') removeValue(activeThemes, payload.theme);
    if (event.eventType === 'obstacle_identified') addValue(obstacles, payload.obstacle);
    if (event.eventType === 'obstacle_resolved') removeValue(obstacles, payload.obstacle);
    if (event.eventType === 'lifecycle_inferred') {
      const lifecycle = validateLifecyclePayload(payload);
      lifecycleState = lifecycle.state;
      lifecycleRationale = lifecycle.rationale;
      lifecycleOccurredAt = event.occurredAt;
    }
  }

  for (const correction of lifecycleCorrections) {
    const lifecycle = validateLifecyclePayload(parsePayload(correction.payload));
    if (correction.actor !== 'user') continue;
    if (lifecycleOccurredAt && correction.createdAt < lifecycleOccurredAt) continue;
    lifecycleState = lifecycle.state;
    lifecycleRationale = lifecycle.rationale;
    lifecycleOccurredAt = correction.createdAt;
  }
  if (mergeCorrection) {
    const merge = validateMergeCorrection(parsePayload(mergeCorrection.payload));
    lifecycleState = 'archived';
    lifecycleRationale = merge.rationale;
    lifecycleOccurredAt = mergeCorrection.createdAt;
  }

  const recentChanges = events
    .slice(-5)
    .reverse()
    .map(({ event, payload }) => ({
      id: event.id,
      projectId: event.projectId,
      eventType: event.eventType,
      payload,
      rationale: event.rationale,
      actor: event.actor,
      occurredAt: event.occurredAt.toISOString(),
    }));
  const latestEvent = events.at(-1)?.event;
  const snapshot = {
    id: nanoid(),
    projectId,
    summary,
    lifecycleState,
    lifecycleRationale,
    activeThemes: JSON.stringify([...activeThemes]),
    obstacles: JSON.stringify([...obstacles]),
    unresolvedQuestions: JSON.stringify(unique(questionEvidence.map(({ summary }) => summary))),
    recentChanges: JSON.stringify(recentChanges),
    sourceEventId: latestEvent?.id ?? null,
    projectionVersion: PROJECT_PROJECTION_VERSION,
    isCurrent: true,
    createdAt: new Date(),
  };

  tx.update(projectSnapshots)
    .set({ isCurrent: false })
    .where(and(eq(projectSnapshots.projectId, projectId), eq(projectSnapshots.isCurrent, true)))
    .run();
  tx.insert(projectSnapshots).values(snapshot).run();
  tx.update(projects).set({ summary }).where(eq(projects.id, projectId)).run();

  return snapshot;
}

export async function getCurrentProjectSnapshot(projectId: string) {
  return (
    getDatabase()
      .db.select()
      .from(projectSnapshots)
      .where(and(eq(projectSnapshots.projectId, projectId), eq(projectSnapshots.isCurrent, true)))
      .orderBy(desc(projectSnapshots.createdAt), desc(projectSnapshots.id))
      .get() ?? null
  );
}

function parsePayload(payload: string): JsonObject {
  const parsed = JSON.parse(payload) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Project event and correction payloads must be JSON objects');
  }
  return parsed as JsonObject;
}

function validateProjectEvent(event: typeof projectEvents.$inferSelect): JsonObject {
  if (event.schemaVersion !== 1) {
    throw invalidProjectEvent(event.id, `unsupported schema version ${event.schemaVersion}`);
  }

  let payload: JsonObject;
  try {
    payload = parsePayload(event.payload);
  } catch {
    throw invalidProjectEvent(event.id, 'malformed JSON payload');
  }

  switch (event.eventType) {
    case 'project_created':
    case 'progress_recorded':
    case 'direction_changed':
      requireExactStringPayload(event.id, payload, ['summary']);
      break;
    case 'obstacle_identified':
    case 'obstacle_resolved':
      requireExactStringPayload(event.id, payload, ['obstacle']);
      break;
    case 'interest_increased':
    case 'interest_decreased':
      requireExactStringPayload(event.id, payload, ['theme']);
      break;
    case 'lifecycle_inferred':
    case 'lifecycle_corrected':
      validateLifecyclePayload(payload);
      break;
    case 'observation_attached':
      requireExactStringPayload(event.id, payload, ['observationId']);
      break;
    case 'project_merged':
      requireExactStringPayload(event.id, payload, ['sourceProjectId', 'targetProjectId']);
      break;
    case 'project_archived':
      requireExactStringPayload(event.id, payload, ['rationale']);
      break;
    case 'hypothesis_promoted':
      requireExactStringPayload(event.id, payload, ['hypothesisId']);
      break;
    case 'legacy_imported':
      requireExactStringPayload(event.id, payload, ['summary', 'background']);
      break;
    case 'decision_suggested':
      requireExactStringPayload(event.id, payload, ['question']);
      break;
    case 'decision_confirmed':
      requireExactStringPayload(event.id, payload, ['decisionId', 'question']);
      break;
    default:
      throw invalidProjectEvent(event.id, `unsupported event type ${event.eventType}`);
  }
  return payload;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function requireExactStringPayload(eventId: string, payload: JsonObject, fields: string[]) {
  const keys = Object.keys(payload);
  if (
    keys.length !== fields.length ||
    fields.some(
      (field) =>
        !keys.includes(field) ||
        !boundedString(payload[field], FIELD_MAX_LENGTH[field] ?? Number.MAX_SAFE_INTEGER),
    )
  ) {
    throw invalidProjectEvent(eventId, 'invalid payload');
  }
}

function invalidProjectEvent(eventId: string, reason: string) {
  return new Error(`Invalid project event ${eventId}: ${reason}`);
}

function validateQuestionEvidence(evidence: { id: string; summary: string; schemaVersion: number }) {
  if (evidence.schemaVersion !== 1 || !boundedString(evidence.summary, FIELD_MAX_LENGTH.summary)) {
    throw new Error(`Invalid question evidence ${evidence.id}`);
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function boundedString(value: unknown, maximum: number): value is string {
  return nonEmptyString(value) && value.length <= maximum;
}

function validateLifecyclePayload(payload: JsonObject): {
  state: LifecycleState;
  rationale: string;
} {
  const state = stringValue(payload.state);
  const rationale = stringValue(payload.rationale);
  const validStates: LifecycleState[] = ['active', 'dormant', 'ended', 'archived'];
  const keys = Object.keys(payload);
  if (
    !nonEmptyString(state) ||
    !validStates.includes(state as LifecycleState) ||
    !boundedString(rationale, FIELD_MAX_LENGTH.rationale) ||
    keys.length !== 2 ||
    !keys.includes('state') ||
    !keys.includes('rationale')
  ) {
    throw new Error('Invalid lifecycle payload');
  }
  return { state: state as LifecycleState, rationale };
}

function validateMergeCorrection(payload: JsonObject) {
  const targetProjectId = stringValue(payload.targetProjectId);
  const rationale = stringValue(payload.rationale);
  const keys = Object.keys(payload);
  if (
    !boundedString(targetProjectId, FIELD_MAX_LENGTH.targetProjectId) ||
    !boundedString(rationale, FIELD_MAX_LENGTH.rationale) ||
    keys.length !== 2 ||
    !keys.includes('targetProjectId') ||
    !keys.includes('rationale')
  ) {
    throw new Error('Invalid project merge correction');
  }
  return { targetProjectId, rationale };
}

function mergedSourceProjectIds(tx: ProjectProjectionTransaction, targetProjectId: string) {
  const correctionsRows = tx
    .select()
    .from(corrections)
    .where(
      and(
        eq(corrections.targetType, 'project'),
        eq(corrections.correctionType, 'project_merged'),
      ),
    )
    .orderBy(asc(corrections.createdAt), asc(corrections.id))
    .all();
  const sourcesByTargetId = new Map<string, string[]>();
  for (const correction of correctionsRows) {
    const { targetProjectId: targetId } = validateMergeCorrection(parsePayload(correction.payload));
    const sourceIds = sourcesByTargetId.get(targetId) ?? [];
    sourceIds.push(correction.targetId);
    sourcesByTargetId.set(targetId, sourceIds);
  }

  const result: string[] = [];
  const visited = new Set([targetProjectId]);
  const visit = (projectId: string) => {
    for (const sourceId of sourcesByTargetId.get(projectId) ?? []) {
      if (visited.has(sourceId)) throw new Error('Project merge corrections contain a cycle');
      visited.add(sourceId);
      result.push(sourceId);
      visit(sourceId);
    }
  };
  visit(targetProjectId);
  return result;
}

function addValue(values: Set<string>, value: unknown) {
  const text = stringValue(value);
  if (text !== null) values.add(text);
}

function removeValue(values: Set<string>, value: unknown) {
  const text = stringValue(value);
  if (text !== null) values.delete(text);
}

function unique(values: string[]) {
  return [...new Set(values)];
}
