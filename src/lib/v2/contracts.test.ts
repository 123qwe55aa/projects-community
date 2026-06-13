import { describe, expect, it } from 'vitest';
import {
  attachObservationToProjectInput,
  observationTypes,
  projectEventTypes,
  recordObservationInput,
  recordProjectEventInput,
  suggestDecisionInput,
  upsertProjectHypothesisInput,
} from './contracts';

const observedAt = '2026-06-13T10:00:00.000Z';

const validObservation = {
  idempotencyKey: 'hermes:message-1:observation-1',
  summary: 'The project moved to a Hermes-first direction',
  type: 'project_signal',
  sourceConversationRef: 'hermes:conversation-1',
  sourceMessageRef: 'hermes:message-1',
  sourceQuote: 'Hermes should be the entry point',
  observedAt,
} as const;

describe('V2 contracts', () => {
  it('defines observation and lifecycle-aware project event types', () => {
    expect(observationTypes).toContain('project_signal');
    expect(projectEventTypes).toEqual(
      expect.arrayContaining(['lifecycle_inferred', 'lifecycle_corrected', 'project_archived']),
    );
  });

  it('accepts an evidence-backed observation with a complete proposed assignment', () => {
    expect(
      recordObservationInput.parse({
        ...validObservation,
        proposedProjectId: 'project-1',
        assignmentConfidence: 95,
        assignmentRationale: 'The user named the existing project.',
      }).assignmentConfidence,
    ).toBe(95);
  });

  it('rejects events without evidence observations', () => {
    expect(() =>
      recordProjectEventInput.parse({
        idempotencyKey: 'hermes:event-1',
        projectId: 'project-1',
        eventType: 'progress_recorded',
        payload: { summary: 'Progress' },
        evidenceObservationIds: [],
        rationale: 'No evidence',
        occurredAt: observedAt,
      }),
    ).toThrow();
  });

  it.each([
    {
      name: 'confidence missing for a proposed project',
      value: {
        ...validObservation,
        proposedProjectId: 'project-1',
        assignmentRationale: 'The user named the existing project.',
      },
    },
    {
      name: 'rationale missing for a proposed project',
      value: {
        ...validObservation,
        proposedProjectId: 'project-1',
        assignmentConfidence: 95,
      },
    },
    {
      name: 'confidence present without a proposed project',
      value: { ...validObservation, assignmentConfidence: 95 },
    },
    {
      name: 'rationale present without a proposed project',
      value: { ...validObservation, assignmentRationale: 'Likely related.' },
    },
  ])('rejects conditional assignment when $name', ({ value }) => {
    expect(() => recordObservationInput.parse(value)).toThrow();
  });

  it('rejects strings beyond their bounds and non-ISO datetimes', () => {
    expect(() =>
      recordObservationInput.parse({ ...validObservation, summary: 'x'.repeat(1001) }),
    ).toThrow();
    expect(() =>
      recordObservationInput.parse({ ...validObservation, observedAt: '2026-06-13 10:00:00' }),
    ).toThrow();
    expect(() =>
      recordObservationInput.parse({ ...validObservation, unexpected: 'not allowed' }),
    ).toThrow();
  });

  it('accepts strict inputs for attaching, hypothesizing, and suggesting decisions', () => {
    expect(
      attachObservationToProjectInput.parse({
        idempotencyKey: 'hermes:attach-1',
        observationId: 'observation-1',
        projectId: 'project-1',
        rationale: 'The observation explicitly refers to the project.',
        occurredAt: observedAt,
      }).projectId,
    ).toBe('project-1');

    expect(
      upsertProjectHypothesisInput.parse({
        stableKey: 'hermes:hypothesis-1',
        title: 'Hermes-first project observatory',
        explanation: 'Several observations describe the same emerging project.',
        observationIds: ['observation-1'],
      }).observationIds,
    ).toEqual(['observation-1']);

    expect(
      suggestDecisionInput.parse({
        idempotencyKey: 'hermes:decision-1',
        projectId: 'project-1',
        question: 'Should the dashboard prioritize recent changes?',
        evidenceObservationIds: ['observation-1'],
        rationale: 'The observation identifies a consequential product choice.',
      }).question,
    ).toContain('dashboard');
  });
});
