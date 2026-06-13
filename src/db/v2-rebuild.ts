import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { closeDatabase, getDatabase } from './index';
import { initDatabase } from './migrate';
import { projects } from './schema';
import { rebuildAllProjectProjections } from '@/lib/v2/projection/rebuild';

async function main() {
  const migrated = initDatabase();
  migrated.sqlite.close();

  try {
    await rebuildAllProjectProjections();
    const projectsProjected = getDatabase().db.select({ id: projects.id }).from(projects).all().length;
    console.log(`V2 projection rebuild complete: ${projectsProjected} projects projected.`);
  } finally {
    closeDatabase();
  }
}

main().catch((error) => {
  console.error('V2 projection rebuild failed:', error);
  process.exitCode = 1;
});
