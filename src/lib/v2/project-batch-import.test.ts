import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import {
  projectEvents,
  projectImportKeys,
  projectSnapshots,
  projects,
} from '@/db/schema';
import { createTestDatabase } from '@/test/db';
import type { NormalizedProjectBatch, NormalizedProjectImport } from './project-batch-contract';
import { hashProjectImport } from './project-batch-contract';
import { importProjectBatch } from './project-batch-import';
import { correctLifecycle } from './governance';

let testDatabase: ReturnType<typeof createTestDatabase>;

beforeEach(() => {
  testDatabase = createTestDatabase();
});

afterEach(() => {
  testDatabase.cleanup();
});

describe('project batch import', () => {
  it('creates a project, stable-key mapping, initialization event, and current snapshot', async () => {
    const project = input({ key: 'community-map', buildingStyle: 'studio' });

    await expect(importProjectBatch(batch(project))).resolves.toEqual({
      projectsFound: 1,
      projectsCreated: 1,
      projectsSkipped: 0,
      dryRun: false,
    });

    const createdProject = testDatabase.db.select().from(projects).get();
    expect(createdProject).toMatchObject({
      summary: project.summary,
      background: project.background,
      buildingStyle: 'studio',
      growthStage: 'seed',
      visibility: 'private',
    });
    expect(testDatabase.db.select().from(projectImportKeys).get()).toMatchObject({
      key: project.key,
      projectId: createdProject!.id,
      contentHash: hashProjectImport(project),
      sourceRef: project.sourceRef,
    });
    expect(
      testDatabase.db
        .select()
        .from(projectEvents)
        .where(eq(projectEvents.projectId, createdProject!.id))
        .get(),
    ).toMatchObject({
      eventType: 'project_created',
      payload: JSON.stringify({ summary: project.summary }),
      actor: 'batch-import',
      rationale: expect.stringContaining(project.sourceRef),
      idempotencyKey: expect.stringMatching(/^batch-import:[a-f0-9]{64}:project-created$/),
      schemaVersion: 1,
    });
    expect(testDatabase.db.select().from(projectSnapshots).get()).toMatchObject({
      projectId: createdProject!.id,
      summary: project.summary,
      lifecycleState: 'active',
      isCurrent: true,
    });
    expect(
      testDatabase.db
        .select()
        .from(projectEvents)
        .where(eq(projectEvents.eventType, 'lifecycle_inferred'))
        .all(),
    ).toHaveLength(0);
  });

  it('creates and projects a lifecycle event only for a non-active initial state', async () => {
    const project = input({ key: 'paused-work', lifecycleState: 'dormant' });

    await importProjectBatch(batch(project));

    const events = testDatabase.db
      .select()
      .from(projectEvents)
      .orderBy(asc(projectEvents.occurredAt), asc(projectEvents.createdAt), asc(projectEvents.id))
      .all();
    expect(events.map(({ eventType }) => eventType)).toEqual([
      'project_created',
      'lifecycle_inferred',
    ]);
    expect(events[1]).toMatchObject({
      rationale: expect.stringContaining(project.sourceRef),
      actor: 'batch-import',
      idempotencyKey: expect.stringMatching(/^batch-import:[a-f0-9]{64}:lifecycle-inferred$/),
    });
    expect(JSON.parse(events[1].payload)).toEqual({
      state: 'dormant',
      rationale: expect.stringContaining(project.sourceRef),
    });
    expect(testDatabase.db.select().from(projectSnapshots).get()).toMatchObject({
      lifecycleState: 'dormant',
      lifecycleRationale: expect.stringContaining(project.sourceRef),
      sourceEventId: events[1].id,
    });
  });

  it('allows an immediate user lifecycle correction to override imported lifecycle', async () => {
    await importProjectBatch(batch(input({ key: 'paused-work', lifecycleState: 'dormant' })));
    const projectId = testDatabase.db.select().from(projectImportKeys).get()!.projectId;

    await correctLifecycle({
      projectId,
      state: 'active',
      rationale: 'Work resumed immediately after import.',
    });

    expect(
      testDatabase.db
        .select()
        .from(projectSnapshots)
        .where(eq(projectSnapshots.isCurrent, true))
        .get(),
    ).toMatchObject({
      lifecycleState: 'active',
      lifecycleRationale: 'Work resumed immediately after import.',
      isCurrent: true,
    });
  });

  it('skips a same-content replay without adding records', async () => {
    const project = input();
    const first = await importProjectBatch(batch(project));
    const before = counts();

    const second = await importProjectBatch(batch(project));

    expect(first.projectsCreated).toBe(1);
    expect(second).toEqual({
      projectsFound: 1,
      projectsCreated: 0,
      projectsSkipped: 1,
      dryRun: false,
    });
    expect(counts()).toEqual(before);
  });

  it('rejects changed content for an existing stable key', async () => {
    const project = input({ key: 'stable-key' });
    await importProjectBatch(batch(project));

    await expect(
      importProjectBatch(batch({ ...project, summary: 'Changed summary' })),
    ).rejects.toThrow('Project import conflict for key "stable-key"');
  });

  it('rolls back the whole batch when any project conflicts', async () => {
    const existing = input({ key: 'existing' });
    await importProjectBatch(batch(existing));
    const before = counts();

    await expect(
      importProjectBatch(
        batch(
          input({ key: 'new-project' }),
          { ...existing, background: 'Conflicting background' },
        ),
      ),
    ).rejects.toThrow('Project import conflict for key "existing"');

    expect(counts()).toEqual(before);
    expect(
      testDatabase.db
        .select()
        .from(projectImportKeys)
        .where(eq(projectImportKeys.key, 'new-project'))
        .get(),
    ).toBeUndefined();
  });

  it('compares and reports a dry run without writing anything', async () => {
    const existing = input({ key: 'existing' });
    await importProjectBatch(batch(existing));
    const before = counts();

    await expect(
      importProjectBatch(batch(existing, input({ key: 'would-create' })), { dryRun: true }),
    ).resolves.toEqual({
      projectsFound: 2,
      projectsCreated: 1,
      projectsSkipped: 1,
      dryRun: true,
    });
    expect(counts()).toEqual(before);
  });

  it('derives bounded stable event idempotency keys deterministically from the project key', async () => {
    const project = input({ key: 'x'.repeat(200), lifecycleState: 'ended' });
    const keyHash = createHash('sha256').update(project.key).digest('hex');

    await importProjectBatch(batch(project));

    const idempotencyKeys = testDatabase.db
      .select({ idempotencyKey: projectEvents.idempotencyKey })
      .from(projectEvents)
      .orderBy(asc(projectEvents.occurredAt))
      .all()
      .map(({ idempotencyKey }) => idempotencyKey);
    expect(idempotencyKeys).toEqual([
      `batch-import:${keyHash}:project-created`,
      `batch-import:${keyHash}:lifecycle-inferred`,
    ]);
    expect(idempotencyKeys.every((key) => key !== null && key.length <= 200)).toBe(true);
  });

  it('runs comparison and writes in an immediate transaction', async () => {
    const originalTransaction = testDatabase.db.transaction.bind(testDatabase.db);
    let transactionConfig: unknown;
    testDatabase.db.transaction = ((callback, config) => {
      transactionConfig = config;
      return originalTransaction(callback, config);
    }) as typeof testDatabase.db.transaction;

    await importProjectBatch(batch(input()));

    expect(transactionConfig).toEqual({ behavior: 'immediate' });
  });
});

function input(overrides: Partial<NormalizedProjectImport> = {}): NormalizedProjectImport {
  return {
    key: 'project-one',
    summary: 'Project one',
    background: 'Project one background',
    lifecycleState: 'active',
    buildingStyle: 'workshop',
    sourceRef: 'template:projects.yaml',
    ...overrides,
  };
}

function batch(...projectsToImport: NormalizedProjectImport[]): NormalizedProjectBatch {
  return { version: 1, projects: projectsToImport };
}

function counts() {
  return {
    projects: testDatabase.db.select().from(projects).all().length,
    mappings: testDatabase.db.select().from(projectImportKeys).all().length,
    events: testDatabase.db.select().from(projectEvents).all().length,
    snapshots: testDatabase.db.select().from(projectSnapshots).all().length,
  };
}
