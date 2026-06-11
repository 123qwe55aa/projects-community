import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local if it exists
config({ path: resolve(process.cwd(), '.env.local') });

import { getDatabase } from './index';
import { initDatabase } from './migrate';
import { seedDatabase } from './seed';

async function main() {
  console.log('Running migrations...');
  const { sqlite: migrationSqlite } = initDatabase();
  migrationSqlite.close();

  console.log('Connecting to database...');
  const { sqlite } = getDatabase();
  if (!sqlite) throw new Error('Database connection failed');

  console.log('Running seed...');
  await seedDatabase();

  console.log('Done!');

  sqlite.close();
}

main().catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
