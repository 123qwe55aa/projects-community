import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDatabase, type DB } from '@/db';
import {
  corrections,
  decisionLinks,
  decisions,
  eventEvidence,
  observations,
  projectEvents,
  projects,
} from '@/db/schema';
import { projectProjectInTransaction } from './projection/project';

type Transaction = Parameters<Parameters<DB['transaction']>[0]>[0];
type LifecycleState = 'active' | 'dormant' | 'ended' | 'archived';

const ACTOR = 'user';
const SCHEMA_VERSION = 1;

export async function confirmObservation(input: {
  observationId: string;
  projectId: string;
}): Promise<void> {
  requireText(input.observationId, 'Observation ID');
  requireText(input.projectId, 'Project ID');

  getDatabase().db.transaction((tx) => {
    const observation = requireObservation(tx, input.observationId);
    requireProject(tx, input.projectId);
    const now = new Date();
    const rationale =
      observation.assignmentRationale ?? 'User confirmed the observation assignment.';

    insertCorrection(tx, {
      targetType: 'observation',
      targetId: input.observationId,
      correctionType: 'observation_confirmed',
      payload: { projectId: input.projectId },
      createdAt: now,
    });
    const eventId = insertEvent(tx, {
      projectId: input.projectId,
      eventType: 'observation_attached',
      payload: { observationId: input.observationId },
      rationale,
      occurredAt: now,
      createdAt: now,
    });
    tx.insert(eventEvidence)
      .values({ id: nanoid(), eventId, observationId: input.observationId })
      .run();
    projectProjectInTransaction(tx, input.projectId);
  });
}

export async function ignoreObservation(observationId: string): Promise<void> {
  requireText(observationId, 'Observation ID');

  getDatabase().db.transaction((tx) => {
    requireObservation(tx, observationId);
    insertCorrection(tx, {
      targetType: 'observation',
      targetId: observationId,
      correctionType: 'observation_ignored',
      payload: {},
      createdAt: new Date(),
    });
  });
}

export async function correctLifecycle(input: {
  projectId: string;
  state: LifecycleState;
  rationale: string;
}): Promise<void> {
  requireText(input.projectId, 'Project ID');
  requireText(input.rationale, 'Rationale');

  getDatabase().db.transaction((tx) => {
    requireProject(tx, input.projectId);
    const now = new Date();
    const payload = { state: input.state, rationale: input.rationale.trim() };

    insertCorrection(tx, {
      targetType: 'project',
      targetId: input.projectId,
      correctionType: 'lifecycle_state',
      payload,
      createdAt: now,
    });
    insertEvent(tx, {
      projectId: input.projectId,
      eventType: 'lifecycle_corrected',
      payload,
      rationale: input.rationale.trim(),
      occurredAt: now,
      createdAt: now,
    });
    projectProjectInTransaction(tx, input.projectId);
  });
}

export async function mergeProjects(input: {
  sourceProjectId: string;
  targetProjectId: string;
  rationale: string;
}): Promise<void> {
  requireText(input.sourceProjectId, 'Source project ID');
  requireText(input.targetProjectId, 'Target project ID');
  requireText(input.rationale, 'Rationale');
  if (input.sourceProjectId === input.targetProjectId) {
    throw new Error('Source and target Projects must be different');
  }

  getDatabase().db.transaction((tx) => {
    requireProject(tx, input.sourceProjectId);
    requireProject(tx, input.targetProjectId);
    const now = new Date();
    const payload = {
      sourceProjectId: input.sourceProjectId,
      targetProjectId: input.targetProjectId,
    };

    insertCorrection(tx, {
      targetType: 'project',
      targetId: input.sourceProjectId,
      correctionType: 'project_merged',
      payload: { targetProjectId: input.targetProjectId, rationale: input.rationale.trim() },
      createdAt: now,
    });
    insertEvent(tx, {
      projectId: input.targetProjectId,
      eventType: 'project_merged',
      payload,
      rationale: input.rationale.trim(),
      occurredAt: now,
      createdAt: now,
    });
    projectProjectInTransaction(tx, input.sourceProjectId);
    projectProjectInTransaction(tx, input.targetProjectId);
  });
}

export async function archiveProject(input: {
  projectId: string;
  rationale: string;
}): Promise<void> {
  requireText(input.projectId, 'Project ID');
  requireText(input.rationale, 'Rationale');

  getDatabase().db.transaction((tx) => {
    requireProject(tx, input.projectId);
    const now = new Date();
    const rationale = input.rationale.trim();

    insertCorrection(tx, {
      targetType: 'project',
      targetId: input.projectId,
      correctionType: 'lifecycle_state',
      payload: { state: 'archived', rationale },
      createdAt: now,
    });
    insertEvent(tx, {
      projectId: input.projectId,
      eventType: 'project_archived',
      payload: { rationale },
      rationale,
      occurredAt: now,
      createdAt: now,
    });
    projectProjectInTransaction(tx, input.projectId);
  });
}

