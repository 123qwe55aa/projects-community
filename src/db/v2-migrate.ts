import 'dotenv/config';
import { config } from 'dotenv';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

config({ path: resolve(process.cwd(), '.env.local') });

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function resolveDatabaseTarget() {
  const target = process.env.PROJECTS_COMMUNITY_DB_PATH
    ? resolve(process.cwd(), process.env.PROJECTS_COMMUNITY_DB_PATH)
    : resolve(repositoryRoot, 'data/projects-community.db');

  if (!existsSync(target)) {
    throw new Error(`Database target does not exist: ${target}`);
  }
  if (!statSync(target).isFile()) {
    throw new Error(`Database target is not a file: ${target}`);
  }

  return target;
}

async function main() {
  const target = resolveDatabaseTarget();
  process.env.PROJECTS_COMMUNITY_DB_PATH = target;
  process.chdir(repositoryRoot);
  console.log(`Database target: ${target}`);

  const [{ closeDatabase }, { initDatabase }, { importV1Projects }] = await Promise.all([
    import('./index'),
    import('./migrate'),
    import('../lib/v2/migration'),
  ]);

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
