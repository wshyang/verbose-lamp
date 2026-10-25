import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migrationFiles = ['0001_initial_tournament_engine.sql'] as const;

export async function runMigrations(client: PGlite): Promise<void> {
  await client.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const applied = await client.query<{ version: string }>(
    'SELECT version FROM schema_migrations',
  );
  const appliedVersions = new Set(applied.rows.map((row) => row.version));
  await applyPendingMigrations(client, appliedVersions);
}

async function applyPendingMigrations(
  client: PGlite,
  appliedVersions: Set<string>,
): Promise<void> {
  for (const fileName of migrationFiles) {
    const version = fileName.replace('.sql', '');
    if (appliedVersions.has(version)) continue;
    const contents = await readFile(new URL(`./migrations/${fileName}`, import.meta.url), 'utf8');
    const versionedSql = contents.replace(
      "VALUES ('0001_initial_tournament_engine')",
      `VALUES ('${version}')`,
    );
    await client.exec(versionedSql);
  }
}
