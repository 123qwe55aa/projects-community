import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import {
  corrections,
  eventEvidence,
  observations,
  projectEvents,
  projectSnapshots,
  projectionCheckpoints,
  projects,
} from '@/db/schema';
import { createTestDatabase } from '@/test/db';
import { getCurrentProjectSnapshot, projectProject } from './project';
import { PROJECT_PROJECTION_CHECKPOINT, rebuildAllProjectProjections } from './rebuild';

let testDatabase: ReturnType<typeof createTestDatabase>;
let sequence = 0;

beforeEach(() => {
  testDatabase = createTestDatabase();
  sequence = 0;
  testDatabase.db
    .insert(projects)
    .values({
      id: 'project-1',
      summary: 'Original summary',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
    })
    .run();
});

afterEach(() => {
  testDatabase.cleanup();
});

describe('project projection', () => {
  it('derives current summary and lifecycle from ordered events', async () => {
    seedEvents([
      event('progress_recorded', { summary: 'Hermes MCP server started' }),
      event('obstacle_identified', { obstacle: 'Dashboard does not show evidence yet' }),
      event('lifecycle_inferred', { state: 'active', rationale: 'Recent explicit progress' }),
    ]);

    const snapshot = await projectProject('project-1');

    expect(snapshot).toMatchObject({
      summary: 'Hermes MCP server started',
      lifecycleState: 'active',
      lifecycleRationale: 'Recent explicit progress',
      sourceEventId: 'event-3',
      isCurrent: true,
    });
    expect(JSON.parse(snapshot.obstacles)).toEqual(['Dashboard does not show evidence yet']);
    expect(testDatabase.db.select().from(projects).get()?.summary).toBe(
      'Hermes MCP server started',
    );
  });

  it('gives a later user lifecycle correction precedence over earlier inference', async () => {
    seedEvents([
      event('lifecycle_inferred', { state: 'dormant', rationale: 'No recent progress' }),
    ]);
    seedCorrection('lifecycle_state', {
      state: 'active',
      rationale: 'Still actively designing',
    });

    expect(await projectProject('project-1')).toMatchObject({
      lifecycleState: 'active',
      lifecycleRationale: 'Still actively designing',
    });
  });

  it('ignores non-user and stale lifecycle corrections', async () => {
    seedCorrection(
      'lifecycle_state',
      { state: 'archived', rationale: 'Automated correction' },
      'hermes',
      '2026-06-13T09:00:00.000Z',
    );
    seedCorrection(
      'lifecycle_state',
      { state: 'ended', rationale: 'Old user correction' },
      'user',
      '2026-06-13T09:30:00.000Z',
    );
    seedEvents([
      event(
        'lifecycle_inferred',
        { state: 'active', rationale: 'Newer explicit progress' },
        '2026-06-13T10:00:00.000Z',
      ),
    ]);

    expect(await projectProject('project-1')).toMatchObject({
      lifecycleState: 'active',
      lifecycleRationale: 'Newer explicit progress',
    });
  });

  it('reduces themes, obstacles, questions, and five newest changes deterministically', async () => {
    seedQuestion('question-1', 'Which dashboard evidence belongs here?');
    seedQuestion('question-2', 'Which dashboard evidence belongs here?');
    const seededEvents = [
      event('interest_increased', { theme: 'Hermes' }),
      event('interest_increased', { theme: 'Hermes' }),
      event('interest_increased', { theme: 'Dashboard' }),
      event('interest_decreased', { theme: 'Hermes' }),
      event('obstacle_identified', { obstacle: 'No evidence view' }),
      event('obstacle_identified', { obstacle: 'No evidence view' }),
      event('obstacle_resolved', { obstacle: 'No evidence view' }),
      event('observation_attached', { observationId: 'question-1' }),
      event('observation_attached', { observationId: 'question-2' }),
    ];
    seedEvents(seededEvents);
    linkEvidence('event-8', 'question-1');
    linkEvidence('event-9', 'question-2');

    const snapshot = await projectProject('project-1');
    const recentChanges = JSON.parse(snapshot.recentChanges) as Array<{ id: string }>;

    expect(JSON.parse(snapshot.activeThemes)).toEqual(['Dashboard']);
    expect(JSON.parse(snapshot.obstacles)).toEqual([]);
    expect(JSON.parse(snapshot.unresolvedQuestions)).toEqual([
      'Which dashboard evidence belongs here?',
    ]);
    expect(recentChanges.map(({ id }) => id)).toEqual([
      'event-9',
      'event-8',
      'event-7',
      'event-6',
      'event-5',
    ]);
  });

  it('replaces the current snapshot while retaining snapshot history', async () => {
    seedEvents([event('progress_recorded', { summary: 'First summary' })]);
    const first = await projectProject('project-1');
    seedEvents([event('progress_recorded', { summary: 'Second summary' })]);

    const second = await projectProject('project-1');
    const snapshots = testDatabase.db
      .select()
      .from(projectSnapshots)
      .orderBy(asc(projectSnapshots.createdAt), asc(projectSnapshots.id))
      .all();

    expect(second.id).not.toBe(first.id);
    expect(snapshots).toHaveLength(2);
    expect(snapshots.filter(({ isCurrent }) => isCurrent)).toHaveLength(1);
    expect(await getCurrentProjectSnapshot('missing')).toBeNull();
  });
});

