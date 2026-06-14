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

  const [{ closeDatabase, getDatabase }, { initDatabase }, { projects }, { rebuildAllProjectProjections }] =
    await Promise.all([
      import('./index'),
      import('./migrate'),
      import('./schema'),
      import('../lib/v2/projection/rebuild'),
    ]);

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
