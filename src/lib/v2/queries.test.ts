import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  corrections,
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
import {
  getDashboardData,
  getNeedsAttention,
  getProjectHypotheses,
  getProjectTimeline,
  getRecentChanges,
} from './queries';

let testDatabase: ReturnType<typeof createTestDatabase>;

beforeEach(() => {
  testDatabase = createTestDatabase();
  seedProjectsAndSnapshots();
  seedObservations();
  seedEventsAndEvidence();
  seedCorrections();
  seedHypotheses();
});

afterEach(() => {
  testDatabase.cleanup();
});

describe('V2 dashboard queries', () => {
  it('uses only each project current snapshot and assembles dashboard sections', async () => {
    const data = await getDashboardData();

    expect(data.currentProjects).toHaveLength(2);
    expect(data.currentProjects[0]).toMatchObject({
      projectId: 'project-1',
      summary: 'Current Hermes summary',
      lifecycleState: 'active',
      evidenceCount: 2,
      activeThemes: ['Hermes'],
      obstacles: ['No evidence view'],
    });
    expect(data.currentProjects.map(({ projectId }) => projectId)).toEqual([
      'project-1',
      'project-2',
    ]);
    expect(data.needsAttention).toHaveLength(1);
    expect(data.recentChanges[0].eventType).toBe('progress_recorded');
    expect(data.hypotheses[0]).toMatchObject({
      id: 'hypothesis-1',
      supportingEvidenceCount: 4,
    });
  });

  it('returns observations with neither accepted attachment nor confirm or ignore correction', async () => {
    const items = await getNeedsAttention();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      observationId: 'obs-pending',
      proposedProjectId: 'project-1',
      proposedProjectSummary: 'Project one',
      assignmentConfidence: 60,
      sourceConversationRef: 'conversation-pending',
      sourceMessageRef: 'message-pending',
    });
  });

  it('orders recent project events descending and respects the limit', async () => {
    const changes = await getRecentChanges(2);

    expect(changes.map(({ eventId }) => eventId)).toEqual(['event-progress', 'event-attached']);
    expect(changes[0]).toMatchObject({
      projectId: 'project-1',
      projectSummary: 'Project one',
      sourceQuote: 'Hermes should be the entry point',
    });
  });

  it('includes hypothesis evidence counts and the three latest observation quotes', async () => {
    const hypotheses = await getProjectHypotheses();

    expect(hypotheses).toHaveLength(1);
    expect(hypotheses[0].supportingEvidenceCount).toBe(4);
    expect(hypotheses[0].latestQuotes.map(({ sourceQuote }) => sourceQuote)).toEqual([
      'Latest hypothesis quote',
      'Hermes should be the entry point',
      'Already attached',
    ]);
  });

  it('resolves and deduplicates latest quotes from signal-only hypothesis evidence', async () => {
    testDatabase.db
      .insert(projectHypotheses)
      .values({
        id: 'hypothesis-signal',
        stableKey: 'hypothesis:signal',
        title: 'Signal-backed hypothesis',
        explanation: 'Only signal evidence points here.',
        state: 'emerging',
        firstSeenAt: date('2026-06-01'),
        lastSeenAt: date('2026-06-14'),
      })
      .run();
    testDatabase.db
      .insert(signals)
      .values([
        {
          id: 'signal-1',
          stableKey: 'signal:one',
          title: 'Repeated Hermes interest',
          description: 'Repeated observations',
          createdAt: date('2026-06-13'),
          updatedAt: date('2026-06-14'),
        },
        {
          id: 'signal-2',
          stableKey: 'signal:two',
          title: 'More Hermes interest',
          description: 'Overlapping observations',
          createdAt: date('2026-06-13'),
          updatedAt: date('2026-06-14'),
        },
      ])
      .run();
    testDatabase.db
      .insert(signalEvidence)
      .values([
        { id: 'signal-evidence-1', signalId: 'signal-1', observationId: 'obs-latest' },
        { id: 'signal-evidence-2', signalId: 'signal-1', observationId: 'obs-hermes' },
        { id: 'signal-evidence-3', signalId: 'signal-2', observationId: 'obs-latest' },
      ])
      .run();
    testDatabase.db
      .insert(hypothesisEvidence)
      .values([
        {
          id: 'hypothesis-signal-evidence-1',
          hypothesisId: 'hypothesis-signal',
          signalId: 'signal-1',
        },
        {
          id: 'hypothesis-signal-evidence-2',
          hypothesisId: 'hypothesis-signal',
          signalId: 'signal-2',
        },
      ])
      .run();

    const hypothesis = (await getProjectHypotheses()).find(({ id }) => id === 'hypothesis-signal');

    expect(hypothesis).toMatchObject({ supportingEvidenceCount: 2 });
    expect(hypothesis?.latestQuotes.map(({ observationId }) => observationId)).toEqual([
      'obs-latest',
      'obs-hermes',
    ]);
  });

  it('uses empty fallbacks for malformed persisted snapshot arrays', async () => {
    testDatabase.db
      .update(projectSnapshots)
      .set({
        activeThemes: '{bad',
        obstacles: 'null',
        unresolvedQuestions: '{"not":"an array"}',
        recentChanges: '[bad',
      })
      .where(eq(projectSnapshots.id, 'snapshot-current'))
      .run();

    const project = (await getDashboardData()).currentProjects.find(
      ({ projectId }) => projectId === 'project-1',
    );

    expect(project).toMatchObject({
      activeThemes: [],
      obstacles: [],
      unresolvedQuestions: [],
      recentChanges: [],
    });
  });

  it('uses an empty payload fallback for malformed persisted event JSON', async () => {
    testDatabase.db
      .insert(projectEvents)
      .values({
        ...event('event-malformed', 'project-1', 'progress_recorded', '2026-06-14T12:00:00.000Z'),
        payload: '{bad',
      })
      .run();

    expect((await getRecentChanges())[0].payload).toEqual({});
    expect((await getProjectTimeline('project-1'))[0].payload).toEqual({});
  });

  it('joins timeline event evidence to observation source references', async () => {
    const timeline = await getProjectTimeline('project-1');

    expect(timeline.map(({ eventId }) => eventId)).toEqual(['event-progress', 'event-attached']);
    expect(timeline[0].evidence[0]).toMatchObject({
      observationId: 'obs-hermes',
      sourceQuote: 'Hermes should be the entry point',
      sourceConversationRef: 'conversation-hermes',
      sourceMessageRef: 'message-hermes',
    });
    expect(await getProjectTimeline('missing')).toEqual([]);
  });

  it('shows transitive merged source history and evidence on the target without moving rows', async () => {
    testDatabase.db
      .insert(projects)
      .values({ id: 'project-3', summary: 'Project three', createdAt: date('2026-06-03') })
      .run();
    testDatabase.db
      .insert(projectSnapshots)
      .values(
        snapshot('snapshot-project-3', 'project-3', 'Current third summary', true, '2026-06-14'),
      )
      .run();
    testDatabase.db
      .insert(projectEvents)
      .values([
        event('event-merge-1', 'project-2', 'project_merged', '2026-06-13T13:00:00.000Z'),
        event('event-merge-2', 'project-3', 'project_merged', '2026-06-13T14:00:00.000Z'),
      ])
      .run();
    testDatabase.db
      .insert(corrections)
      .values([
        projectMergeCorrection('merge-1', 'project-1', 'project-2'),
        projectMergeCorrection('merge-2', 'project-2', 'project-3'),
      ])
      .run();

    const timeline = await getProjectTimeline('project-3');
    const project = (await getDashboardData()).currentProjects.find(
      ({ projectId }) => projectId === 'project-3',
    );

    expect(timeline.map(({ projectId }) => projectId)).toEqual([
      'project-3',
      'project-2',
      'project-1',
      'project-1',
      'project-2',
    ]);
    expect(
      timeline.flatMap(({ evidence }) => evidence).map(({ observationId }) => observationId),
    ).toEqual(['obs-hermes', 'obs-attached', 'obs-hermes']);
    expect(project?.evidenceCount).toBe(2);
    expect(
      testDatabase.db
        .select()
        .from(projectEvents)
        .where(eq(projectEvents.projectId, 'project-1'))
        .all(),
    ).toHaveLength(2);
  });
});

