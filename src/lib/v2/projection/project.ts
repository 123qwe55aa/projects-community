import { and, asc, desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDatabase } from '@/db';
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

export async function projectProject(projectId: string, sourceEventIds?: ReadonlySet<string>) {
  const database = getDatabase().db;

  return database.transaction((tx) => {
    const project = tx.select().from(projects).where(eq(projects.id, projectId)).get();
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const events = tx
      .select()
      .from(projectEvents)
      .where(eq(projectEvents.projectId, projectId))
      .orderBy(asc(projectEvents.occurredAt), asc(projectEvents.createdAt), asc(projectEvents.id))
      .all()
      .filter((event) => sourceEventIds?.has(event.id) ?? true);
    const questionEvidence = tx
      .select({ eventId: eventEvidence.eventId, summary: observations.summary })
      .from(eventEvidence)
      .innerJoin(projectEvents, eq(eventEvidence.eventId, projectEvents.id))
      .innerJoin(observations, eq(eventEvidence.observationId, observations.id))
      .where(and(eq(projectEvents.projectId, projectId), eq(observations.type, 'question')))
      .orderBy(asc(observations.observedAt), asc(observations.recordedAt), asc(observations.id))
      .all()
      .filter(({ eventId }) => sourceEventIds?.has(eventId) ?? true);
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

    let summary = project.summary ?? '';
    let lifecycleState: LifecycleState = 'active';
    let lifecycleRationale: string | null = null;
    let lifecycleOccurredAt: Date | null = null;
    const activeThemes = new Set<string>();
    const obstacles = new Set<string>();

    for (const event of events) {
      const payload = parsePayload(event.payload);
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

    const recentChanges = events
      .slice(-5)
      .reverse()
      .map((event) => ({
        id: event.id,
        eventType: event.eventType,
        payload: parsePayload(event.payload),
        rationale: event.rationale,
        actor: event.actor,
        occurredAt: event.occurredAt.toISOString(),
      }));
    const latestEvent = events.at(-1);
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
  });
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

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : null;
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
    !state ||
    !validStates.includes(state as LifecycleState) ||
    !rationale ||
    keys.length !== 2 ||
    !keys.includes('state') ||
    !keys.includes('rationale')
  ) {
    throw new Error('Invalid lifecycle payload');
  }
  return { state: state as LifecycleState, rationale };
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
