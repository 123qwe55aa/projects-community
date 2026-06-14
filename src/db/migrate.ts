import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

const MIGRATIONS_FOLDER = path.join(process.cwd(), 'drizzle');

function databasePath() {
  return process.env.PROJECTS_COMMUNITY_DB_PATH
    ? path.join(process.env.PROJECTS_COMMUNITY_DB_PATH)
    : path.join(process.cwd(), 'data', 'projects-community.db');
}

export function initDatabase() {
  const dbPath = databasePath();
  const dbDir = path.dirname(dbPath);

  // Ensure data directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const sqlite = new Database(dbPath);

  try {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    const db = drizzle(sqlite, { schema });

    // Run migrations
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    return { db, sqlite };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
