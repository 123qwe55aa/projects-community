import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  corrections,
  eventEvidence,
  hypothesisEvidence,
  observations,
  projectEvents,
  projectHypotheses,
  projectSnapshots,
  projects,
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

function date(value: string) {
  return new Date(value);
}
