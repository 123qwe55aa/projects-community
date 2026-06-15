import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it } from 'vitest';
import {
  corrections,
  eventEvidence,
  githubStatisticsSnapshots,
  hypothesisEvidence,
  observations,
  projectEvents,
  projectHypotheses,
  projectImportKeys,
  projectStatistics,
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

  it('enforces stable project import key constraints', () => {
    const testDatabase = createTestDatabase();
    cleanup = testDatabase.cleanup;
    const { db } = testDatabase;
    const now = new Date();

    db.insert(projects).values({ id: 'imported-project', summary: 'Imported' }).run();
    db.insert(projects).values({ id: 'other-project', summary: 'Other' }).run();
    db.insert(projectImportKeys)
      .values({
        key: 'community-site',
        projectId: 'imported-project',
        contentHash: 'hash-1',
        sourceRef: 'templates/projects.yaml',
        createdAt: now,
      })
      .run();

    expect(() =>
      db
        .insert(projectImportKeys)
        .values({
          key: 'community-site',
          projectId: 'other-project',
          contentHash: 'hash-2',
          sourceRef: 'templates/other.yaml',
          createdAt: now,
        })
        .run(),
    ).toThrow();
    expect(() =>
      db
        .insert(projectImportKeys)
        .values({
          key: 'different-key',
          projectId: 'imported-project',
          contentHash: 'hash-1',
          sourceRef: 'templates/projects.yaml',
          createdAt: now,
        })
        .run(),
    ).toThrow();
    expect(() =>
      db.delete(projects).where(eq(projects.id, 'imported-project')).run(),
    ).toThrow();
  });

  it('stores one statistics configuration and latest snapshot per project', () => {
    const testDatabase = createTestDatabase();
    cleanup = testDatabase.cleanup;
    const { db } = testDatabase;
    const now = new Date();

    db.insert(projects).values({ id: 'statistics-project', summary: 'Statistics' }).run();
    db.insert(projectStatistics)
      .values({
        projectId: 'statistics-project',
        githubRepoFullName: 'owner/statistics',
        inferredType: 'typescript',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(githubStatisticsSnapshots)
      .values({
        projectId: 'statistics-project',
        repoFullName: 'owner/statistics',
        repoUrl: 'https://github.com/owner/statistics',
        topics: '["analytics"]',
        commitCount: 100,
        pullRequestCount: 20,
        issueCount: 10,
        starCount: 5,
        commits30d: 12,
        pullRequests30d: 3,
        issues30d: 2,
        activityScore30d: 23,
        updatedAt: now,
      })
      .run();

    expect(db.select().from(projectStatistics).all()).toHaveLength(1);
    expect(db.select().from(githubStatisticsSnapshots).all()).toHaveLength(1);
    expect(() =>
      db
        .insert(projectStatistics)
        .values({
          projectId: 'statistics-project',
          githubRepoFullName: 'owner/other',
          createdAt: now,
          updatedAt: now,
        })
        .run(),
    ).toThrow();
    expect(() =>
      db
        .insert(githubStatisticsSnapshots)
        .values({
          projectId: 'statistics-project',
          repoFullName: 'owner/other',
          repoUrl: 'https://github.com/owner/other',
          topics: '[]',
          commitCount: 0,
          pullRequestCount: 0,
          issueCount: 0,
          starCount: 0,
          commits30d: 0,
          pullRequests30d: 0,
          issues30d: 0,
          activityScore30d: 0,
          updatedAt: now,
        })
        .run(),
    ).toThrow();
  });

  it('rejects duplicate GitHub repository bindings', () => {
    const testDatabase = createTestDatabase();
    cleanup = testDatabase.cleanup;
    const { db } = testDatabase;
    const now = new Date();

    db.insert(projects).values({ id: 'statistics-project-1' }).run();
    db.insert(projects).values({ id: 'statistics-project-2' }).run();
    db.insert(projectStatistics)
      .values({
        projectId: 'statistics-project-1',
        githubRepoFullName: 'owner/shared',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    expect(() =>
      db
        .insert(projectStatistics)
        .values({
          projectId: 'statistics-project-2',
          githubRepoFullName: 'owner/shared',
          createdAt: now,
          updatedAt: now,
        })
        .run(),
    ).toThrow();
  });

  it('cascades statistics rows when deleting a project', () => {
    const testDatabase = createTestDatabase();
    cleanup = testDatabase.cleanup;
    const { db } = testDatabase;
    const now = new Date();

    db.insert(projects).values({ id: 'statistics-project' }).run();
    db.insert(projectStatistics)
      .values({ projectId: 'statistics-project', createdAt: now, updatedAt: now })
      .run();
    db.insert(githubStatisticsSnapshots)
      .values({
        projectId: 'statistics-project',
        repoFullName: 'owner/statistics',
        repoUrl: 'https://github.com/owner/statistics',
        topics: '[]',
        commitCount: 0,
        pullRequestCount: 0,
        issueCount: 0,
        starCount: 0,
        commits30d: 0,
        pullRequests30d: 0,
        issues30d: 0,
        activityScore30d: 0,
        updatedAt: now,
      })
      .run();

    expect(() =>
      db.delete(projects).where(eq(projects.id, 'statistics-project')).run(),
    ).not.toThrow();
    expect(db.select().from(projectStatistics).all()).toHaveLength(0);
    expect(db.select().from(githubStatisticsSnapshots).all()).toHaveLength(0);
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
    insertCorrection(db, 'correction-1', 'observation', 'obs-1');
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
      'corrections',
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

  it('allows corrections for existing V2 target types', () => {
    const { db } = createV2TestDatabase();

    expect(() => insertCorrection(db, 'correction-observation', 'observation', 'obs-1')).not.toThrow();
    expect(() =>
      insertCorrection(db, 'correction-project-event', 'project_event', 'event-1'),
    ).not.toThrow();
    expect(() => insertCorrection(db, 'correction-project', 'project', 'project-1')).not.toThrow();
    expect(() =>
      insertCorrection(db, 'correction-hypothesis', 'project_hypothesis', 'hypothesis-1'),
    ).not.toThrow();
  });

  it('rejects corrections for unknown types and missing targets', () => {
    const { db } = createV2TestDatabase();

    expect(() => insertCorrection(db, 'unknown', 'signal', 'signal-1')).toThrow(
      'corrections target_type is invalid',
    );
    for (const targetType of [
      'observation',
      'project_event',
      'project',
      'project_hypothesis',
    ]) {
      expect(() => insertCorrection(db, `missing-${targetType}`, targetType, 'missing')).toThrow(
        'corrections target does not exist',
      );
    }
  });

  it('rejects deletion of mutable targets referenced by corrections', () => {
    const { db } = createV2TestDatabase();
    const now = new Date();
    db.insert(projects).values({ id: 'corrected-project', summary: 'Corrected' }).run();
    db.insert(projects).values({ id: 'unreferenced-project', summary: 'Unreferenced' }).run();
    db.insert(projectHypotheses)
      .values({
        id: 'corrected-hypothesis',
        stableKey: 'corrected-hypothesis',
        title: 'Corrected',
        explanation: 'Corrected',
        state: 'active',
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .run();
    db.insert(projectHypotheses)
      .values({
        id: 'unreferenced-hypothesis',
        stableKey: 'unreferenced-hypothesis',
        title: 'Unreferenced',
        explanation: 'Unreferenced',
        state: 'active',
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .run();
    insertCorrection(db, 'project-correction', 'project', 'corrected-project');
    insertCorrection(
      db,
      'hypothesis-correction',
      'project_hypothesis',
      'corrected-hypothesis',
    );

    expect(() =>
      db.delete(projects).where(eq(projects.id, 'corrected-project')).run(),
    ).toThrow('project is referenced by an immutable correction');
    expect(() =>
      db.delete(projectHypotheses).where(eq(projectHypotheses.id, 'corrected-hypothesis')).run(),
    ).toThrow('project_hypothesis is referenced by an immutable correction');
    expect(() =>
      db.delete(projects).where(eq(projects.id, 'unreferenced-project')).run(),
    ).not.toThrow();
    expect(() =>
      db
        .delete(projectHypotheses)
        .where(eq(projectHypotheses.id, 'unreferenced-hypothesis'))
        .run(),
    ).not.toThrow();
  });

  it('rejects ID updates of mutable targets referenced by corrections', () => {
    const { db } = createV2TestDatabase();
    const now = new Date();
    db.insert(projects).values({ id: 'corrected-project', summary: 'Corrected' }).run();
    db.insert(projects).values({ id: 'unreferenced-project', summary: 'Unreferenced' }).run();
    db.insert(projectHypotheses)
      .values({
        id: 'corrected-hypothesis',
        stableKey: 'corrected-hypothesis',
        title: 'Corrected',
        explanation: 'Corrected',
        state: 'active',
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .run();
    db.insert(projectHypotheses)
      .values({
        id: 'unreferenced-hypothesis',
        stableKey: 'unreferenced-hypothesis',
        title: 'Unreferenced',
        explanation: 'Unreferenced',
        state: 'active',
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .run();
    insertCorrection(db, 'project-correction', 'project', 'corrected-project');
    insertCorrection(
      db,
      'hypothesis-correction',
      'project_hypothesis',
      'corrected-hypothesis',
    );

    expect(() =>
      db
        .update(projects)
        .set({ id: 'renamed-corrected-project' })
        .where(eq(projects.id, 'corrected-project'))
        .run(),
    ).toThrow('project ID is referenced by an immutable correction');
    expect(() =>
      db
        .update(projectHypotheses)
        .set({ id: 'renamed-corrected-hypothesis' })
        .where(eq(projectHypotheses.id, 'corrected-hypothesis'))
        .run(),
    ).toThrow('project_hypothesis ID is referenced by an immutable correction');
    expect(() =>
      db
        .update(projects)
        .set({ id: 'renamed-unreferenced-project' })
        .where(eq(projects.id, 'unreferenced-project'))
        .run(),
    ).not.toThrow();
    expect(() =>
      db
        .update(projectHypotheses)
        .set({ id: 'renamed-unreferenced-hypothesis' })
        .where(eq(projectHypotheses.id, 'unreferenced-hypothesis'))
        .run(),
    ).not.toThrow();
  });

  it.each([
    { targetType: 'unknown', targetId: 'missing' },
    { targetType: 'project', targetId: 'missing' },
  ])('refuses to migrate a database containing invalid legacy corrections', ({ targetType, targetId }) => {
    const directory = mkdtempSync(join(tmpdir(), 'projects-community-migration-'));
    const oldMigrations = join(directory, 'old-migrations');
    const databasePath = join(directory, 'test.db');
    const sqlite = new Database(databasePath);

    try {
      copyMigrationsThrough(oldMigrations, 3);
      migrate(drizzle(sqlite), { migrationsFolder: oldMigrations });
      sqlite.exec('DROP TRIGGER corrections_validate_target');
      sqlite
        .prepare(
          `INSERT INTO corrections
            (id, target_type, target_id, correction_type, payload, actor, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('legacy-invalid', targetType, targetId, 'clarification', '{}', 'legacy', Date.now());

      let migrationError: unknown;
      try {
        migrate(drizzle(sqlite), { migrationsFolder: join(process.cwd(), 'drizzle') });
      } catch (error) {
        migrationError = error;
      }

      expect(migrationError).toBeInstanceOf(Error);
      expect((migrationError as Error & { cause?: Error }).cause?.message).toContain(
        'invalid pre-existing corrections',
      );
    } finally {
      sqlite.close();
      rmSync(directory, { recursive: true, force: true });
    }
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

function insertCorrection(
  db: ReturnType<typeof createTestDatabase>['db'],
  id: string,
  targetType: string,
  targetId: string,
) {
  return db
    .insert(corrections)
    .values({
      id,
      targetType,
      targetId,
      correctionType: 'clarification',
      payload: '{}',
      actor: 'hermes',
      createdAt: new Date(),
    })
    .run();
}

function copyMigrationsThrough(destination: string, lastIndex: number) {
  const source = join(process.cwd(), 'drizzle');
  cpSync(join(source, 'meta'), join(destination, 'meta'), { recursive: true });
  const journalPath = join(destination, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ idx: number; tag: string }>;
  };
  journal.entries = journal.entries.filter((entry) => entry.idx <= lastIndex);
  writeFileSync(journalPath, JSON.stringify(journal));

  for (const entry of journal.entries) {
    cpSync(join(source, `${entry.tag}.sql`), join(destination, `${entry.tag}.sql`));
  }
}
