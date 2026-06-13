import { z } from 'zod';

export const observationTypes = [
  'progress',
  'idea',
  'interest',
  'obstacle',
  'question',
  'commitment',
  'decision_signal',
  'project_signal',
  'context',
  'other',
] as const;

export const projectEventTypes = [
  'project_created',
  'observation_attached',
  'progress_recorded',
  'direction_changed',
  'obstacle_identified',
  'obstacle_resolved',
  'interest_increased',
  'interest_decreased',
  'lifecycle_inferred',
  'lifecycle_corrected',
  'project_merged',
  'project_archived',
  'hypothesis_promoted',
  'legacy_imported',
  'decision_suggested',
  'decision_confirmed',
] as const;

const boundedId = z.string().min(1).max(200);
const boundedReference = z.string().min(1).max(500);
const boundedRationale = z.string().min(1).max(1000);
const isoDatetime = z.string().datetime();

const observationBase = {
  idempotencyKey: boundedId,
  summary: z.string().min(1).max(1000),
  type: z.enum(observationTypes),
  sourceConversationRef: boundedReference,
  sourceMessageRef: boundedReference,
  sourceQuote: z.string().min(1).max(500),
  observedAt: isoDatetime,
};

export const recordObservationInput = z.union([
  z
    .object({
      ...observationBase,
      proposedProjectId: boundedId,
      assignmentConfidence: z.number().int().min(0).max(100),
      assignmentRationale: boundedRationale,
    })
    .strict(),
  z
    .object({
      ...observationBase,
      proposedProjectId: z.never().optional(),
      assignmentConfidence: z.never().optional(),
      assignmentRationale: z.never().optional(),
    })
    .strict(),
]);

export const recordProjectEventInput = z
  .object({
    idempotencyKey: boundedId,
    projectId: boundedId,
    eventType: z.enum(projectEventTypes),
    payload: z.record(z.unknown()),
    evidenceObservationIds: z.array(boundedId).min(1),
    rationale: boundedRationale,
    occurredAt: isoDatetime,
  })
  .strict();

export const attachObservationToProjectInput = z
  .object({
    idempotencyKey: boundedId,
    observationId: boundedId,
    projectId: boundedId,
    rationale: boundedRationale,
    occurredAt: isoDatetime,
  })
  .strict();

export const upsertProjectHypothesisInput = z
  .object({
    stableKey: boundedId,
    title: z.string().min(1).max(200),
    explanation: z.string().min(1).max(2000),
    observationIds: z.array(boundedId).min(1),
  })
  .strict();

export const suggestDecisionInput = z
  .object({
    idempotencyKey: boundedId,
    projectId: boundedId,
    question: z.string().min(1).max(1000),
    evidenceObservationIds: z.array(boundedId).min(1),
    rationale: boundedRationale,
  })
  .strict();

export type ObservationType = (typeof observationTypes)[number];
export type ProjectEventType = (typeof projectEventTypes)[number];
export type RecordObservationInput = z.infer<typeof recordObservationInput>;
export type RecordProjectEventInput = z.infer<typeof recordProjectEventInput>;
export type AttachObservationToProjectInput = z.infer<typeof attachObservationToProjectInput>;
export type UpsertProjectHypothesisInput = z.infer<typeof upsertProjectHypothesisInput>;
export type SuggestDecisionInput = z.infer<typeof suggestDecisionInput>;
