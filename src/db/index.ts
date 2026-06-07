import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as Database from 'better-sqlite3';
import * as schema from './schema';
import * as path from 'path';
import * as fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'projects-community.db');

// Singleton
let _db: ReturnType<typeof drizzle> | null = null;
let _sqlite: Database.Database | null = null;

export function getDatabase() {
  if (_db && _sqlite) return { db: _db, sqlite: _sqlite };

  // Ensure data directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  _sqlite = new Database(DB_PATH);
  // Enable WAL mode for better concurrent read performance
  _sqlite.pragma('journal_mode = WAL');
  _sqlite.pragma('foreign_keys = ON');

  _db = drizzle(_sqlite, { schema });

  return { db: _db, sqlite: _sqlite };
}

export type DB = ReturnType<typeof getDatabase>['db'];