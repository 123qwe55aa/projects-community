import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projects } from '@/db/schema';
import { createTestDatabase } from '@/test/db';

describe('createTestDatabase', () => {
  it('creates an isolated migrated database', async () => {
    const testDb = createTestDatabase();
    try {
      await testDb.db.insert(projects).values({ id: 'project-1', summary: 'One' });

      const rows = await testDb.db.select().from(projects);
      expect(rows.map((row) => row.id)).toEqual(['project-1']);
    } finally {
      testDb.cleanup();
    }
  });

  it('keeps databases created by separate harnesses isolated', async () => {
    const first = createTestDatabase();
    await first.db.insert(projects).values({ id: 'project-1', summary: 'One' });

    const second = createTestDatabase();
    try {
      expect(await second.db.select().from(projects)).toEqual([]);
    } finally {
      second.cleanup();
      first.cleanup();
    }
  });

  it('restores the previous database path during cleanup', () => {
    const previousPath = process.env.PROJECTS_COMMUNITY_DB_PATH;
    process.env.PROJECTS_COMMUNITY_DB_PATH = '/previous/database.db';
    try {
      const testDb = createTestDatabase();

      testDb.cleanup();

      expect(process.env.PROJECTS_COMMUNITY_DB_PATH).toBe('/previous/database.db');
    } finally {
      if (previousPath === undefined) {
        delete process.env.PROJECTS_COMMUNITY_DB_PATH;
      } else {
        process.env.PROJECTS_COMMUNITY_DB_PATH = previousPath;
      }
    }
  });

  it('deletes the test database path during cleanup when none existed before', () => {
    const previousPath = process.env.PROJECTS_COMMUNITY_DB_PATH;
    delete process.env.PROJECTS_COMMUNITY_DB_PATH;
    try {
      const testDb = createTestDatabase();

      testDb.cleanup();

      expect(process.env.PROJECTS_COMMUNITY_DB_PATH).toBeUndefined();
    } finally {
      if (previousPath !== undefined) {
        process.env.PROJECTS_COMMUNITY_DB_PATH = previousPath;
      }
    }
  });

  it('removes the temporary SQLite directory during cleanup', () => {
    const testDb = createTestDatabase();
    const directory = dirname(testDb.path);

    testDb.cleanup();

    expect(existsSync(directory)).toBe(false);
  });
});
