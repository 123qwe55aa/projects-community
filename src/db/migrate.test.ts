import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

const temporaryDirectories: string[] = [];
const originalCwd = process.cwd();
const originalDatabasePath = process.env.PROJECTS_COMMUNITY_DB_PATH;

afterEach(() => {
  process.chdir(originalCwd);
  if (originalDatabasePath === undefined) {
    delete process.env.PROJECTS_COMMUNITY_DB_PATH;
  } else {
    process.env.PROJECTS_COMMUNITY_DB_PATH = originalDatabasePath;
  }
  vi.restoreAllMocks();
  vi.resetModules();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('initDatabase', () => {
  it('closes its SQLite handle when pragma setup fails', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'projects-community-pragma-failure-'));
    temporaryDirectories.push(directory);
    process.env.PROJECTS_COMMUNITY_DB_PATH = join(directory, 'test.db');
    const close = vi.spyOn(Database.prototype, 'close');
    vi.spyOn(Database.prototype, 'pragma').mockImplementationOnce(() => {
      throw new Error('pragma setup failed');
    });
    const { initDatabase } = await import('./migrate');

    expect(() => initDatabase()).toThrow('pragma setup failed');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes its SQLite handle when migration initialization fails', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'projects-community-migrate-failure-'));
    temporaryDirectories.push(directory);
    process.chdir(directory);
    process.env.PROJECTS_COMMUNITY_DB_PATH = join(directory, 'test.db');
    const close = vi.spyOn(Database.prototype, 'close');
    const { initDatabase } = await import('./migrate');

    expect(() => initDatabase()).toThrow();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
