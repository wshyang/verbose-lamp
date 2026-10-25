import { createDatabase } from './db/database.js';
import { runMigrations } from './db/migrate.js';

const database = await createDatabase(process.env.PGLITE_DATA_DIR ?? '.data/pglite');
try {
  await runMigrations(database.client);
  console.info('Tournament database is up to date.');
} finally {
  await database.close();
}
