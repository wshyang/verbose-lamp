import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from './database.js';
import { runMigrations } from './migrate.js';
import { matches, pointEntries, teams, tournaments } from './schema.js';

let temporaryDirectory: string | undefined;

afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

describe('PGlite provisioning and Drizzle schema', () => {
  it('creates an isolated persistent store and applies migrations idempotently', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'matchday-pglite-'));
    const database = await createDatabase(temporaryDirectory);
    try {
      await runMigrations(database.client);
      await runMigrations(database.client);
      const versions = await database.client.query<{ version: string }>('SELECT version FROM schema_migrations');
      expect(versions.rows.map((row) => row.version)).toEqual(['0001_initial_tournament_engine']);
    } finally {
      await database.close();
    }
  });

  it('exposes indexed tables and deferred foreign-key references through Drizzle', () => {
    const configs = [tournaments, teams, matches, pointEntries].map(getTableConfig);
    expect(configs.map((config) => config.name)).toEqual(['tournaments', 'teams', 'matches', 'point_entries']);
    expect(configs[1]?.foreignKeys).toHaveLength(1);
    expect(configs[2]?.foreignKeys).toHaveLength(2);
    expect(configs[3]?.foreignKeys).toHaveLength(3);
    expect(configs.slice(1).every((config) => config.indexes.length > 0)).toBe(true);
    const references = configs.flatMap((config) => config.foreignKeys.map((foreignKey) => foreignKey.reference()));
    expect(references.map((reference) => getTableConfig(reference.foreignTable).name)).toEqual([
      'tournaments',
      'tournaments',
      'teams',
      'tournaments',
      'teams',
      'matches',
    ]);
  });
});
