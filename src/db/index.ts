import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

// Singleton
let _db: ReturnType<typeof drizzle> | null = null;
let _sqlite: Database.Database | null = null;

function databasePath() {
  return process.env.PROJECTS_COMMUNITY_DB_PATH
    ? join(process.env.PROJECTS_COMMUNITY_DB_PATH)
    : join(process.cwd(), 'data', 'projects-community.db');
}

export function getDatabase() {
  if (_db && _sqlite) return { db: _db, sqlite: _sqlite };

  const dbPath = databasePath();
  const dbDir = dirname(dbPath);

  // Ensure data directory exists
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  _sqlite = new Database(dbPath);
  // Enable WAL mode for better concurrent read performance
  _sqlite.pragma('journal_mode = WAL');
  _sqlite.pragma('foreign_keys = ON');

  _db = drizzle(_sqlite, { schema });

  return { db: _db, sqlite: _sqlite };
}

export function closeDatabase() {
  _sqlite?.close();
  _sqlite = null;
  _db = null;
}

export type DB = ReturnType<typeof getDatabase>['db'];
