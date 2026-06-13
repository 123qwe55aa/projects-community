import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  eventEvidence,
  hypothesisEvidence,
  observations,
  projectEvents,
  projectHypotheses,
  projectSnapshots,
  projectionCheckpoints,
  projects,
  signalEvidence,
  signals,
} from '@/db/schema';
import { createTestDatabase } from '@/test/db';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('V2 schema', () => {
  it('stores observations, events, and snapshots', async () => {
    const testDatabase = createTestDatabase();
    cleanup = testDatabase.cleanup;
    const { db } = testDatabase;

    await db.insert(projects).values({ id: 'project-1', summary: 'One' });
    await db.insert(observations).values({
      id: 'obs-1',
      idempotencyKey: 'hermes:message-1:observation-1',
      summary: 'Started exploring a Hermes-first dashboard',
      type: 'project_signal',
      sourceConversationRef: 'hermes:conversation-1',
      sourceMessageRef: 'hermes:message-1',
      sourceQuote: 'I want Hermes as the entry point',
      observedAt: new Date(),
      recordedAt: new Date(),
      actor: 'hermes',
      schemaVersion: 1,
    });
    await db.insert(projectEvents).values({
      id: 'event-1',
      projectId: 'project-1',
      eventType: 'progress_recorded',
      payload: JSON.stringify({ summary: 'Hermes-first direction selected' }),
      actor: 'hermes',
      occurredAt: new Date(),
      createdAt: new Date(),
      schemaVersion: 1,
    });
    await db.insert(projectSnapshots).values({
      id: 'snapshot-1',
      projectId: 'project-1',
      summary: 'Hermes-first direction selected',
      lifecycleState: 'active',
      activeThemes: '[]',
      obstacles: '[]',
      unresolvedQuestions: '[]',
      recentChanges: '[]',
      sourceEventId: 'event-1',
      projectionVersion: 1,
      isCurrent: true,
      createdAt: new Date(),
    });

    expect(await db.select().from(observations)).toHaveLength(1);
    expect(await db.select().from(projectEvents)).toHaveLength(1);
    expect(await db.select().from(projectSnapshots)).toHaveLength(1);
  });

  it('rejects duplicate evidence relationships', () => {
    const { db } = createV2TestDatabase();

    db.insert(eventEvidence)
      .values({ id: 'event-evidence-1', eventId: 'event-1', observationId: 'obs-1' })
      .run();
    expect(() =>
      db
        .insert(eventEvidence)
        .values({ id: 'event-evidence-2', eventId: 'event-1', observationId: 'obs-1' })
        .run(),
    ).toThrow();

    db.insert(signalEvidence)
      .values({ id: 'signal-evidence-1', signalId: 'signal-1', observationId: 'obs-1' })
      .run();
    expect(() =>
      db
        .insert(signalEvidence)
        .values({ id: 'signal-evidence-2', signalId: 'signal-1', observationId: 'obs-1' })
        .run(),
    ).toThrow();

    db.insert(hypothesisEvidence)
      .values({
        id: 'hypothesis-evidence-1',
        hypothesisId: 'hypothesis-1',
        observationId: 'obs-1',
      })
      .run();
    expect(() =>
      db
        .insert(hypothesisEvidence)
        .values({
          id: 'hypothesis-evidence-2',
          hypothesisId: 'hypothesis-1',
          observationId: 'obs-1',
        })
        .run(),
    ).toThrow();

    db.insert(hypothesisEvidence)
      .values({
        id: 'hypothesis-evidence-3',
        hypothesisId: 'hypothesis-1',
        signalId: 'signal-1',
      })
      .run();
    expect(() =>
      db
        .insert(hypothesisEvidence)
        .values({
          id: 'hypothesis-evidence-4',
          hypothesisId: 'hypothesis-1',
          signalId: 'signal-1',
        })
        .run(),
    ).toThrow();
  });

  it('requires hypothesis evidence to reference exactly one source', () => {
    const { db } = createV2TestDatabase();

    expect(() =>
      db
        .insert(hypothesisEvidence)
        .values({ id: 'neither', hypothesisId: 'hypothesis-1' })
        .run(),
    ).toThrow();
    expect(() =>
      db
        .insert(hypothesisEvidence)
        .values({
          id: 'both',
          hypothesisId: 'hypothesis-1',
          observationId: 'obs-1',
          signalId: 'signal-1',
        })
        .run(),
    ).toThrow();
  });

  it('allows at most one current snapshot per project', () => {
    const { db } = createV2TestDatabase();

    insertSnapshot(db, 'snapshot-current-1', true);
    expect(() => insertSnapshot(db, 'snapshot-current-2', true)).toThrow();
    expect(() => insertSnapshot(db, 'snapshot-history', false)).not.toThrow();
  });

  it('enforces projection checkpoint last-event foreign keys', () => {
    const { db } = createV2TestDatabase();

    expect(() =>
      db
        .insert(projectionCheckpoints)
        .values({
          name: 'invalid',
          lastEventId: 'missing-event',
          projectionVersion: 1,
          status: 'ready',
          updatedAt: new Date(),
        })
        .run(),
    ).toThrow();
    expect(() =>
      db
        .insert(projectionCheckpoints)
        .values({
          name: 'valid',
          lastEventId: 'event-1',
          projectionVersion: 1,
          status: 'ready',
          updatedAt: new Date(),
        })
        .run(),
    ).not.toThrow();
  });

  it('rejects updates and deletes from immutable event-store tables', () => {
    const { db, sqlite } = createV2TestDatabase();
    db.insert(eventEvidence)
      .values({ id: 'event-evidence-1', eventId: 'event-1', observationId: 'obs-1' })
      .run();
    db.insert(signalEvidence)
      .values({ id: 'signal-evidence-1', signalId: 'signal-1', observationId: 'obs-1' })
      .run();
    db.insert(hypothesisEvidence)
      .values({
        id: 'hypothesis-evidence-1',
        hypothesisId: 'hypothesis-1',
        observationId: 'obs-1',
      })
      .run();

    for (const table of [
      'observations',
      'project_events',
      'event_evidence',
      'signal_evidence',
      'hypothesis_evidence',
    ]) {
      expect(() => sqlite.prepare(`UPDATE ${table} SET id = id`).run()).toThrow(
        `${table} is immutable`,
      );
      expect(() => sqlite.prepare(`DELETE FROM ${table}`).run()).toThrow(
        `${table} is immutable`,
      );
    }

    expect(db.select().from(observations).where(eq(observations.id, 'obs-1')).get()).toBeDefined();
  });
});

