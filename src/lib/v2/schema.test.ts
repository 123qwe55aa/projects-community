import { afterEach, describe, expect, it } from 'vitest';
import {
  observations,
  projectEvents,
  projectSnapshots,
  projects,
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
});
