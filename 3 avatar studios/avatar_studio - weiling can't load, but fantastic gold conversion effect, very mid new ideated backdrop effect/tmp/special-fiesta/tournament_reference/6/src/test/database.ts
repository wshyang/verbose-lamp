import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { TournamentDatabase } from '../server/db/database.js';
import { runMigrations } from '../server/db/migrate.js';
import { schema } from '../server/db/schema.js';

export interface TestDatabase {
  client: PGlite;
  db: TournamentDatabase;
  close: () => Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  await runMigrations(client);
  const db = drizzle(client, { schema });
  return { client, db, close: () => client.close() };
}
