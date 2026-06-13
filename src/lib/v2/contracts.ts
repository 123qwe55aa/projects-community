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

export const hermesRecordableEventTypes = [
  'progress_recorded',
  'direction_changed',
  'obstacle_identified',
  'obstacle_resolved',
  'interest_increased',
  'interest_decreased',
  'lifecycle_inferred',
] as const;

export type HermesRecordableEventType = (typeof hermesRecordableEventTypes)[number];

const boundedId = z.string().min(1).max(200);
const boundedReference = z.string().min(1).max(500);
const boundedRationale = z.string().min(1).max(1000);
const boundedSummary = z.string().min(1).max(1000);
const boundedBackground = z.string().min(1).max(2000);
const isoDatetime = z.string().datetime();
const lifecycleState = z.enum(['active', 'dormant', 'ended', 'archived']);

const uniqueIds = (minimum: number) =>
  z
    .array(boundedId)
    .min(minimum)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, 'Evidence IDs must be unique');
const boundedUniqueIds = uniqueIds(0);
const requiredBoundedUniqueIds = uniqueIds(1);

const strictPayload = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

const eventBase = {
  idempotencyKey: boundedId,
  projectId: boundedId,
  evidenceObservationIds: requiredBoundedUniqueIds,
  rationale: boundedRationale,
  occurredAt: isoDatetime,
};

const eventInput = <T extends HermesRecordableEventType, P extends z.ZodTypeAny>(
  eventType: T,
  payload: P,
) =>
  z
    .object({
      ...eventBase,
      eventType: z.literal(eventType),
      payload,
    })
    .strict();

const observationBase = {
  idempotencyKey: boundedId,
  summary: boundedSummary,
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

export const recordProjectEventInput = z.discriminatedUnion('eventType', [
  eventInput('progress_recorded', strictPayload({ summary: boundedSummary })),
  eventInput('direction_changed', strictPayload({ summary: boundedSummary })),
  eventInput('obstacle_identified', strictPayload({ obstacle: boundedSummary })),
  eventInput('obstacle_resolved', strictPayload({ obstacle: boundedSummary })),
  eventInput('interest_increased', strictPayload({ theme: boundedSummary })),
  eventInput('interest_decreased', strictPayload({ theme: boundedSummary })),
  eventInput(
    'lifecycle_inferred',
    strictPayload({ state: lifecycleState, rationale: boundedRationale }),
  ),
]);

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
    idempotencyKey: boundedId,
    stableKey: boundedId,
    title: z.string().min(1).max(200),
    explanation: boundedBackground,
    observationIds: boundedUniqueIds.optional(),
    signalIds: boundedUniqueIds.optional(),
  })
  .strict()
  .refine(
    ({ observationIds, signalIds }) => (observationIds?.length ?? 0) + (signalIds?.length ?? 0) > 0,
    'At least one observation or signal evidence ID is required',
  );

export const suggestDecisionInput = z
  .object({
    idempotencyKey: boundedId,
    projectId: boundedId,
    question: boundedSummary,
    evidenceObservationIds: requiredBoundedUniqueIds,
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
