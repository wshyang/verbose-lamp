import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLUSTER_CODES, PARTICIPANT_TITLES } from '@psd/contracts';
import { eq, sql } from 'drizzle-orm';
import { getEnv } from '../env.js';
import type { DatabaseHandle } from './client.js';
import {
  clusters,
  facilitatorAccounts,
  participantTitles,
  superadminAccounts,
} from './schema/index.js';
import { required } from './rows.js';

/**
 * Idempotent bootstrap seed (fds.md §8.1 B1–B2, AGENTS-database.md §6, ADR-102).
 * PointConfig is deliberately NOT seeded: its absence is the bootstrap gate (§2.12).
 *
 * ADR-102 — two kinds of seed live here, deliberately apart:
 *   - catalogues (clusters, titles) are derived from `@psd/contracts` constants IN CODE,
 *     so the validating constant and the validated rows share one source;
 *   - accounts (the superadmin, the named facilitators) are `seed-default.sql`, tier 2 of
 *     the three-tier data story, rendered with env credentials and applied here.
 */

export const SYSTEM_FACILITATOR_USERNAME = 'system';
const MISSING_PASSCODE_MESSAGE =
  'SUPERADMIN_INITIAL_PASSCODE environment variable required for initial superadmin seeding.';

const SEED_DEFAULT = join(dirname(fileURLToPath(import.meta.url)), 'seed-default.sql');

/** A SQL string literal — the only escaping a text value needs with standard strings on. */
function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function seedClusters(handle: DatabaseHandle): Promise<void> {
  // ADR-007 — display name equals the code until the organisers supply official names.
  const rows = CLUSTER_CODES.map((code) => ({ code, displayName: code }));
  await handle.db.insert(clusters).values(rows).onConflictDoNothing();
}

/**
 * ADR-061 — the hundred energetic words, seeded exactly like the clusters.
 *
 * `onConflictDoNothing` makes it idempotent, so adding a word to `PARTICIPANT_TITLES` and restarting
 * is all it takes to put it in play. Nothing removes words: a participant already wearing one keeps
 * their foreign key, which is the point of a table rather than a Postgres enum.
 */
async function seedParticipantTitles(handle: DatabaseHandle): Promise<void> {
  const rows = PARTICIPANT_TITLES.map((name) => ({ name }));
  await handle.db.insert(participantTitles).values(rows).onConflictDoNothing();
}

/**
 * ADR-102 tier 2 — `seed-default.sql`: the initial superadmin and the named facilitator
 * accounts, with the superadmin's credentials rendered from the environment so they never
 * live in the repository. The SQL file guards every statement, so this is safe on every boot;
 * the loud failure when the passcode is missing on a virgin install stays here (fds.md §8.3).
 */
async function seedDefaultAccounts(handle: DatabaseHandle): Promise<void> {
  const env = getEnv();
  const existing = await handle.db.select({ id: superadminAccounts.id }).from(superadminAccounts);
  if (existing.length === 0 && !env.SUPERADMIN_INITIAL_PASSCODE) {
    throw new Error(MISSING_PASSCODE_MESSAGE);
  }
  const template = await readFile(SEED_DEFAULT, 'utf8');
  const rendered = template
    .replaceAll('__SUPERADMIN_USERNAME__', sqlLiteral(env.SUPERADMIN_INITIAL_USERNAME))
    // The fallback is unreachable: with no superadmin row the guard above has already thrown,
    // and with one the INSERT's WHERE NOT EXISTS never evaluates the value.
    .replaceAll('__SUPERADMIN_PASSCODE__', sqlLiteral(env.SUPERADMIN_INITIAL_PASSCODE ?? '0000'));
  await handle.runSql(rendered);
}

export async function seedDatabase(handle: DatabaseHandle): Promise<void> {
  await seedClusters(handle);
  await seedParticipantTitles(handle);
  await seedDefaultAccounts(handle);
}

export async function getSystemFacilitatorId(handle: DatabaseHandle): Promise<string> {
  const [row] = await handle.db
    .select({ id: facilitatorAccounts.id })
    .from(facilitatorAccounts)
    .where(eq(sql`lower(${facilitatorAccounts.username})`, SYSTEM_FACILITATOR_USERNAME));
  return required(row, 'System facilitator').id;
}
