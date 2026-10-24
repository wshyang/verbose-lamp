import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { readFile } from 'node:fs/promises';
import * as schema from './schema.js';

export type Database = PgliteDatabase<typeof schema>;
export interface DbHandle { db: Database; close: () => Promise<void> }

/** Boot a real Postgres (PGlite) and apply the wholesale snapshot from zero. */
export async function createDatabase(dataDir?: string): Promise<DbHandle> {
  const client = dataDir === undefined ? new PGlite() : new PGlite(dataDir);
  const db = drizzle(client, { schema });
  const snapshot = await readFile(new URL('./schema-snapshot.sql', import.meta.url), 'utf8');
  await client.exec(snapshot);
  return { db, close: () => client.close() };
}
