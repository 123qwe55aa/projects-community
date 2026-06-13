import { and, eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDatabase, type DB } from '@/db';
import {
  corrections,
  decisionLinks,
  decisions,
  eventEvidence,
  hypothesisEvidence,
  observations,
  projectEvents,
  projectHypotheses,
  projects,
  signalEvidence,
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
    const ignored = findObservationCorrection(tx, input.observationId, 'observation_ignored');
    if (ignored) throw new Error(`Observation is already ignored: ${input.observationId}`);
    const confirmed = findObservationCorrection(tx, input.observationId, 'observation_confirmed');
    if (confirmed) {
      const confirmedProjectId = requireCorrectionPayloadText(confirmed.payload, 'projectId');
      if (confirmedProjectId === input.projectId) return;
      throw new Error(`Observation is already attached to Project ${confirmedProjectId}`);
    }
    const attachedProjectIds = observationAttachmentProjectIds(tx, input.observationId);
    const conflictingProjectId = attachedProjectIds.find((projectId) => projectId !== input.projectId);
    if (conflictingProjectId) {
      throw new Error(`Observation is already attached to Project ${conflictingProjectId}`);
    }
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
    if (!attachedProjectIds.includes(input.projectId)) {
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
    }
    projectProjectInTransaction(tx, input.projectId);
  });
}

