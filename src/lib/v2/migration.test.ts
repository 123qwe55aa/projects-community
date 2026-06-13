import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { decisions, projectEvents, projectSnapshots, projects } from '@/db/schema';
import { createTestDatabase } from '@/test/db';
import { getCurrentProjectSnapshot, projectProject } from './projection/project';
import { importV1Projects } from './migration';

let testDatabase: ReturnType<typeof createTestDatabase>;

beforeEach(() => {
  testDatabase = createTestDatabase();
  testDatabase.db
    .insert(projects)
    .values([
      {
        id: 'project-1',
        summary: 'Project one summary',
        background: 'Project one background',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-02T00:00:00.000Z'),
      },
      {
        id: 'project-2',
        summary: 'Project two summary',
        background: 'Project two background',
        createdAt: new Date('2026-06-03T00:00:00.000Z'),
        updatedAt: new Date('2026-06-04T00:00:00.000Z'),
      },
    ])
    .run();
});

afterEach(() => {
  testDatabase.cleanup();
});

describe('V1 project migration', () => {
  it('creates one legacy_imported event and projection per V1 Project idempotently', async () => {
    const first = await importV1Projects();
    const second = await importV1Projects();
    const events = testDatabase.db
      .select()
      .from(projectEvents)
      .where(eq(projectEvents.eventType, 'legacy_imported'))
      .orderBy(asc(projectEvents.projectId))
      .all();

    expect(first).toEqual({ projectsFound: 2, eventsCreated: 2, projectsProjected: 2 });
    expect(second).toEqual({ projectsFound: 2, eventsCreated: 0, projectsProjected: 0 });
    expect(events).toHaveLength(2);
    expect(events.map(({ projectId, idempotencyKey, payload }) => ({
      projectId,
      idempotencyKey,
      payload: JSON.parse(payload),
    }))).toEqual([
      {
        projectId: 'project-1',
        idempotencyKey: 'v2:legacy-import:project-1',
        payload: { summary: 'Project one summary', background: 'Project one background' },
      },
      {
        projectId: 'project-2',
        idempotencyKey: 'v2:legacy-import:project-2',
        payload: { summary: 'Project two summary', background: 'Project two background' },
      },
    ]);
    expect(await getCurrentProjectSnapshot('project-1')).toMatchObject({
      summary: 'Project one summary',
      sourceEventId: events[0].id,
    });
    expect(await getCurrentProjectSnapshot('project-2')).toMatchObject({
      summary: 'Project two summary',
      sourceEventId: events[1].id,
    });
  });

  it('does not modify V1 Decision data', async () => {
    testDatabase.db
      .insert(decisions)
      .values({
        id: 'decision-1',
        question: 'Keep the V1 decision?',
        state: 'researching',
        scope: 'project',
        projectId: 'project-1',
        dimensions: JSON.stringify(['safety']),
        weights: JSON.stringify({ safety: 1 }),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
        updatedAt: new Date('2026-06-06T00:00:00.000Z'),
      })
      .run();
    const before = testDatabase.db.select().from(decisions).all();

    await importV1Projects();

    expect(testDatabase.db.select().from(decisions).all()).toEqual(before);
  });

  it('does not modify any V1 Project fields, including nullable text', async () => {
    testDatabase.db
      .insert(projects)
      .values({
        id: 'project-3',
        ownerId: null,
        summary: null,
        background: 'Only legacy background exists',
        buildingStyle: 'studio',
        growthStage: 'exploring',
        visibility: 'private',
        createdAt: new Date('2026-06-07T00:00:00.000Z'),
        updatedAt: new Date('2026-06-08T00:00:00.000Z'),
      })
      .run();
    const before = testDatabase.db.select().from(projects).orderBy(asc(projects.id)).all();

    await importV1Projects();

    expect(testDatabase.db.select().from(projects).orderBy(asc(projects.id)).all()).toEqual(before);
    expect(
      testDatabase.db
        .select()
        .from(projectEvents)
        .where(eq(projectEvents.idempotencyKey, 'v2:legacy-import:project-3'))
        .get(),
    ).toMatchObject({
      payload: JSON.stringify({
        summary: 'Only legacy background exists',
        background: 'Only legacy background exists',
      }),
    });
  });

  it('preserves unbounded V1 text losslessly while deriving a bounded snapshot summary', async () => {
    const summary = `summary-${'s'.repeat(1200)}`;
    const background = `background-${'b'.repeat(2200)}`;
    testDatabase.db
      .insert(projects)
      .values({ id: 'project-long', summary, background })
      .run();
    const before = testDatabase.db
      .select()
      .from(projects)
      .where(eq(projects.id, 'project-long'))
      .get();

    await importV1Projects();

    const event = testDatabase.db
      .select()
      .from(projectEvents)
      .where(eq(projectEvents.idempotencyKey, 'v2:legacy-import:project-long'))
      .get();
    expect(JSON.parse(event!.payload)).toEqual({ summary, background });
    expect(await getCurrentProjectSnapshot('project-long')).toMatchObject({
      summary: summary.slice(0, 1000),
      sourceEventId: event!.id,
    });
    expect(
      testDatabase.db.select().from(projects).where(eq(projects.id, 'project-long')).get(),
    ).toEqual(before);
  });

  it('repairs a missing current snapshot without duplicating the legacy event', async () => {
    await importV1Projects();
    testDatabase.db
      .update(projectSnapshots)
      .set({ isCurrent: false })
      .where(eq(projectSnapshots.projectId, 'project-1'))
      .run();

    const result = await importV1Projects();

    expect(result).toEqual({ projectsFound: 2, eventsCreated: 0, projectsProjected: 1 });
    expect(
      testDatabase.db
        .select()
        .from(projectEvents)
        .where(eq(projectEvents.idempotencyKey, 'v2:legacy-import:project-1'))
        .all(),
    ).toHaveLength(1);
    expect(await getCurrentProjectSnapshot('project-1')).not.toBeNull();
  });

  it('reprojects when creating a legacy event for a project with a current snapshot', async () => {
    const staleSnapshot = await projectProject('project-1');
    const before = testDatabase.db.select().from(projects).orderBy(asc(projects.id)).all();

    const result = await importV1Projects();

    const event = testDatabase.db
      .select()
      .from(projectEvents)
      .where(eq(projectEvents.idempotencyKey, 'v2:legacy-import:project-1'))
      .get();
    expect(result).toEqual({ projectsFound: 2, eventsCreated: 2, projectsProjected: 2 });
    expect(await getCurrentProjectSnapshot('project-1')).toMatchObject({
      sourceEventId: event!.id,
    });
    expect(await getCurrentProjectSnapshot('project-1')).not.toMatchObject({
      id: staleSnapshot.id,
    });
    expect(testDatabase.db.select().from(projects).orderBy(asc(projects.id)).all()).toEqual(before);
  });
});
