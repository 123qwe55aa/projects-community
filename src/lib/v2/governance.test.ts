import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { getDecision, getProject } from '@/db/helpers';
import {
  corrections,
  decisionLinks,
  decisions,
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
import { createTestDatabase } from '@/test/db';
import { getNeedsAttention, getProjectHypotheses, getProjectTimeline } from './queries';
import { getCurrentProjectSnapshot } from './projection/project';
import {
  archiveProject,
  confirmDecisionSuggestion,
  confirmObservation,
  correctLifecycle,
  dismissDecisionSuggestion,
  dismissHypothesis,
  ignoreObservation,
  mergeProjects,
  promoteHypothesis,
} from './governance';

let testDatabase: ReturnType<typeof createTestDatabase>;

beforeEach(() => {
  testDatabase = createTestDatabase();
  seedProject('project-1', 'Hermes first');
  seedProject('project-2', 'Community map');
  seedObservation('obs-1', 'project-1');
});

afterEach(() => {
  testDatabase.cleanup();
});

describe('observation governance', () => {
  it('confirms an Observation by appending a correction and attachment event', async () => {
    await confirmObservation({ observationId: 'obs-1', projectId: 'project-1' });

    expect(await getNeedsAttention()).toHaveLength(0);
    expect(latestEvent()).toMatchObject({
      projectId: 'project-1',
      eventType: 'observation_attached',
      actor: 'user',
    });
    expect(testDatabase.db.select().from(corrections).get()).toMatchObject({
      targetType: 'observation',
      targetId: 'obs-1',
      correctionType: 'observation_confirmed',
      actor: 'user',
    });
    expect(testDatabase.db.select().from(eventEvidence).get()).toMatchObject({
      observationId: 'obs-1',
    });
    expect(currentSnapshots('project-1')).toHaveLength(1);
  });

  it('ignores an Observation without deleting it', async () => {
    await ignoreObservation('obs-1');

    expect(testDatabase.db.select().from(observations).all()).toHaveLength(1);
    expect(await getNeedsAttention()).toHaveLength(0);
    expect(testDatabase.db.select().from(corrections).get()).toMatchObject({
      targetType: 'observation',
      targetId: 'obs-1',
      correctionType: 'observation_ignored',
    });
  });

  it('rolls back the correction when an Observation cannot be attached', async () => {
    await expect(
      confirmObservation({ observationId: 'obs-1', projectId: 'missing' }),
    ).rejects.toThrow('Project not found: missing');

    expect(testDatabase.db.select().from(corrections).all()).toHaveLength(0);
    expect(testDatabase.db.select().from(projectEvents).all()).toHaveLength(0);
    expect(await getNeedsAttention()).toHaveLength(1);
  });

  it('treats repeated confirmation as a replay and rejects conflicting reattachment', async () => {
    await confirmObservation({ observationId: 'obs-1', projectId: 'project-1' });
    await confirmObservation({ observationId: 'obs-1', projectId: 'project-1' });

    expect(testDatabase.db.select().from(corrections).all()).toHaveLength(1);
    expect(testDatabase.db.select().from(projectEvents).all()).toHaveLength(1);
    await expect(
      confirmObservation({ observationId: 'obs-1', projectId: 'project-2' }),
    ).rejects.toThrow('Observation is already attached to Project project-1');
  });

  it('keeps confirmation and ignore terminal transitions mutually exclusive and replay-safe', async () => {
    await ignoreObservation('obs-1');
    await ignoreObservation('obs-1');

    expect(testDatabase.db.select().from(corrections).all()).toHaveLength(1);
    await expect(
      confirmObservation({ observationId: 'obs-1', projectId: 'project-1' }),
    ).rejects.toThrow('Observation is already ignored: obs-1');

    seedObservation('obs-confirmed', 'project-1');
    await confirmObservation({ observationId: 'obs-confirmed', projectId: 'project-1' });
    await expect(ignoreObservation('obs-confirmed')).rejects.toThrow(
      'Observation is already confirmed: obs-confirmed',
    );
  });
});

describe('project governance', () => {
  it('corrects lifecycle state through a correction and new projection', async () => {
    await correctLifecycle({
      projectId: 'project-1',
      state: 'active',
      rationale: 'Still active',
    });

    expect((await getCurrentProjectSnapshot('project-1'))?.lifecycleState).toBe('active');
    expect(latestEvent()).toMatchObject({
      projectId: 'project-1',
      eventType: 'lifecycle_corrected',
      actor: 'user',
    });
  });

  it('merges projects while preserving both source rows and projecting both projects', async () => {
    await mergeProjects({
      sourceProjectId: 'project-1',
      targetProjectId: 'project-2',
      rationale: 'These are one effort',
    });

    expect(testDatabase.db.select().from(projects).all()).toHaveLength(2);
    expect(latestEvent()).toMatchObject({
      projectId: 'project-2',
      eventType: 'project_merged',
      payload: JSON.stringify({
        sourceProjectId: 'project-1',
        targetProjectId: 'project-2',
      }),
    });
    expect(currentSnapshots('project-1')).toHaveLength(1);
    expect(currentSnapshots('project-2')).toHaveLength(1);
  });

  it('archives the source, exposes its history through the target, and treats an exact replay as a no-op', async () => {
    await confirmObservation({ observationId: 'obs-1', projectId: 'project-1' });
    await mergeProjects({
      sourceProjectId: 'project-1',
      targetProjectId: 'project-2',
      rationale: 'These are one effort',
    });
    const rowCounts = governanceRowCounts();

    await mergeProjects({
      sourceProjectId: 'project-1',
      targetProjectId: 'project-2',
      rationale: 'Replay with a different rationale',
    });
    await confirmObservation({ observationId: 'obs-1', projectId: 'project-1' });

    expect(governanceRowCounts()).toEqual(rowCounts);
    expect(await getCurrentProjectSnapshot('project-1')).toMatchObject({
      lifecycleState: 'archived',
      lifecycleRationale: 'These are one effort',
    });
    expect(await getCurrentProjectSnapshot('project-2')).toMatchObject({
      unresolvedQuestions: '[]',
    });
    expect(
      (await getProjectTimeline('project-2')).map(({ projectId }) => projectId).sort(),
    ).toEqual(['project-1', 'project-2']);
    expect((await getProjectTimeline('project-2')).flatMap(({ evidence }) => evidence)).toHaveLength(
      1,
    );
  });

  it('prevents redirecting a merged source and rejects cycles while allowing merge chains', async () => {
    seedProject('project-3', 'Final home');
    await mergeProjects({
      sourceProjectId: 'project-1',
      targetProjectId: 'project-2',
      rationale: 'First consolidation',
    });

    await expect(
      mergeProjects({
        sourceProjectId: 'project-1',
        targetProjectId: 'project-3',
        rationale: 'Redirect source',
      }),
    ).rejects.toThrow('Project project-1 is already merged into Project project-2');

    await mergeProjects({
      sourceProjectId: 'project-2',
      targetProjectId: 'project-3',
      rationale: 'Consolidate the chain',
    });
    await expect(
      mergeProjects({
        sourceProjectId: 'project-3',
        targetProjectId: 'project-1',
        rationale: 'Close the cycle',
      }),
    ).rejects.toThrow('Merge would create a cycle');
    expect(testDatabase.db.select().from(corrections).all()).toHaveLength(2);
  });

  it('rejects adding a new source through an already-merged intermediate target', async () => {
    seedProject('project-3', 'Final home');
    await mergeProjects({
      sourceProjectId: 'project-2',
      targetProjectId: 'project-3',
      rationale: 'Establish final target',
    });
    await confirmObservation({ observationId: 'obs-1', projectId: 'project-1' });
    const rowCounts = governanceRowCounts();

    await expect(
      mergeProjects({
        sourceProjectId: 'project-1',
        targetProjectId: 'project-2',
        rationale: 'Join existing chain',
      }),
    ).rejects.toThrow('Project project-2 is merged into Project project-3 and is read-only');

    expect(governanceRowCounts()).toEqual(rowCounts);
    expect((await getProjectTimeline('project-3')).flatMap(({ evidence }) => evidence)).toHaveLength(0);
  });

  it('rejects project writes after the project becomes a merged source', async () => {
    seedDecisionSuggestion('suggestion-event-1');
    seedProject('project-3', 'Another project');
    await mergeProjects({
      sourceProjectId: 'project-1',
      targetProjectId: 'project-2',
      rationale: 'These are one effort',
    });
    const rowCounts = governanceRowCounts();
    const readOnlyError = 'Project project-1 is merged into Project project-2 and is read-only';

    await expect(
      confirmObservation({ observationId: 'obs-1', projectId: 'project-1' }),
    ).rejects.toThrow(readOnlyError);
    await expect(
      correctLifecycle({ projectId: 'project-1', state: 'active', rationale: 'Still active' }),
    ).rejects.toThrow(readOnlyError);
    await expect(
      archiveProject({ projectId: 'project-1', rationale: 'Archive again' }),
    ).rejects.toThrow(readOnlyError);
    await expect(confirmDecisionSuggestion('suggestion-event-1')).rejects.toThrow(readOnlyError);
    await expect(
      mergeProjects({
        sourceProjectId: 'project-3',
        targetProjectId: 'project-1',
        rationale: 'Do not write into a merged source',
      }),
    ).rejects.toThrow(readOnlyError);

    expect(governanceRowCounts()).toEqual(rowCounts);
    expect(testDatabase.db.select().from(decisions).all()).toHaveLength(0);
  });

  it('archives a project without deleting it', async () => {
    await archiveProject({ projectId: 'project-1', rationale: 'Work concluded' });

    expect(testDatabase.db.select().from(projects).all()).toHaveLength(2);
    expect((await getCurrentProjectSnapshot('project-1'))?.lifecycleState).toBe('archived');
    expect(latestEvent()).toMatchObject({
      projectId: 'project-1',
      eventType: 'project_archived',
      payload: JSON.stringify({ rationale: 'Work concluded' }),
    });
  });
});

describe('decision suggestion governance', () => {
  beforeEach(() => {
    seedDecisionSuggestion('suggestion-event-1');
  });

  it('confirms a pending Decision suggestion exactly once', async () => {
    const decisionId = await confirmDecisionSuggestion('suggestion-event-1');

    expect(await getDecision(decisionId)).not.toBeNull();
    await expect(confirmDecisionSuggestion('suggestion-event-1')).resolves.toBe(decisionId);
    expect(testDatabase.db.select().from(decisions).all()).toHaveLength(1);
    expect(testDatabase.db.select().from(decisionLinks).all()).toHaveLength(1);
    expect(latestEvent()).toMatchObject({
      projectId: 'project-1',
      eventType: 'decision_confirmed',
      actor: 'user',
    });
  });

  it('dismisses a pending Decision suggestion without creating a Decision', async () => {
    await dismissDecisionSuggestion('suggestion-event-1', 'Not a real decision');
    await dismissDecisionSuggestion('suggestion-event-1', 'Repeated dismissal');

    expect(testDatabase.db.select().from(decisions).all()).toHaveLength(0);
    expect(testDatabase.db.select().from(projectEvents).all()).toHaveLength(1);
    expect(testDatabase.db.select().from(corrections).get()).toMatchObject({
      targetType: 'project_event',
      targetId: 'suggestion-event-1',
      correctionType: 'decision_suggestion_dismissed',
      payload: JSON.stringify({ rationale: 'Not a real decision' }),
    });
  });

  it('rejects dismissal after confirmation', async () => {
    await confirmDecisionSuggestion('suggestion-event-1');

    await expect(
      dismissDecisionSuggestion('suggestion-event-1', 'Changed my mind'),
    ).rejects.toThrow('Decision suggestion is already confirmed: suggestion-event-1');
  });

  it('rejects confirmation after dismissal', async () => {
    await dismissDecisionSuggestion('suggestion-event-1', 'Not a real decision');

    await expect(confirmDecisionSuggestion('suggestion-event-1')).rejects.toThrow(
      'Decision suggestion is already dismissed: suggestion-event-1',
    );
  });
});

describe('project hypothesis governance', () => {
  beforeEach(() => {
    seedHypothesis('hypothesis-1');
  });

  it('promotes a hypothesis into a V1-compatible formal Project while preserving evidence', async () => {
    const projectId = await promoteHypothesis('hypothesis-1');

    expect(await getProject(projectId)).toMatchObject({
      background: 'Repeated work suggests a formal project.',
      summary: 'Hermes hypothesis',
      visibility: 'private',
    });
    expect(
      testDatabase.db
        .select()
        .from(projectEvents)
        .where(eq(projectEvents.projectId, projectId))
        .all()
        .map(({ eventType }) => eventType),
    ).toEqual(['project_created', 'hypothesis_promoted']);
    expect((await getProjectTimeline(projectId)).flatMap(({ evidence }) => evidence)).toHaveLength(2);
    expect(currentSnapshots(projectId)).toHaveLength(1);
    expect(
      testDatabase.db
        .select()
        .from(projectHypotheses)
        .where(eq(projectHypotheses.id, 'hypothesis-1'))
        .get(),
    ).toMatchObject({ state: 'promoted', promotedProjectId: projectId });
    expect(testDatabase.db.select().from(hypothesisEvidence).all()).toHaveLength(2);
  });

  it('returns the promoted Project when promotion is retried', async () => {
    const projectId = await promoteHypothesis('hypothesis-1');

    await expect(promoteHypothesis('hypothesis-1')).resolves.toBe(projectId);
    expect(testDatabase.db.select().from(projects).all()).toHaveLength(3);
    expect(
      testDatabase.db
        .select()
        .from(corrections)
        .where(eq(corrections.targetId, 'hypothesis-1'))
        .all(),
    ).toEqual([
      expect.objectContaining({
        targetType: 'project_hypothesis',
        correctionType: 'hypothesis_promoted',
        payload: JSON.stringify({ promotedProjectId: projectId }),
      }),
    ]);
  });

  it('dismisses a hypothesis through a correction and state change without deleting evidence', async () => {
    await dismissHypothesis('hypothesis-1', 'Not a Project');
    await dismissHypothesis('hypothesis-1', 'Repeated dismissal');

    expect((await getProjectHypotheses()).find((item) => item.id === 'hypothesis-1')).toBeUndefined();
    expect(testDatabase.db.select().from(hypothesisEvidence).all()).toHaveLength(2);
    expect(
      testDatabase.db
        .select()
        .from(projectHypotheses)
        .where(eq(projectHypotheses.id, 'hypothesis-1'))
        .get(),
    ).toMatchObject({ state: 'dismissed', promotedProjectId: null });
    expect(testDatabase.db.select().from(corrections).get()).toMatchObject({
      targetType: 'project_hypothesis',
      targetId: 'hypothesis-1',
      correctionType: 'hypothesis_dismissed',
      payload: JSON.stringify({ rationale: 'Not a Project' }),
    });
    expect(testDatabase.db.select().from(corrections).all()).toHaveLength(1);
  });

  it('rejects dismissal after a hypothesis is promoted', async () => {
    await promoteHypothesis('hypothesis-1');

    await expect(dismissHypothesis('hypothesis-1', 'Changed my mind')).rejects.toThrow(
      'Hypothesis is not emerging: hypothesis-1',
    );
  });
});

function seedProject(id: string, summary: string) {
  testDatabase.db
    .insert(projects)
    .values({
      id,
      summary,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    })
    .run();
}

function seedObservation(id: string, proposedProjectId: string) {
  const now = new Date('2026-06-13T10:00:00.000Z');
  testDatabase.db
    .insert(observations)
    .values({
      id,
      idempotencyKey: `seed:${id}`,
      summary: 'Observation awaiting review',
      type: 'progress',
      sourceQuote: 'The Hermes work is moving.',
      sourceConversationRef: 'hermes:conversation-1',
      sourceMessageRef: 'hermes:message-1',
      proposedProjectId,
      assignmentConfidence: 70,
      assignmentRationale: 'Likely related to Hermes',
      observedAt: now,
      recordedAt: now,
      actor: 'hermes',
      schemaVersion: 1,
    })
    .run();
}

function seedDecisionSuggestion(id: string) {
  testDatabase.db
    .insert(projectEvents)
    .values({
      id,
      projectId: 'project-1',
      eventType: 'decision_suggested',
      payload: JSON.stringify({ question: 'Should Hermes own ingestion?' }),
      rationale: 'This changes the product boundary.',
      actor: 'hermes',
      idempotencyKey: `seed:${id}`,
      occurredAt: new Date('2026-06-13T11:00:00.000Z'),
      createdAt: new Date('2026-06-13T11:00:00.000Z'),
      schemaVersion: 1,
    })
    .run();
}

function seedHypothesis(id: string) {
  seedObservation('obs-2', 'project-1');
  testDatabase.db
    .insert(signals)
    .values({
      id: 'signal-1',
      stableKey: 'signal:hypothesis-1',
      title: 'Repeated Hermes work',
      description: 'Repeated evidence',
      createdAt: new Date('2026-06-12T10:00:00.000Z'),
      updatedAt: new Date('2026-06-13T10:00:00.000Z'),
    })
    .run();
  testDatabase.db
    .insert(signalEvidence)
    .values({ id: 'signal-evidence-1', signalId: 'signal-1', observationId: 'obs-2' })
    .run();
  testDatabase.db
    .insert(projectHypotheses)
    .values({
      id,
      stableKey: `hypothesis:${id}`,
      title: 'Hermes hypothesis',
      explanation: 'Repeated work suggests a formal project.',
      state: 'emerging',
      firstSeenAt: new Date('2026-06-12T10:00:00.000Z'),
      lastSeenAt: new Date('2026-06-13T10:00:00.000Z'),
    })
    .run();
  testDatabase.db
    .insert(hypothesisEvidence)
    .values([
      { id: 'hypothesis-evidence-1', hypothesisId: id, observationId: 'obs-1' },
      { id: 'hypothesis-evidence-2', hypothesisId: id, signalId: 'signal-1' },
    ])
    .run();
}

function latestEvent() {
  return testDatabase.db
    .select()
    .from(projectEvents)
    .orderBy(asc(projectEvents.createdAt), asc(projectEvents.id))
    .all()
    .at(-1);
}

function currentSnapshots(projectId: string) {
  return testDatabase.db
    .select()
    .from(projectSnapshots)
    .where(eq(projectSnapshots.projectId, projectId))
    .all()
    .filter(({ isCurrent }) => isCurrent);
}

function governanceRowCounts() {
  return {
    corrections: testDatabase.db.select().from(corrections).all().length,
    events: testDatabase.db.select().from(projectEvents).all().length,
    snapshots: testDatabase.db.select().from(projectSnapshots).all().length,
  };
}
