import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(__dirname, '../..');
const cliPath = join(repositoryRoot, 'src/db/project-batch-import-cli.ts');
const tsxPath = join(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
const temporaryDirectories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'projects-community-import-cli-'));
  temporaryDirectories.push(directory);
  return directory;
}

function writeBatch(directory: string, filename: string, project: Record<string, unknown>) {
  const path = join(directory, filename);
  writeFileSync(path, JSON.stringify({ version: 1, projects: [project] }));
  return path;
}

function validProject(overrides: Record<string, unknown> = {}) {
  return {
    key: 'project-one',
    summary: 'Project one',
    background: 'Project one background',
    ...overrides,
  };
}

function runCli(databasePath: string, args: string[], cwd = repositoryRoot) {
  return spawnSync(process.execPath, [tsxPath, cliPath, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      PROJECTS_COMMUNITY_DB_PATH: databasePath,
    },
  });
}

function tableCount(databasePath: string, table: string) {
  const sqlite = new Database(databasePath, { readonly: true });
  try {
    return (sqlite.prepare(`select count(*) as count from ${table}`).get() as { count: number }).count;
  } finally {
    sqlite.close();
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('project batch import CLI', () => {
  it('initializes the selected database, imports a valid file, and reports the result', () => {
    const directory = temporaryDirectory();
    const databasePath = join(directory, 'selected.db');
    const batchPath = writeBatch(directory, 'projects.json', validProject());

    const result = runCli(databasePath, [relative(repositoryRoot, batchPath)]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`Database target: ${databasePath}`);
    expect(result.stdout).toContain(`File: ${batchPath}`);
    expect(result.stdout).toContain('Found: 1, created: 1, skipped: 0, dry-run: no');
    expect(tableCount(databasePath, 'projects')).toBe(1);
    expect(tableCount(databasePath, 'project_import_keys')).toBe(1);
  });

  it('accepts --dry-run before the file and writes nothing', () => {
    const directory = temporaryDirectory();
    const databasePath = join(directory, 'dry-run.db');
    const batchPath = writeBatch(directory, 'projects.json', validProject());

    const result = runCli(databasePath, ['--dry-run', batchPath]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Found: 1, created: 1, skipped: 0, dry-run: yes');
    expect(tableCount(databasePath, 'projects')).toBe(0);
    expect(tableCount(databasePath, 'project_import_keys')).toBe(0);
  });

  it('fails with usage when the file path is missing', () => {
    const directory = temporaryDirectory();
    const databasePath = join(directory, 'missing-argument.db');

    const result = runCli(databasePath, []);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: npm run projects:import -- <file> [--dry-run]');
  });

  it('fails usefully for an unsupported extension', () => {
    const directory = temporaryDirectory();
    const databasePath = join(directory, 'unsupported.db');
    const batchPath = join(directory, 'projects.toml');
    writeFileSync(batchPath, 'version = 1');

    const result = runCli(databasePath, [batchPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/unsupported project batch file extension/i);
    expect(existsSync(databasePath)).toBe(false);
  });

  it('reports the validation path for invalid project content', () => {
    const directory = temporaryDirectory();
    const databasePath = join(directory, 'invalid.db');
    const batchPath = writeBatch(directory, 'projects.json', validProject({ summary: '   ' }));

    const result = runCli(databasePath, [batchPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('projects.0.summary');
    expect(result.stderr).toMatch(/at least 1 character|required/i);
  });

  it('fails on changed content for an existing stable key', () => {
    const directory = temporaryDirectory();
    const databasePath = join(directory, 'conflict.db');
    const firstBatch = writeBatch(directory, 'first.json', validProject());
    const conflictingBatch = writeBatch(
      directory,
      'conflict.json',
      validProject({ summary: 'Changed summary' }),
    );

    expect(runCli(databasePath, [firstBatch]).status).toBe(0);
    const result = runCli(databasePath, [conflictingBatch]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Project import conflict for key "project-one"');
    expect(tableCount(databasePath, 'projects')).toBe(1);
  });

  it('isolates writes to PROJECTS_COMMUNITY_DB_PATH', () => {
    const directory = temporaryDirectory();
    const selectedDatabasePath = join(directory, 'selected.db');
    const otherDatabasePath = join(directory, 'other.db');
    writeFileSync(otherDatabasePath, 'unchanged');
    const batchPath = writeBatch(directory, 'projects.json', validProject());

    const result = runCli(relative(repositoryRoot, selectedDatabasePath), [batchPath]);

    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(selectedDatabasePath)).toBe(true);
    expect(tableCount(selectedDatabasePath, 'projects')).toBe(1);
    expect(readFileSync(otherDatabasePath, 'utf8')).toBe('unchanged');
  });
});