function seedProjectsAndSnapshots() {
  testDatabase.db
    .insert(projects)
    .values([
      { id: 'project-1', summary: 'Project one', createdAt: date('2026-06-01') },
      { id: 'project-2', summary: 'Project two', createdAt: date('2026-06-02') },
      { id: 'project-without-snapshot', summary: 'Not projected', createdAt: date('2026-06-03') },
    ])
    .run();
  testDatabase.db
    .insert(projectSnapshots)
    .values([
      snapshot('snapshot-old', 'project-1', 'Old Hermes summary', false, '2026-06-10'),
      snapshot('snapshot-current', 'project-1', 'Current Hermes summary', true, '2026-06-13'),
      {
        ...snapshot('snapshot-project-2', 'project-2', 'Current second summary', true, '2026-06-12'),
        lifecycleState: 'dormant',
        lifecycleRationale: 'No recent progress',
      },
    ])
    .run();
}

function seedObservations() {
  testDatabase.db
    .insert(observations)
    .values([
      observation('obs-hermes', 'Hermes should be the entry point', '2026-06-13T10:00:00.000Z'),
      observation('obs-attached', 'Already attached', '2026-06-13T09:00:00.000Z'),
      observation('obs-pending', 'This observation still needs review', '2026-06-13T08:00:00.000Z', {
        proposedProjectId: 'project-1',
        assignmentConfidence: 60,
        assignmentRationale: 'Likely related',
      }),
      observation('obs-confirmed', 'Confirmed by correction', '2026-06-13T07:00:00.000Z'),
      observation('obs-ignored', 'Ignored by correction', '2026-06-13T06:00:00.000Z'),
      observation('obs-latest', 'Latest hypothesis quote', '2026-06-13T11:00:00.000Z'),
    ])
    .run();
}

