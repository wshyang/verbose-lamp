import { mkdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { schema } from './schema.js';

export type TournamentDatabase = PgliteDatabase<typeof schema>;

export interface DatabaseContext {
  client: PGlite;
  db: TournamentDatabase;
  close: () => Promise<void>;
}

export async function createDatabase(dataDirectory?: string): Promise<DatabaseContext> {
  if (dataDirectory) await mkdir(dataDirectory, { recursive: true });
  const client = new PGlite(dataDirectory);
  const db = drizzle(client, { schema });
  return { client, db, close: () => client.close() };
}
