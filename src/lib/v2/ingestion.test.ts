import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  corrections,
  decisions,
  eventEvidence,
  hypothesisEvidence,
  ingestionReceipts,
  observations,
  projectEvents,
  projectHypotheses,
  projects,
  signals,
} from '@/db/schema';
import { createTestDatabase } from '@/test/db';
import {
  AUTO_ASSIGN_CONFIDENCE,
  attachObservationToProject,
  recordObservation,
  recordProjectEvent,
  suggestDecision,
  upsertProjectHypothesis,
} from './ingestion';

const occurredAt = '2026-06-13T10:00:00.000Z';
const validObservation = {
  idempotencyKey: 'hermes:observation-1',
  summary: 'Hermes ingestion is underway',
  type: 'progress' as const,
  sourceConversationRef: 'hermes:conversation-1',
  sourceMessageRef: 'hermes:message-1',
  sourceQuote: 'I started the ingestion work',
  observedAt: occurredAt,
};
const validEvent = {
  idempotencyKey: 'hermes:event-1',
  projectId: 'project-1',
  eventType: 'progress_recorded' as const,
  payload: { summary: 'Hermes ingestion is underway' },
  evidenceObservationIds: ['observation-1'],
  rationale: 'The observation describes concrete progress.',
  occurredAt,
};

let testDatabase: ReturnType<typeof createTestDatabase>;

beforeEach(() => {
  testDatabase = createTestDatabase();
  testDatabase.db.insert(projects).values({ id: 'project-1', summary: 'Project one' }).run();
});

afterEach(() => {
  testDatabase.cleanup();
});