function seedEventsAndEvidence() {
  testDatabase.db
    .insert(projectEvents)
    .values([
      event('event-attached', 'project-1', 'observation_attached', '2026-06-13T10:00:00.000Z'),
      event('event-progress', 'project-1', 'progress_recorded', '2026-06-13T12:00:00.000Z'),
      event('event-project-2', 'project-2', 'progress_recorded', '2026-06-13T08:00:00.000Z'),
    ])
    .run();
  testDatabase.db
    .insert(eventEvidence)
    .values([
      { id: 'evidence-attach', eventId: 'event-attached', observationId: 'obs-attached' },
      { id: 'evidence-progress', eventId: 'event-progress', observationId: 'obs-hermes' },
      { id: 'evidence-project-2', eventId: 'event-project-2', observationId: 'obs-hermes' },
    ])
    .run();
}

function seedCorrections() {
  testDatabase.db
    .insert(corrections)
    .values([
      correction('correction-confirmed', 'obs-confirmed', 'confirm'),
      correction('correction-ignored', 'obs-ignored', 'ignore'),
      correction('correction-hermes', 'obs-hermes', 'confirm'),
      correction('correction-latest', 'obs-latest', 'ignore'),
    ])
    .run();
}

function seedHypotheses() {
  testDatabase.db
    .insert(projectHypotheses)
    .values({
      id: 'hypothesis-1',
      stableKey: 'hypothesis:hermes',
      title: 'Hermes-first projects',
      explanation: 'Repeated evidence points to a project.',
      state: 'emerging',
      firstSeenAt: date('2026-06-01'),
      lastSeenAt: date('2026-06-13'),
    })
    .run();
  testDatabase.db
    .insert(hypothesisEvidence)
    .values([
      { id: 'hypothesis-evidence-1', hypothesisId: 'hypothesis-1', observationId: 'obs-attached' },
      { id: 'hypothesis-evidence-2', hypothesisId: 'hypothesis-1', observationId: 'obs-pending' },
      { id: 'hypothesis-evidence-3', hypothesisId: 'hypothesis-1', observationId: 'obs-hermes' },
      { id: 'hypothesis-evidence-4', hypothesisId: 'hypothesis-1', observationId: 'obs-latest' },
    ])
    .run();
}

function snapshot(id: string, projectId: string, summary: string, isCurrent: boolean, createdAt: string) {
  return {
    id,
    projectId,
    summary,
    lifecycleState: 'active',
    lifecycleRationale: 'Recent explicit progress',
    activeThemes: JSON.stringify(['Hermes']),
    obstacles: JSON.stringify(['No evidence view']),
    unresolvedQuestions: JSON.stringify(['Which evidence belongs here?']),
    recentChanges: JSON.stringify([{ id: 'event-progress', eventType: 'progress_recorded' }]),
    sourceEventId: null,
    projectionVersion: 1,
    isCurrent,
    createdAt: date(createdAt),
  };
}

function observation(
  id: string,
  sourceQuote: string,
  observedAt: string,
  extra: Partial<typeof observations.$inferInsert> = {},
) {
  return {
    id,
    idempotencyKey: `observation:${id}`,
    summary: `Summary for ${id}`,
    type: 'progress',
    sourceQuote,
    sourceConversationRef: `conversation-${id.replace('obs-', '')}`,
    sourceMessageRef: `message-${id.replace('obs-', '')}`,
    observedAt: date(observedAt),
    recordedAt: date(observedAt),
    actor: 'hermes',
    schemaVersion: 1,
    ...extra,
  };
}

function event(id: string, projectId: string, eventType: string, occurredAt: string) {
  return {
    id,
    projectId,
    eventType,
    payload: JSON.stringify({ summary: `Summary for ${id}` }),
    rationale: `Rationale for ${id}`,
    actor: 'hermes',
    occurredAt: date(occurredAt),
    createdAt: date(occurredAt),
    schemaVersion: 1,
  };
}

function correction(id: string, targetId: string, correctionType: string) {
  return {
    id,
    targetType: 'observation',
    targetId,
    correctionType,
    payload: '{}',
    actor: 'user',
    createdAt: date('2026-06-13T12:00:00.000Z'),
  };
}

function projectMergeCorrection(id: string, sourceProjectId: string, targetProjectId: string) {
  return {
    id,
    targetType: 'project',
    targetId: sourceProjectId,
    correctionType: 'project_merged',
    payload: JSON.stringify({ targetProjectId, rationale: 'Merged' }),
    actor: 'user',
    createdAt: date('2026-06-13T13:00:00.000Z'),
  };
}

function date(value: string) {
  return new Date(value);
}
