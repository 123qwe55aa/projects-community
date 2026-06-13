import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { decisions, projectEvents, projects } from '@/db/schema';
import { createTestDatabase } from '@/test/db';
import { getCurrentProjectSnapshot } from './projection/project';
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

  it('imports nullable V1 text fields using the available legacy text', async () => {
    testDatabase.db
      .insert(projects)
      .values({ id: 'project-3', summary: null, background: 'Only legacy background exists' })
      .run();

    await importV1Projects();

    expect(
      testDatabase.db.select().from(projects).where(eq(projects.id, 'project-3')).get(),
    ).toMatchObject({
      background: 'Only legacy background exists',
      summary: 'Only legacy background exists',
    });
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
});