describe('Hermes V2 ingestion', () => {
  it('deduplicates recordObservation and returns the original result', async () => {
    const first = await recordObservation(validObservation);
    const second = await recordObservation(validObservation);

    expect(second).toEqual({ ...first, deduplicated: true });
    expect(testDatabase.db.select().from(observations).all()).toHaveLength(1);
    expect(testDatabase.db.select().from(ingestionReceipts).all()).toHaveLength(1);
  });

  it('auto-attaches at the confidence boundary and leaves lower or absent assignments pending', async () => {
    expect(AUTO_ASSIGN_CONFIDENCE).toBe(85);
    const accepted = await recordObservation({
      ...validObservation,
      proposedProjectId: 'project-1',
      assignmentConfidence: 85,
      assignmentRationale: 'The project is explicit.',
    });
    const below = await recordObservation({
      ...validObservation,
      idempotencyKey: 'hermes:observation-2',
      proposedProjectId: 'project-1',
      assignmentConfidence: 84,
      assignmentRationale: 'The project is only likely.',
    });
    const absent = await recordObservation({
      ...validObservation,
      idempotencyKey: 'hermes:observation-3',
    });

    expect(accepted).toMatchObject({ reviewStatus: 'accepted', attachedProjectId: 'project-1' });
    expect(below).toMatchObject({ reviewStatus: 'pending', attachedProjectId: null });
    expect(absent).toMatchObject({ reviewStatus: 'pending', attachedProjectId: null });
    expect(testDatabase.db.select().from(projectEvents).all()).toHaveLength(1);
    expect(testDatabase.db.select().from(eventEvidence).all()).toHaveLength(1);
  });

  it('uses the original bounded idempotency key for an automatic attachment event', async () => {
    const idempotencyKey = 'x'.repeat(200);
    await recordObservation({
      ...validObservation,
      idempotencyKey,
      proposedProjectId: 'project-1',
      assignmentConfidence: 100,
      assignmentRationale: 'The project is explicit.',
    });

    expect(testDatabase.db.select().from(projectEvents).get()?.idempotencyKey).toBe(idempotencyKey);
  });

  it('preserves an observation as pending when its proposed project is unrecognized', async () => {
    const result = await recordObservation({
      ...validObservation,
      proposedProjectId: 'missing',
      assignmentConfidence: 100,
      assignmentRationale: 'This still needs validation.',
    });

    expect(result).toMatchObject({ reviewStatus: 'pending', attachedProjectId: null });
    expect(testDatabase.db.select().from(observations).get()).toMatchObject({
      proposedProjectId: null,
      assignmentConfidence: 100,
      assignmentRationale: 'This still needs validation.',
    });
    expect(testDatabase.db.select().from(projectEvents).all()).toHaveLength(0);
    expect(testDatabase.db.select().from(eventEvidence).all()).toHaveLength(0);
    expect(testDatabase.db.select().from(ingestionReceipts).all()).toHaveLength(1);
  });

  it('writes nothing when an ingestion payload is schema-invalid', async () => {
    await expect(
      recordObservation({ ...validObservation, unexpected: 'not allowed' } as never),
    ).rejects.toThrow();

    expect(testDatabase.db.select().from(observations).all()).toHaveLength(0);
    expect(testDatabase.db.select().from(projectEvents).all()).toHaveLength(0);
    expect(testDatabase.db.select().from(eventEvidence).all()).toHaveLength(0);
    expect(testDatabase.db.select().from(hypothesisEvidence).all()).toHaveLength(0);
    expect(testDatabase.db.select().from(ingestionReceipts).all()).toHaveLength(0);
  });

  it('records an exact project event with all evidence and deduplicates retries', async () => {
    seedObservation('observation-1');
    seedObservation('observation-2');
    const input = { ...validEvent, evidenceObservationIds: ['observation-1', 'observation-2'] };

    const first = await recordProjectEvent(input);
    const second = await recordProjectEvent(input);
    const event = testDatabase.db.select().from(projectEvents).get();

    expect(second).toEqual({ ...first, deduplicated: true });
    expect(event).toMatchObject({
      projectId: input.projectId,
      eventType: input.eventType,
      payload: JSON.stringify(input.payload),
      rationale: input.rationale,
      actor: 'hermes',
      schemaVersion: 1,
    });
    expect(testDatabase.db.select().from(eventEvidence).all()).toHaveLength(2);
  });

  it('rolls back recordProjectEvent when project or evidence is missing', async () => {
    seedObservation('observation-1');
    await expect(
      recordProjectEvent({ ...validEvent, evidenceObservationIds: ['observation-1', 'missing'] }),
    ).rejects.toThrow('Observation not found: missing');
    await expect(recordProjectEvent({ ...validEvent, projectId: 'missing' })).rejects.toThrow(
      'Project not found: missing',
    );

    expect(testDatabase.db.select().from(projectEvents).all()).toHaveLength(0);
    expect(testDatabase.db.select().from(eventEvidence).all()).toHaveLength(0);
    expect(testDatabase.db.select().from(ingestionReceipts).all()).toHaveLength(0);
  });

  it('attaches an observation using only an immutable event and evidence link', async () => {
    seedObservation('observation-1');
    const input = {
      idempotencyKey: 'hermes:attach-1',
      observationId: 'observation-1',
      projectId: 'project-1',
      rationale: 'The user confirmed the project.',
      occurredAt,
    };

    const first = await attachObservationToProject(input);
    const second = await attachObservationToProject(input);
    const observation = testDatabase.db
      .select()
      .from(observations)
      .where(eq(observations.id, 'observation-1'))
      .get();

    expect(second).toEqual({ ...first, deduplicated: true });
    expect(observation?.proposedProjectId).toBeNull();
    expect(testDatabase.db.select().from(projectEvents).get()?.eventType).toBe(
      'observation_attached',
    );
    expect(testDatabase.db.select().from(eventEvidence).all()).toHaveLength(1);
  });

  it('rolls back attachment when the project or observation is missing', async () => {
    await expect(
      attachObservationToProject({
        idempotencyKey: 'hermes:attach-missing',
        observationId: 'missing',
        projectId: 'project-1',
        rationale: 'Missing evidence.',
        occurredAt,
      }),
    ).rejects.toThrow('Observation not found: missing');

    expect(testDatabase.db.select().from(projectEvents).all()).toHaveLength(0);
    expect(testDatabase.db.select().from(ingestionReceipts).all()).toHaveLength(0);
  });

  it('creates and updates a hypothesis while adding only missing evidence', async () => {
    seedObservation('observation-1');
    seedObservation('observation-2');
    const first = await upsertProjectHypothesis({
      idempotencyKey: 'hermes:hypothesis-1',
      stableKey: 'hypothesis:ingestion',
      title: 'Initial title',
      explanation: 'Initial explanation',
      observationIds: ['observation-1'],
    });
    const second = await upsertProjectHypothesis({
      idempotencyKey: 'hermes:hypothesis-2',
      stableKey: 'hypothesis:ingestion',
      title: 'Updated title',
      explanation: 'Updated explanation',
      observationIds: ['observation-1', 'observation-2'],
    });
    const retry = await upsertProjectHypothesis({
      idempotencyKey: 'hermes:hypothesis-2',
      stableKey: 'hypothesis:ingestion',
      title: 'Ignored on retry',
      explanation: 'Ignored on retry',
      observationIds: ['observation-2'],
    });

    expect(first.created).toBe(true);
    expect(second).toEqual({ hypothesisId: first.hypothesisId, created: false });
    expect(retry).toEqual(second);
    expect(testDatabase.db.select().from(hypothesisEvidence).all()).toHaveLength(2);
    expect(testDatabase.db.select().from(projectHypotheses).get()).toMatchObject({
      title: 'Updated title',
      explanation: 'Updated explanation',
      state: 'emerging',
    });
  });

  it.each(['promoted', 'dismissed'] as const)(
    'rejects updates to a %s hypothesis without changing fields or evidence',
    async (state) => {
      seedObservation('observation-1');
      seedObservation('observation-2');
      const created = await upsertProjectHypothesis({
        idempotencyKey: `hermes:${state}-hypothesis-create`,
        stableKey: `hypothesis:${state}`,
        title: 'Original title',
        explanation: 'Original explanation',
        observationIds: ['observation-1'],
      });
      testDatabase.db
        .update(projectHypotheses)
        .set({ state })
        .where(eq(projectHypotheses.id, created.hypothesisId))
        .run();
      const hypothesisBefore = testDatabase.db
        .select()
        .from(projectHypotheses)
        .where(eq(projectHypotheses.id, created.hypothesisId))
        .get();
      const evidenceBefore = testDatabase.db.select().from(hypothesisEvidence).all();

      await expect(
        upsertProjectHypothesis({
          idempotencyKey: `hermes:${state}-hypothesis-update`,
          stableKey: `hypothesis:${state}`,
          title: 'Changed title',
          explanation: 'Changed explanation',
          observationIds: ['observation-2'],
        }),
      ).rejects.toThrow(`Hypothesis ${created.hypothesisId} is ${state} and cannot be updated`);

      expect(
        testDatabase.db
          .select()
          .from(projectHypotheses)
          .where(eq(projectHypotheses.id, created.hypothesisId))
          .get(),
      ).toEqual(hypothesisBefore);
      expect(testDatabase.db.select().from(hypothesisEvidence).all()).toEqual(evidenceBefore);
      expect(
        testDatabase.db
          .select()
          .from(ingestionReceipts)
          .where(eq(ingestionReceipts.idempotencyKey, `hermes:${state}-hypothesis-update`))
          .get(),
      ).toBeUndefined();
    },
  );

  it('replays a successful hypothesis upsert receipt after the hypothesis is promoted', async () => {
    seedObservation('observation-1');
    const input = {
      idempotencyKey: 'hermes:hypothesis-before-promotion',
      stableKey: 'hypothesis:before-promotion',
      title: 'Original title',
      explanation: 'Original explanation',
      observationIds: ['observation-1'],
    };
    const first = await upsertProjectHypothesis(input);
    testDatabase.db
      .update(projectHypotheses)
      .set({ state: 'promoted' })
      .where(eq(projectHypotheses.id, first.hypothesisId))
      .run();

    await expect(
      upsertProjectHypothesis({
        ...input,
        title: 'Ignored retry title',
        explanation: 'Ignored retry explanation',
      }),
    ).resolves.toEqual(first);
    expect(testDatabase.db.select().from(projectHypotheses).get()).toMatchObject({
      title: input.title,
      explanation: input.explanation,
      state: 'promoted',
    });
    expect(testDatabase.db.select().from(hypothesisEvidence).all()).toHaveLength(1);
    expect(testDatabase.db.select().from(ingestionReceipts).all()).toHaveLength(1);
  });

  it('supports signal-only hypotheses and rolls back missing evidence', async () => {
    seedSignal('signal-1');
    const result = await upsertProjectHypothesis({
      idempotencyKey: 'hermes:signal-hypothesis',
      stableKey: 'hypothesis:signal-only',
      title: 'Signal-only',
      explanation: 'Supported by a signal.',
      signalIds: ['signal-1'],
    });

    expect(result.created).toBe(true);
    expect(testDatabase.db.select().from(hypothesisEvidence).get()?.signalId).toBe('signal-1');

    await expect(
      upsertProjectHypothesis({
        idempotencyKey: 'hermes:missing-hypothesis',
        stableKey: 'hypothesis:missing',
        title: 'Missing',
        explanation: 'Missing evidence.',
        observationIds: ['missing'],
      }),
    ).rejects.toThrow('Observation not found: missing');
    expect(
      testDatabase.db
        .select()
        .from(projectHypotheses)
        .where(eq(projectHypotheses.stableKey, 'hypothesis:missing'))
        .get(),
    ).toBeUndefined();
  });

  it('records and deduplicates a decision suggestion without creating a V1 decision', async () => {
    seedObservation('observation-1');
    const input = {
      idempotencyKey: 'hermes:decision-suggestion-1',
      projectId: 'project-1',
      question: 'Should ingestion be exposed through MCP?',
      evidenceObservationIds: ['observation-1'],
      rationale: 'This affects the integration boundary.',
    };

    const first = await suggestDecision(input);
    const second = await suggestDecision(input);

    expect(second).toEqual({ ...first, deduplicated: true });
    expect(testDatabase.db.select().from(projectEvents).get()).toMatchObject({
      eventType: 'decision_suggested',
      payload: JSON.stringify({ question: input.question }),
    });
    expect(testDatabase.db.select().from(decisions).all()).toHaveLength(0);
  });

  it('prevents cross-tool reuse of an idempotency key', async () => {
    await recordObservation(validObservation);
    seedObservation('observation-1');

    await expect(
      recordProjectEvent({ ...validEvent, idempotencyKey: validObservation.idempotencyKey }),
    ).rejects.toThrow(
      'Idempotency key hermes:observation-1 was already used by recordObservation',
    );
    expect(testDatabase.db.select().from(projectEvents).all()).toHaveLength(0);
  });

  it('rejects every new project event write to a merged source', async () => {
    seedObservation('observation-1');
    seedMergedProject('project-1', 'project-2');
    const readOnlyError = 'Project project-1 is merged into Project project-2 and is read-only';

    await expect(recordProjectEvent(validEvent)).rejects.toThrow(readOnlyError);
    await expect(
      attachObservationToProject({
        idempotencyKey: 'hermes:attach-merged',
        observationId: 'observation-1',
        projectId: 'project-1',
        rationale: 'Attach to merged source.',
        occurredAt,
      }),
    ).rejects.toThrow(readOnlyError);
    await expect(
      suggestDecision({
        idempotencyKey: 'hermes:suggest-merged',
        projectId: 'project-1',
        question: 'Should this write be rejected?',
        evidenceObservationIds: ['observation-1'],
        rationale: 'Merged sources are read-only.',
      }),
    ).rejects.toThrow(readOnlyError);
    await expect(
      recordObservation({
        ...validObservation,
        idempotencyKey: 'hermes:auto-attach-merged',
        proposedProjectId: 'project-1',
        assignmentConfidence: 100,
        assignmentRationale: 'Would auto-attach to a merged source.',
      }),
    ).rejects.toThrow(readOnlyError);

    expect(testDatabase.db.select().from(projectEvents).all()).toHaveLength(0);
    expect(testDatabase.db.select().from(eventEvidence).all()).toHaveLength(0);
    expect(testDatabase.db.select().from(ingestionReceipts).all()).toHaveLength(0);
    expect(testDatabase.db.select().from(observations).all()).toHaveLength(1);
  });

  it('allows a durable ingestion receipt replay after its project becomes a merged source', async () => {
    seedObservation('observation-1');
    const first = await recordProjectEvent(validEvent);
    seedMergedProject('project-1', 'project-2');

    await expect(recordProjectEvent(validEvent)).resolves.toEqual({
      ...first,
      deduplicated: true,
    });
    expect(testDatabase.db.select().from(projectEvents).all()).toHaveLength(1);
    expect(testDatabase.db.select().from(ingestionReceipts).all()).toHaveLength(1);
  });

  it('makes ingestion receipts immutable', async () => {
    await recordObservation(validObservation);

    expect(() =>
      testDatabase.sqlite.prepare('UPDATE ingestion_receipts SET result_json = result_json').run(),
    ).toThrow('ingestion_receipts is immutable');
    expect(() => testDatabase.sqlite.prepare('DELETE FROM ingestion_receipts').run()).toThrow(
      'ingestion_receipts is immutable',
    );
  });
});

function seedObservation(id: string) {
  const now = new Date(occurredAt);
  testDatabase.db
    .insert(observations)
    .values({
      id,
      idempotencyKey: `seed:${id}`,
      summary: id,
      type: 'progress',
      sourceQuote: id,
      sourceConversationRef: 'seed:conversation',
      sourceMessageRef: `seed:${id}`,
      observedAt: now,
      recordedAt: now,
      actor: 'test',
      schemaVersion: 1,
    })
    .run();
}

function seedSignal(id: string) {
  const now = new Date(occurredAt);
  testDatabase.db
    .insert(signals)
    .values({
      id,
      stableKey: id,
      title: id,
      description: id,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

function seedMergedProject(sourceProjectId: string, targetProjectId: string) {
  testDatabase.db.insert(projects).values({ id: targetProjectId, summary: 'Merge target' }).run();
  testDatabase.db
    .insert(corrections)
    .values({
      id: `merge:${sourceProjectId}`,
      targetType: 'project',
      targetId: sourceProjectId,
      correctionType: 'project_merged',
      payload: JSON.stringify({ targetProjectId, rationale: 'Merged' }),
      actor: 'user',
      createdAt: new Date(occurredAt),
    })
    .run();
}
