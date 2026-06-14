import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(__dirname, '../..');
const commands = ['v2-migrate.ts', 'v2-rebuild.ts'];
const temporaryDirectories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'projects-community-v2-cli-'));
  temporaryDirectories.push(directory);
  return directory;
}

function runCli(command: string, databasePath: string, cwd = repositoryRoot) {
  return spawnSync(
    process.execPath,
    [join(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'), join(repositoryRoot, 'src/db', command)],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        PROJECTS_COMMUNITY_DB_PATH: databasePath,
      },
    },
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe.each(commands)('%s database target safety', (command) => {
  it('prints the resolved absolute target before operating on an existing database', () => {
    const directory = temporaryDirectory();
    const databasePath = join(directory, 'existing.db');
    writeFileSync(databasePath, '');

    const result = runCli(command, relative(repositoryRoot, databasePath));

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`Database target: ${databasePath}`);
  });

  it('rejects a nonexistent target without creating it', () => {
    const directory = temporaryDirectory();
    const databasePath = join(directory, 'missing.db');

    const result = runCli(command, relative(repositoryRoot, databasePath));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Database target does not exist: ${databasePath}`);
    expect(existsSync(databasePath)).toBe(false);
  });
});
