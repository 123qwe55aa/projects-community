import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase, getDatabase } from '@/db';
import { initDatabase } from '@/db/migrate';

export function createTestDatabase() {
  closeDatabase();
  const directory = mkdtempSync(join(tmpdir(), 'projects-community-'));
  const path = join(directory, 'test.db');
  const previousPath = process.env.PROJECTS_COMMUNITY_DB_PATH;
  process.env.PROJECTS_COMMUNITY_DB_PATH = path;
  const migrated = initDatabase();
  migrated.sqlite.close();
  const database = getDatabase();
  let cleanedUp = false;

  return {
    ...database,
    path,
    cleanup() {
      if (cleanedUp) return;
      cleanedUp = true;

      closeDatabase();
      if (previousPath === undefined) {
        delete process.env.PROJECTS_COMMUNITY_DB_PATH;
      } else {
        process.env.PROJECTS_COMMUNITY_DB_PATH = previousPath;
      }
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
