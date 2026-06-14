import 'dotenv/config';
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';

const usage = 'Usage: npm run projects:import -- <file> [--dry-run]';
const invocationDirectory = process.cwd();
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

config({ path: resolve(invocationDirectory, '.env.local') });

function parseArguments(args: string[]) {
  const dryRunArguments = args.filter((argument) => argument === '--dry-run');
  const fileArguments = args.filter((argument) => argument !== '--dry-run');

  if (
    dryRunArguments.length > 1 ||
    fileArguments.length !== 1 ||
    fileArguments[0].startsWith('--')
  ) {
    throw new Error(usage);
  }

  return {
    file: resolve(invocationDirectory, fileArguments[0]),
    dryRun: dryRunArguments.length === 1,
  };
}

function resolveDatabaseTarget() {
  return process.env.PROJECTS_COMMUNITY_DB_PATH
    ? resolve(invocationDirectory, process.env.PROJECTS_COMMUNITY_DB_PATH)
    : resolve(repositoryRoot, 'data/projects-community.db');
}

function errorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
  }
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const { file, dryRun } = parseArguments(process.argv.slice(2));
  const contract = await import('../lib/v2/project-batch-contract');
  const contents = readFileSync(file, 'utf8');
  const parsed = contract.parseProjectBatchFile(contents, file);
  const batch = contract.normalizeProjectBatch(parsed, file);

  const target = resolveDatabaseTarget();
  process.env.PROJECTS_COMMUNITY_DB_PATH = target;
  process.chdir(repositoryRoot);
  console.log(`Database target: ${target}`);

  const [{ closeDatabase }, { initDatabase }, { importProjectBatch }] = await Promise.all([
    import('./index'),
    import('./migrate'),
    import('../lib/v2/project-batch-import'),
  ]);

  try {
    const migrated = initDatabase();
    migrated.sqlite.close();
    const result = await importProjectBatch(batch, { dryRun });

    console.log(`File: ${file}`);
    console.log(
      `Found: ${result.projectsFound}, created: ${result.projectsCreated}, skipped: ${result.projectsSkipped}, dry-run: ${result.dryRun ? 'yes' : 'no'}`,
    );
  } finally {
    closeDatabase();
  }
}

main().catch((error) => {
  console.error(`Project batch import failed: ${errorMessage(error)}`);
  process.exitCode = 1;
});
