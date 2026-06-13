import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDatabase, type DB } from '@/db';
import {
  eventEvidence,
  hypothesisEvidence,
  ingestionReceipts,
  observations,
  projectEvents,
  projectHypotheses,
  projects,
  signals,
} from '@/db/schema';
import {
  attachObservationToProjectInput,
  recordObservationInput,
  recordProjectEventInput,
  suggestDecisionInput,
  upsertProjectHypothesisInput,
  type AttachObservationToProjectInput,
  type RecordObservationInput,
  type RecordProjectEventInput,
  type SuggestDecisionInput,
  type UpsertProjectHypothesisInput,
} from './contracts';

export const AUTO_ASSIGN_CONFIDENCE = 85;

const ACTOR = 'hermes';
const SCHEMA_VERSION = 1;

type Transaction = Parameters<Parameters<DB['transaction']>[0]>[0];
type DeduplicatedResult = { deduplicated: boolean };

export async function recordObservation(raw: RecordObservationInput): Promise<{
  observationId: string;
  reviewStatus: 'accepted' | 'pending';
  attachedProjectId: string | null;
  deduplicated: boolean;
}> {
  const input = recordObservationInput.parse(raw);

  return idempotentWrite('recordObservation', input.idempotencyKey, (tx) => {
    const proposedProjectId =
      input.proposedProjectId && projectExists(tx, input.proposedProjectId)
        ? input.proposedProjectId
        : null;
    const observationId = nanoid();
    const recordedAt = new Date();
    tx.insert(observations)
      .values({
        id: observationId,
        idempotencyKey: input.idempotencyKey,
        summary: input.summary,
        type: input.type,
        sourceQuote: input.sourceQuote,
        sourceConversationRef: input.sourceConversationRef,
        sourceMessageRef: input.sourceMessageRef,
        proposedProjectId,
        assignmentConfidence: input.assignmentConfidence ?? null,
        assignmentRationale: input.assignmentRationale ?? null,
        observedAt: new Date(input.observedAt),
        recordedAt,
        actor: ACTOR,
        schemaVersion: SCHEMA_VERSION,
      })
      .run();

    const attachedProjectId =
      proposedProjectId &&
      input.assignmentConfidence !== undefined &&
      input.assignmentConfidence >= AUTO_ASSIGN_CONFIDENCE
        ? proposedProjectId
        : null;

    if (attachedProjectId) {
      insertEvent(
        tx,
        {
          projectId: attachedProjectId,
          eventType: 'observation_attached',
          payload: { observationId },
          rationale: input.assignmentRationale!,
          idempotencyKey: input.idempotencyKey,
          occurredAt: new Date(input.observedAt),
          createdAt: recordedAt,
        },
        [observationId],
      );
    }

    return {
      observationId,
      reviewStatus: attachedProjectId ? 'accepted' : 'pending',
      attachedProjectId,
      deduplicated: false,
    };
  });
}

export async function recordProjectEvent(raw: RecordProjectEventInput): Promise<{
  eventId: string;
  deduplicated: boolean;
}> {
  const input = recordProjectEventInput.parse(raw);

  return idempotentWrite('recordProjectEvent', input.idempotencyKey, (tx) => {
    requireProject(tx, input.projectId);
    requireObservations(tx, input.evidenceObservationIds);
    const eventId = insertEvent(
      tx,
      {
        projectId: input.projectId,
        eventType: input.eventType,
        payload: input.payload,
        rationale: input.rationale,
        idempotencyKey: input.idempotencyKey,
        occurredAt: new Date(input.occurredAt),
        createdAt: new Date(),
      },
      input.evidenceObservationIds,
    );
    return { eventId, deduplicated: false };
  });
}

export async function attachObservationToProject(raw: AttachObservationToProjectInput): Promise<{
  eventId: string;
  deduplicated: boolean;
}> {
  const input = attachObservationToProjectInput.parse(raw);

  return idempotentWrite('attachObservationToProject', input.idempotencyKey, (tx) => {
    requireProject(tx, input.projectId);
    requireObservations(tx, [input.observationId]);
    const eventId = insertEvent(
      tx,
      {
        projectId: input.projectId,
        eventType: 'observation_attached',
        payload: { observationId: input.observationId },
        rationale: input.rationale,
        idempotencyKey: input.idempotencyKey,
        occurredAt: new Date(input.occurredAt),
        createdAt: new Date(),
      },
      [input.observationId],
    );
    return { eventId, deduplicated: false };
  });
}

export async function upsertProjectHypothesis(raw: UpsertProjectHypothesisInput): Promise<{
  hypothesisId: string;
  created: boolean;
}> {
  const input = upsertProjectHypothesisInput.parse(raw);

  return idempotentWrite('upsertProjectHypothesis', input.idempotencyKey, (tx) => {
    const observationIds = input.observationIds ?? [];
    const signalIds = input.signalIds ?? [];
    requireObservations(tx, observationIds);
    requireSignals(tx, signalIds);

    const existing = tx
      .select()
      .from(projectHypotheses)
      .where(eq(projectHypotheses.stableKey, input.stableKey))
      .get();
    const now = new Date();
    const hypothesisId = existing?.id ?? nanoid();

    if (existing) {
      tx.update(projectHypotheses)
        .set({ title: input.title, explanation: input.explanation, lastSeenAt: now })
        .where(eq(projectHypotheses.id, hypothesisId))
        .run();
    } else {
      tx.insert(projectHypotheses)
        .values({
          id: hypothesisId,
          stableKey: input.stableKey,
          title: input.title,
          explanation: input.explanation,
          state: 'emerging',
          firstSeenAt: now,
          lastSeenAt: now,
        })
        .run();
    }

    insertMissingHypothesisEvidence(tx, hypothesisId, observationIds, signalIds);
    return { hypothesisId, created: !existing };
  });
}

