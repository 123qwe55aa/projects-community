import { afterEach, describe, expect, it } from 'vitest';
import { projects } from '@/db/schema';
import { closeDatabase } from '@/db';
import { createTestDatabase } from '@/test/db';

afterEach(() => closeDatabase());

describe('createTestDatabase', () => {
  it('creates an isolated migrated database', async () => {
    const testDb = createTestDatabase();
    await testDb.db.insert(projects).values({ id: 'project-1', summary: 'One' });

    const rows = await testDb.db.select().from(projects);
    expect(rows.map((row) => row.id)).toEqual(['project-1']);
  });
});
