import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { closeDatabase } from './index';
import { initDatabase } from './migrate';
import { importV1Projects } from '@/lib/v2/migration';

async function main() {
  const migrated = initDatabase();
  migrated.sqlite.close();

  try {
    const result = await importV1Projects();
    console.log(
      `V2 migration complete: ${result.projectsFound} projects found, ${result.eventsCreated} legacy events created, ${result.projectsProjected} projects projected.`,
    );
  } finally {
    closeDatabase();
  }
}

main().catch((error) => {
  console.error('V2 migration failed:', error);
  process.exitCode = 1;
});
