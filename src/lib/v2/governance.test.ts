import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { getDecision } from '@/db/helpers';
import {
  corrections,
  decisionLinks,
  decisions,
  eventEvidence,
  observations,
  projectEvents,
  projectSnapshots,
  projects,
} from '@/db/schema';
import { createTestDatabase } from '@/test/db';
import { getNeedsAttention } from './queries';
import { getCurrentProjectSnapshot } from './projection/project';
import {
  archiveProject,
  confirmDecisionSuggestion,
  confirmObservation,
  correctLifecycle,
  dismissDecisionSuggestion,
  ignoreObservation,
  mergeProjects,
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

    expect(testDatabase.db.select().from(decisions).all()).toHaveLength(0);
    expect(testDatabase.db.select().from(projectEvents).all()).toHaveLength(1);
    expect(testDatabase.db.select().from(corrections).get()).toMatchObject({
      targetType: 'project_event',
      targetId: 'suggestion-event-1',
      correctionType: 'decision_suggestion_dismissed',
      payload: JSON.stringify({ rationale: 'Not a real decision' }),
    });
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