export async function confirmDecisionSuggestion(eventId: string): Promise<string> {
  requireText(eventId, 'Event ID');

  return getDatabase().db.transaction((tx) => {
    const previousConfirmation = findDecisionSuggestionCorrection(
      tx,
      eventId,
      'decision_suggestion_confirmed',
    );
    if (previousConfirmation) {
      return requirePayloadText(previousConfirmation.payload, 'decisionId');
    }

    const suggestion = requireDecisionSuggestion(tx, eventId);
    const question = requirePayloadText(suggestion.payload, 'question');
    const now = new Date();
    const decisionId = nanoid();

    tx.insert(decisions)
      .values({
        id: decisionId,
        question,
        state: 'researching',
        scope: 'project',
        projectId: suggestion.projectId,
        visibility: 'private',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    tx.insert(decisionLinks)
      .values({ id: nanoid(), projectId: suggestion.projectId, decisionId, createdAt: now })
      .run();
    insertCorrection(tx, {
      targetType: 'project_event',
      targetId: eventId,
      correctionType: 'decision_suggestion_confirmed',
      payload: { decisionId },
      createdAt: now,
    });
    insertEvent(tx, {
      projectId: suggestion.projectId,
      eventType: 'decision_confirmed',
      payload: { decisionId, question },
      rationale: suggestion.rationale ?? 'User confirmed the Decision suggestion.',
      occurredAt: now,
      createdAt: now,
    });
    projectProjectInTransaction(tx, suggestion.projectId);
    return decisionId;
  });
}

export async function dismissDecisionSuggestion(eventId: string, rationale: string): Promise<void> {
  requireText(eventId, 'Event ID');
  requireText(rationale, 'Rationale');

  getDatabase().db.transaction((tx) => {
    requireDecisionSuggestion(tx, eventId);
    insertCorrection(tx, {
      targetType: 'project_event',
      targetId: eventId,
      correctionType: 'decision_suggestion_dismissed',
      payload: { rationale: rationale.trim() },
      createdAt: new Date(),
    });
  });
}

function insertCorrection(
  tx: Transaction,
  input: {
    targetType: 'observation' | 'project_event' | 'project';
    targetId: string;
    correctionType: string;
    payload: Record<string, unknown>;
    createdAt: Date;
  },
) {
  tx.insert(corrections)
    .values({
      id: nanoid(),
      ...input,
      payload: JSON.stringify(input.payload),
      actor: ACTOR,
    })
    .run();
}

function insertEvent(
  tx: Transaction,
  input: {
    projectId: string;
    eventType: string;
    payload: Record<string, unknown>;
    rationale: string;
    occurredAt: Date;
    createdAt: Date;
  },
) {
  const id = nanoid();
  tx.insert(projectEvents)
    .values({
      id,
      ...input,
      payload: JSON.stringify(input.payload),
      actor: ACTOR,
      schemaVersion: SCHEMA_VERSION,
    })
    .run();
  return id;
}

function requireProject(tx: Transaction, projectId: string) {
  const project = tx.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw new Error(`Project not found: ${projectId}`);
  return project;
}

function requireObservation(tx: Transaction, observationId: string) {
  const observation = tx
    .select()
    .from(observations)
    .where(eq(observations.id, observationId))
    .get();
  if (!observation) throw new Error(`Observation not found: ${observationId}`);
  return observation;
}

function requireDecisionSuggestion(tx: Transaction, eventId: string) {
  const event = tx
    .select()
    .from(projectEvents)
    .where(and(eq(projectEvents.id, eventId), eq(projectEvents.eventType, 'decision_suggested')))
    .get();
  if (!event) throw new Error(`Decision suggestion not found: ${eventId}`);
  requireProject(tx, event.projectId);
  return event;
}

function findDecisionSuggestionCorrection(
  tx: Transaction,
  eventId: string,
  correctionType: string,
) {
  return tx
    .select()
    .from(corrections)
    .where(
      and(
        eq(corrections.targetType, 'project_event'),
        eq(corrections.targetId, eventId),
        eq(corrections.correctionType, correctionType),
      ),
    )
    .get();
}

function requirePayloadText(payloadJson: string, field: string) {
  const payload = JSON.parse(payloadJson) as unknown;
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload) ||
    typeof (payload as Record<string, unknown>)[field] !== 'string' ||
    !(payload as Record<string, string>)[field].trim()
  ) {
    throw new Error(`Decision suggestion has invalid ${field}`);
  }
  return (payload as Record<string, string>)[field];
}

function requireText(value: string, label: string) {
  if (!value?.trim()) throw new Error(`${label} is required`);
}