function createV2TestDatabase() {
  const testDatabase = createTestDatabase();
  cleanup = testDatabase.cleanup;
  const { db } = testDatabase;
  const now = new Date();

  db.insert(projects).values({ id: 'project-1', summary: 'One' }).run();
  db.insert(observations)
    .values({
      id: 'obs-1',
      idempotencyKey: 'hermes:message-1:observation-1',
      summary: 'Started exploring a Hermes-first dashboard',
      type: 'project_signal',
      sourceConversationRef: 'hermes:conversation-1',
      sourceMessageRef: 'hermes:message-1',
      sourceQuote: 'I want Hermes as the entry point',
      observedAt: now,
      recordedAt: now,
      actor: 'hermes',
      schemaVersion: 1,
    })
    .run();
  db.insert(projectEvents)
    .values({
      id: 'event-1',
      projectId: 'project-1',
      eventType: 'progress_recorded',
      payload: '{}',
      actor: 'hermes',
      occurredAt: now,
      createdAt: now,
      schemaVersion: 1,
    })
    .run();
  db.insert(signals)
    .values({
      id: 'signal-1',
      stableKey: 'signal-1',
      title: 'Signal',
      description: 'Description',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(projectHypotheses)
    .values({
      id: 'hypothesis-1',
      stableKey: 'hypothesis-1',
      title: 'Hypothesis',
      explanation: 'Explanation',
      state: 'active',
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .run();

  return testDatabase;
}

function insertSnapshot(
  db: ReturnType<typeof createTestDatabase>['db'],
  id: string,
  isCurrent: boolean,
) {
  return db
    .insert(projectSnapshots)
    .values({
      id,
      projectId: 'project-1',
      summary: id,
      lifecycleState: 'active',
      activeThemes: '[]',
      obstacles: '[]',
      unresolvedQuestions: '[]',
      recentChanges: '[]',
      sourceEventId: 'event-1',
      projectionVersion: 1,
      isCurrent,
      createdAt: new Date(),
    })
    .run();
}