describe('project projection rebuild', () => {
  it('rebuilds to the same current state and completes its checkpoint', async () => {
    seedEvents([
      event('progress_recorded', { summary: 'Hermes projection is underway' }),
      event('lifecycle_inferred', { state: 'active', rationale: 'Recent progress' }),
    ]);
    const before = await projectProject('project-1');

    await rebuildAllProjectProjections();

    const after = await getCurrentProjectSnapshot('project-1');
    expect(after).toMatchObject({
      summary: before.summary,
      lifecycleState: before.lifecycleState,
      activeThemes: before.activeThemes,
      obstacles: before.obstacles,
      unresolvedQuestions: before.unresolvedQuestions,
      recentChanges: before.recentChanges,
    });
    expect(checkpoint()).toMatchObject({
      name: PROJECT_PROJECTION_CHECKPOINT,
      status: 'completed',
      error: null,
      lastEventId: 'event-2',
    });
  });

  it('projects every project in deterministic created order', async () => {
    testDatabase.db
      .insert(projects)
      .values({
        id: 'project-0',
        summary: 'Zero',
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      })
      .run();
    seedEvents([event('progress_recorded', { summary: 'One rebuilt' })]);

    await rebuildAllProjectProjections();

    expect(await getCurrentProjectSnapshot('project-0')).toMatchObject({ summary: 'Zero' });
    expect(await getCurrentProjectSnapshot('project-1')).toMatchObject({ summary: 'One rebuilt' });
  });

  it('persists a failed checkpoint and rethrows when a project cannot be projected', async () => {
    seedEvents([event('progress_recorded', { summary: 'Valid' })]);
    await rebuildAllProjectProjections();
    testDatabase.db
      .insert(projectEvents)
      .values({
        id: 'broken-event',
        projectId: 'project-1',
        eventType: 'progress_recorded',
        payload: '{not-json',
        actor: 'hermes',
        occurredAt: new Date('2026-06-13T11:00:00.000Z'),
        createdAt: new Date('2026-06-13T11:00:00.000Z'),
        schemaVersion: 1,
      })
      .run();

    await expect(rebuildAllProjectProjections()).rejects.toThrow();

    expect(checkpoint()).toMatchObject({
      name: PROJECT_PROJECTION_CHECKPOINT,
      status: 'failed',
      lastEventId: 'event-1',
    });
    expect(checkpoint()?.error).toContain('JSON');
  });
});

function event(eventType: string, payload: unknown, occurredAt?: string) {
  sequence += 1;
  const timestamp = occurredAt ?? `2026-06-13T10:${String(sequence).padStart(2, '0')}:00.000Z`;
  return {
    id: `event-${sequence}`,
    eventType,
    payload,
    occurredAt: timestamp,
    createdAt: timestamp,
  };
}

function seedEvents(events: ReturnType<typeof event>[]) {
  testDatabase.db
    .insert(projectEvents)
    .values(
      events.map((item) => ({
        ...item,
        projectId: 'project-1',
        payload: JSON.stringify(item.payload),
        actor: 'hermes',
        occurredAt: new Date(item.occurredAt),
        createdAt: new Date(item.createdAt),
        schemaVersion: 1,
      })),
    )
    .run();
}

function seedQuestion(id: string, summary: string) {
  testDatabase.db
    .insert(observations)
    .values({
      id,
      idempotencyKey: id,
      summary,
      type: 'question',
      sourceQuote: summary,
      sourceConversationRef: 'conversation-1',
      sourceMessageRef: id,
      observedAt: new Date('2026-06-13T10:00:00.000Z'),
      recordedAt: new Date('2026-06-13T10:00:00.000Z'),
      actor: 'hermes',
      schemaVersion: 1,
    })
    .run();
}

function linkEvidence(eventId: string, observationId: string) {
  testDatabase.db
    .insert(eventEvidence)
    .values({ id: `${eventId}:${observationId}`, eventId, observationId })
    .run();
}

function seedCorrection(
  correctionType: string,
  payload: unknown,
  actor = 'user',
  createdAt = '2026-06-13T10:30:00.000Z',
) {
  sequence += 1;
  testDatabase.db
    .insert(corrections)
    .values({
      id: `correction-${sequence}`,
      targetType: 'project',
      targetId: 'project-1',
      correctionType,
      payload: JSON.stringify(payload),
      actor,
      createdAt: new Date(createdAt),
    })
    .run();
}

function checkpoint() {
  return testDatabase.db
    .select()
    .from(projectionCheckpoints)
    .where(eq(projectionCheckpoints.name, PROJECT_PROJECTION_CHECKPOINT))
    .get();
}
