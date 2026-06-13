import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase, getDatabase } from '@/db';
import { initDatabase } from '@/db/migrate';

export function createTestDatabase() {
  closeDatabase();
  const directory = mkdtempSync(join(tmpdir(), 'projects-community-'));
  process.env.PROJECTS_COMMUNITY_DB_PATH = join(directory, 'test.db');
  const migrated = initDatabase();
  migrated.sqlite.close();
  return getDatabase();
}