export async function ignoreObservation(observationId: string): Promise<void> {
  requireText(observationId, 'Observation ID');

  getDatabase().db.transaction((tx) => {
    requireObservation(tx, observationId);
    if (findObservationCorrection(tx, observationId, 'observation_ignored')) return;
    if (
      findObservationCorrection(tx, observationId, 'observation_confirmed') ||
      observationAttachmentProjectIds(tx, observationId).length > 0
    ) {
      throw new Error(`Observation is already confirmed: ${observationId}`);
    }
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
    const mergeTargets = projectMergeTargets(tx);
    const existingTargetId = mergeTargets.get(input.sourceProjectId);
    if (existingTargetId === input.targetProjectId) return;
    if (existingTargetId) {
      throw new Error(
        `Project ${input.sourceProjectId} is already merged into Project ${existingTargetId}`,
      );
    }
    const checkedProjectIds = new Set<string>();
    for (let projectId: string | undefined = input.targetProjectId; projectId; ) {
      if (projectId === input.sourceProjectId) throw new Error('Merge would create a cycle');
      if (checkedProjectIds.has(projectId)) {
        throw new Error('Project merge corrections contain a cycle');
      }
      checkedProjectIds.add(projectId);
      projectId = mergeTargets.get(projectId);
    }
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
    const projectedProjectIds = new Set<string>();
    for (let projectId: string | undefined = input.targetProjectId; projectId; ) {
      if (projectedProjectIds.has(projectId)) {
        throw new Error('Project merge corrections contain a cycle');
      }
      projectedProjectIds.add(projectId);
      projectProjectInTransaction(tx, projectId);
      projectId = mergeTargets.get(projectId);
    }
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
    if (
      findDecisionSuggestionCorrection(tx, eventId, 'decision_suggestion_dismissed')
    ) {
      throw new Error(`Decision suggestion is already dismissed: ${eventId}`);
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
    if (findDecisionSuggestionCorrection(tx, eventId, 'decision_suggestion_confirmed')) {
      throw new Error(`Decision suggestion is already confirmed: ${eventId}`);
    }
    if (findDecisionSuggestionCorrection(tx, eventId, 'decision_suggestion_dismissed')) return;
    insertCorrection(tx, {
      targetType: 'project_event',
      targetId: eventId,
      correctionType: 'decision_suggestion_dismissed',
      payload: { rationale: rationale.trim() },
      createdAt: new Date(),
    });
  });
}

export async function promoteHypothesis(hypothesisId: string): Promise<string> {
  requireText(hypothesisId, 'Hypothesis ID');

  return getDatabase().db.transaction((tx) => {
    const hypothesis = requireHypothesis(tx, hypothesisId);
    if (hypothesis.state === 'promoted' && hypothesis.promotedProjectId) {
      return hypothesis.promotedProjectId;
    }
    if (hypothesis.state !== 'emerging') {
      throw new Error(`Hypothesis is not emerging: ${hypothesisId}`);
    }

    const now = new Date();
    const projectId = nanoid();
    tx.insert(projects)
      .values({
        id: projectId,
        background: hypothesis.explanation,
        summary: hypothesis.title,
        visibility: 'private',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    insertEvent(tx, {
      projectId,
      eventType: 'project_created',
      payload: { summary: hypothesis.title },
      rationale: hypothesis.explanation,
      occurredAt: now,
      createdAt: now,
    });
    const promotionEventId = insertEvent(tx, {
      projectId,
      eventType: 'hypothesis_promoted',
      payload: { hypothesisId },
      rationale: hypothesis.explanation,
      occurredAt: now,
      createdAt: now,
    });
    const observationIds = hypothesisObservationIds(tx, hypothesisId);
    if (observationIds.length > 0) {
      tx.insert(eventEvidence)
        .values(
          observationIds.map((observationId) => ({
            id: nanoid(),
            eventId: promotionEventId,
            observationId,
          })),
        )
        .run();
    }
    insertCorrection(tx, {
      targetType: 'project_hypothesis',
      targetId: hypothesisId,
      correctionType: 'hypothesis_promoted',
      payload: { promotedProjectId: projectId },
      createdAt: now,
    });
    tx.update(projectHypotheses)
      .set({ state: 'promoted', promotedProjectId: projectId })
      .where(eq(projectHypotheses.id, hypothesisId))
      .run();
    projectProjectInTransaction(tx, projectId);
    return projectId;
  });
}

export async function dismissHypothesis(hypothesisId: string, rationale: string): Promise<void> {
  requireText(hypothesisId, 'Hypothesis ID');
  requireText(rationale, 'Rationale');

  getDatabase().db.transaction((tx) => {
    const hypothesis = requireHypothesis(tx, hypothesisId);
    if (hypothesis.state !== 'emerging') {
      throw new Error(`Hypothesis is not emerging: ${hypothesisId}`);
    }
    insertCorrection(tx, {
      targetType: 'project_hypothesis',
      targetId: hypothesisId,
      correctionType: 'hypothesis_dismissed',
      payload: { rationale: rationale.trim() },
      createdAt: new Date(),
    });
    tx.update(projectHypotheses)
      .set({ state: 'dismissed' })
      .where(eq(projectHypotheses.id, hypothesisId))
      .run();
  });
}

function insertCorrection(
  tx: Transaction,
  input: {
    targetType: 'observation' | 'project_event' | 'project' | 'project_hypothesis';
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

function requireHypothesis(tx: Transaction, hypothesisId: string) {
  const hypothesis = tx
    .select()
    .from(projectHypotheses)
    .where(eq(projectHypotheses.id, hypothesisId))
    .get();
  if (!hypothesis) throw new Error(`Hypothesis not found: ${hypothesisId}`);
  return hypothesis;
}

function findObservationCorrection(
  tx: Transaction,
  observationId: string,
  correctionType: string,
) {
  return tx
    .select()
    .from(corrections)
    .where(
      and(
        eq(corrections.targetType, 'observation'),
        eq(corrections.targetId, observationId),
        eq(corrections.correctionType, correctionType),
      ),
    )
    .get();
}

function observationAttachmentProjectIds(tx: Transaction, observationId: string) {
  return tx
    .select({ projectId: projectEvents.projectId })
    .from(eventEvidence)
    .innerJoin(projectEvents, eq(eventEvidence.eventId, projectEvents.id))
    .where(
      and(
        eq(eventEvidence.observationId, observationId),
        eq(projectEvents.eventType, 'observation_attached'),
      ),
    )
    .all()
    .map(({ projectId }) => projectId);
}

function hypothesisObservationIds(tx: Transaction, hypothesisId: string) {
  const evidence = tx
    .select()
    .from(hypothesisEvidence)
    .where(eq(hypothesisEvidence.hypothesisId, hypothesisId))
    .all();
  const signalIds = evidence.flatMap(({ signalId }) => (signalId ? [signalId] : []));
  const signalRows = signalIds.length
    ? tx.select().from(signalEvidence).where(inArray(signalEvidence.signalId, signalIds)).all()
    : [];
  return [
    ...new Set([
      ...evidence.flatMap(({ observationId }) => (observationId ? [observationId] : [])),
      ...signalRows.map(({ observationId }) => observationId),
    ]),
  ];
}

function projectMergeTargets(tx: Transaction) {
  const mergeTargets = new Map<string, string>();
  const mergeCorrections = tx
    .select()
    .from(corrections)
    .where(
      and(
        eq(corrections.targetType, 'project'),
        eq(corrections.correctionType, 'project_merged'),
      ),
    )
    .all();
  for (const correction of mergeCorrections) {
    const targetProjectId = requireCorrectionPayloadText(correction.payload, 'targetProjectId');
    const existingTargetId = mergeTargets.get(correction.targetId);
    if (existingTargetId && existingTargetId !== targetProjectId) {
      throw new Error(`Project ${correction.targetId} has conflicting merge corrections`);
    }
    mergeTargets.set(correction.targetId, targetProjectId);
  }
  return mergeTargets;
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

function requireCorrectionPayloadText(payloadJson: string, field: string) {
  const payload = JSON.parse(payloadJson) as unknown;
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload) ||
    typeof (payload as Record<string, unknown>)[field] !== 'string' ||
    !(payload as Record<string, string>)[field].trim()
  ) {
    throw new Error(`Correction has invalid ${field}`);
  }
  return (payload as Record<string, string>)[field];
}

function requireText(value: string, label: string) {
  if (!value?.trim()) throw new Error(`${label} is required`);
}
