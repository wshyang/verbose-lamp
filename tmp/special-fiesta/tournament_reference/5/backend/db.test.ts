// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createDatabase } from './db.js';
import { newId } from './ids.js';
import { createTournament, getGraph, rewriteTeamSlot } from './repository.js';
import { tournaments } from './schema.js';

describe('database boot (real PGlite, GREENFIELD s2)', () => {
  it('applies the snapshot to an in-memory database', async () => {
    const handle = await createDatabase();
    const rows = await handle.db.select().from(tournaments);
    expect(rows).toEqual([]);
    await handle.close();
  });

  it('applies the twin migration file to an empty database (GREENFIELD s5)', async () => {
    const client = new PGlite();
    const migration = await readFile(new URL('./migrations/0001_init.sql', import.meta.url), 'utf8');
    await client.exec(migration);
    const result = await client.query<{ version: string }>('select version from schema_migrations');
    expect(result.rows).toEqual([{ version: '0001_init' }]);
    await client.close();
  });

  it('persists to a data directory and reopens', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pglite-'));
    const config = {
      courts: 1, matchLengthMinutes: 20, tournamentLengthMinutes: 240,
      startMinutes: 540, restMinutes: 5, winPoints: 3, drawPoints: 1, lossPoints: 0,
    };
    const first = await createDatabase(dir);
    const graph = await createTournament(first.db, {
      name: 'Persisted Cup', mode: 'round-robin', config, teamNames: ['One', 'Two'],
    });
    await first.close();
    const second = await createDatabase(dir);
    const reopened = await getGraph(second.db, graph.tournament.id);
    expect(reopened?.tournament.name).toBe('Persisted Cup');
    await second.close();
    await rm(dir, { recursive: true, force: true });
  });
});

describe('ids and slot rewriting', () => {
  it('mints UUIDv7-shaped unique ids', () => {
    const first = newId(1700000000000);
    const second = newId(1700000000000);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first).not.toBe(second);
    expect(newId()).toMatch(/-7[0-9a-f]{3}-/);
  });

  it('rewrites only concrete team slots to persisted ids', () => {
    const ids = new Map([['team-1', 'db-1']]);
    const names = new Map([['team-1', 'Alpha']]);
    expect(rewriteTeamSlot({ kind: 'team', teamRef: 'team-1', label: 'Seed 1' }, ids, names))
      .toEqual({ kind: 'team', teamRef: 'db-1', label: 'Alpha' });
    expect(rewriteTeamSlot({ kind: 'winnerOf', matchKey: 'M1' }, ids, names))
      .toEqual({ kind: 'winnerOf', matchKey: 'M1' });
  });

  afterAll(() => {
    expect(true).toBe(true);
  });
});