export async function suggestDecision(raw: SuggestDecisionInput): Promise<{
  eventId: string;
  deduplicated: boolean;
}> {
  const input = suggestDecisionInput.parse(raw);

  return idempotentWrite('suggestDecision', input.idempotencyKey, (tx) => {
    requireProject(tx, input.projectId);
    requireObservations(tx, input.evidenceObservationIds);
    const now = new Date();
    const eventId = insertEvent(
      tx,
      {
        projectId: input.projectId,
        eventType: 'decision_suggested',
        payload: { question: input.question },
        rationale: input.rationale,
        idempotencyKey: input.idempotencyKey,
        occurredAt: now,
        createdAt: now,
      },
      input.evidenceObservationIds,
    );
    return { eventId, deduplicated: false };
  });
}

function idempotentWrite<T>(
  toolName: string,
  idempotencyKey: string,
  write: (tx: Transaction) => T,
): T {
  const database = getDatabase().db;
  const existing = findReceipt(database, idempotencyKey);
  if (existing) return receiptResult<T>(existing, toolName, idempotencyKey);

  return database.transaction((tx) => {
    const concurrent = findReceipt(tx, idempotencyKey);
    if (concurrent) return receiptResult<T>(concurrent, toolName, idempotencyKey);

    const result = write(tx);
    tx.insert(ingestionReceipts)
      .values({
        idempotencyKey,
        toolName,
        resultJson: JSON.stringify(result),
        createdAt: new Date(),
      })
      .run();
    return result;
  });
}

function findReceipt(database: DB | Transaction, idempotencyKey: string) {
  return database
    .select()
    .from(ingestionReceipts)
    .where(eq(ingestionReceipts.idempotencyKey, idempotencyKey))
    .get();
}

function receiptResult<T>(
  receipt: typeof ingestionReceipts.$inferSelect,
  toolName: string,
  idempotencyKey: string,
): T {
  if (receipt.toolName !== toolName) {
    throw new Error(`Idempotency key ${idempotencyKey} was already used by ${receipt.toolName}`);
  }

  const result = JSON.parse(receipt.resultJson) as T;
  if (hasDeduplicated(result)) {
    return { ...result, deduplicated: true };
  }
  return result;
}

function hasDeduplicated(result: unknown): result is DeduplicatedResult {
  return typeof result === 'object' && result !== null && 'deduplicated' in result;
}

function requireProject(tx: Transaction, projectId: string) {
  if (!projectExists(tx, projectId)) throw new Error(`Project not found: ${projectId}`);
}

function projectExists(tx: Transaction, projectId: string) {
  return Boolean(
    tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).get(),
  );
}

function requireObservations(tx: Transaction, observationIds: string[]) {
  for (const observationId of observationIds) {
    const observation = tx
      .select({ id: observations.id })
      .from(observations)
      .where(eq(observations.id, observationId))
      .get();
    if (!observation) throw new Error(`Observation not found: ${observationId}`);
  }
}

function requireSignals(tx: Transaction, signalIds: string[]) {
  for (const signalId of signalIds) {
    const signal = tx.select({ id: signals.id }).from(signals).where(eq(signals.id, signalId)).get();
    if (!signal) throw new Error(`Signal not found: ${signalId}`);
  }
}

function insertEvent(
  tx: Transaction,
  input: {
    projectId: string;
    eventType: string;
    payload: unknown;
    rationale: string;
    idempotencyKey: string;
    occurredAt: Date;
    createdAt: Date;
  },
  observationIds: string[],
) {
  const eventId = nanoid();
  tx.insert(projectEvents)
    .values({
      id: eventId,
      projectId: input.projectId,
      eventType: input.eventType,
      payload: JSON.stringify(input.payload),
      rationale: input.rationale,
      actor: ACTOR,
      idempotencyKey: input.idempotencyKey,
      occurredAt: input.occurredAt,
      createdAt: input.createdAt,
      schemaVersion: SCHEMA_VERSION,
    })
    .run();
  if (observationIds.length > 0) {
    tx.insert(eventEvidence)
      .values(
        observationIds.map((observationId) => ({
          id: nanoid(),
          eventId,
          observationId,
        })),
      )
      .run();
  }
  return eventId;
}

function insertMissingHypothesisEvidence(
  tx: Transaction,
  hypothesisId: string,
  observationIds: string[],
  signalIds: string[],
) {
  for (const observationId of observationIds) {
    const existing = tx
      .select({ id: hypothesisEvidence.id })
      .from(hypothesisEvidence)
      .where(
        and(
          eq(hypothesisEvidence.hypothesisId, hypothesisId),
          eq(hypothesisEvidence.observationId, observationId),
        ),
      )
      .get();
    if (!existing) {
      tx.insert(hypothesisEvidence).values({ id: nanoid(), hypothesisId, observationId }).run();
    }
  }
  for (const signalId of signalIds) {
    const existing = tx
      .select({ id: hypothesisEvidence.id })
      .from(hypothesisEvidence)
      .where(
        and(
          eq(hypothesisEvidence.hypothesisId, hypothesisId),
          eq(hypothesisEvidence.signalId, signalId),
        ),
      )
      .get();
    if (!existing) {
      tx.insert(hypothesisEvidence).values({ id: nanoid(), hypothesisId, signalId }).run();
    }
  }
}
