import 'dotenv/config';
import { config } from 'dotenv';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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

function fileSignature(path: string) {
  if (!existsSync(path)) return undefined;
  const stat = statSync(path);
  return {
    ino: stat.ino,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
  };
}

function createDryRunTarget(realTarget: string) {
  const directory = mkdtempSync(join(tmpdir(), 'projects-community-import-dry-run-'));
  const target = join(directory, 'dry-run.db');

  try {
    if (existsSync(realTarget)) {
      const realWal = `${realTarget}-wal`;
      const targetWal = `${target}-wal`;
      let copied = false;

      for (let attempt = 0; attempt < 3 && !copied; attempt += 1) {
        const before = [fileSignature(realTarget), fileSignature(realWal)];
        rmSync(target, { force: true });
        rmSync(targetWal, { force: true });
        try {
          copyFileSync(realTarget, target);
          if (before[1]) copyFileSync(realWal, targetWal);
        } catch (error) {
          const after = [fileSignature(realTarget), fileSignature(realWal)];
          if (JSON.stringify(after) !== JSON.stringify(before)) continue;
          throw error;
        }
        const after = [fileSignature(realTarget), fileSignature(realWal)];
        copied = JSON.stringify(after) === JSON.stringify(before);
      }

      if (!copied) {
        throw new Error('Database changed while preparing the dry-run snapshot');
      }
    }
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }

  return {
    target,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

async function main() {
  const { file, dryRun } = parseArguments(process.argv.slice(2));
  const contract = await import('../lib/v2/project-batch-contract');
  const contents = readFileSync(file, 'utf8');
  const parsed = contract.parseProjectBatchFile(contents, file);
  const batch = contract.normalizeProjectBatch(parsed, file);

  const realTarget = resolveDatabaseTarget();
  const dryRunTarget = dryRun ? createDryRunTarget(realTarget) : undefined;

  try {
    process.env.PROJECTS_COMMUNITY_DB_PATH = dryRunTarget?.target ?? realTarget;
    process.chdir(repositoryRoot);
    console.log(`Database target: ${realTarget}`);

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
  } finally {
    dryRunTarget?.cleanup();
  }
}

main().catch((error) => {
  console.error(`Project batch import failed: ${errorMessage(error)}`);
  process.exitCode = 1;
});
