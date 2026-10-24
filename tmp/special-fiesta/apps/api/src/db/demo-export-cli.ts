import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { openDatabase, type DatabaseHandle } from './client.js';
import { rowsOf } from './rows.js';
import { describeUnhandledError } from '../lib/errorReport.js';

/**
 * ADR-102 tier 3 — regenerates `seed-demo.sql` from the database the environment points at.
 *
 * Workflow: start a fresh dev server, run `npm run seed:demo` (the HTTP replay — every row
 * reachable by real clicks, ADR-040), STOP the server, then `npm run db:export-demo`. The
 * result is a frozen, instantly-applicable copy of that day: `PSD_SEED=demo` on a fresh
 * database replays it in one statement batch, no running API required.
 *
 * The file is GENERATED — never edit it by hand; change `scripts/seed-demo.mjs` and re-export.
 */

/** Owned by tiers 1–2 (catalogues, accounts) or ephemeral secrets; never part of the demo dump. */
const EXCLUDED = new Set([
  'cluster',
  'participant_title',
  'superadmin_account',
  'facilitator_account',
  'session',
  // ADR-264 — the schema stamp is written by the bootstrap that applies the snapshot, never by a seed:
  // replaying a stamp from the dump would overwrite the version of the build that is actually running.
  'schema_state',
]);

/** Every demo-owned table, in foreign-key order (parents before dependants). */
const EXPORT_TABLES = [
  'participant',
  'team',
  'team_membership',
  'fringe_activity',
  'fringe_round',
  'fringe_scan',
  'point_config',
  'void_audit_entry',
  'chat_message',
  'announcement',
  'team_chat_message',
  'swag_station',
  'swag_round',
  'swag_claim',
  'gallery_photo',
  'gallery_vote',
  'gallery_report',
  'gallery_blob',
  // ADR-177 — the programme stands alone: it has no foreign keys, so order is free here.
  'agenda_item',
  // ADR-286 — the venue's courts. ADR-313 — the demo also carries one unstarted draft (its saved
  // Start configuration rides on the tournament row), so its entrants export with it; every later
  // tournament table stays empty until Start, and a populated one fails the coverage check.
  'tournament_court',
  'tournament',
  'tournament_entrant',
];

/*
 * ADR-189 — the fixture's clock.
 *
 * `scripts/seed-demo.mjs` drives the real HTTP API (ADR-040), which is the point of it: every
 * row is reachable by a human doing the same clicks. The API stamps `created_at` with `now()`,
 * correctly, and the replay posts a hundred and twenty messages in a tight loop — so the demo
 * day arrives with every message in a room sharing one instant to within a second. The app then
 * renders eighty people saying eighty things simultaneously, which is the single thing a
 * "lived in" fixture must not look like.
 *
 * The seeding script cannot fix this without writing behind the API's back, which is exactly
 * what it exists not to do. So the spread belongs here, in the step that turns a live database
 * into a frozen fixture, because the gaps between messages are a property of the FIXTURE and of
 * nothing else. ORDER IS PRESERVED EXACTLY — only the silences between messages are invented,
 * and they are invented deterministically so that re-exporting twice gives the same file.
 */
const CHAT_SPREAD_MS = 150 * 60_000;
const CHAT_MIN_GAP_MS = 3_000;

/** A tiny LCG rather than `Math.random`, so the generated file is reproducible. */
function pseudoRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function createdAtOf(row: Record<string, unknown>): number {
  return new Date(row['created_at'] as string | Date).getTime();
}

/**
 * Re-times one conversation, walking BACKWARDS from its most recent message.
 *
 * Backwards because the newest message is the only one whose real timestamp means anything —
 * it is what the demo calls "just now" — and because subtracting gaps cannot overshoot the end
 * of the window the way distributing them forwards can.
 */
function spreadThread(rows: Record<string, unknown>[], random: () => number): void {
  if (rows.length === 0) return;
  const ordered = [...rows].sort(
    (a, b) =>
      createdAtOf(a) - createdAtOf(b) || String(a['id']).localeCompare(String(b['id'])),
  );
  const averageGap = (CHAT_SPREAD_MS / ordered.length) * 2;
  let when = ordered.reduce((latest, row) => Math.max(latest, createdAtOf(row)), 0);
  for (const row of ordered.reverse()) {
    row['created_at'] = new Date(Math.round(when));
    when -= CHAT_MIN_GAP_MS + random() * averageGap;
  }
}

/** Group a team's room together: each team has its own conversation, not a shared one. */
function roomsOf(rows: Record<string, unknown>[]): Map<string, Record<string, unknown>[]> {
  const rooms = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = String(row['team_id']);
    const room = rooms.get(key) ?? [];
    room.push(row);
    rooms.set(key, room);
  }
  return rooms;
}

function settleChatClock(table: string, rows: Record<string, unknown>[]): void {
  if (table === 'chat_message') {
    spreadThread(rows, pseudoRandom(20_261_006));
    return;
  }
  if (table !== 'team_chat_message') return;
  const random = pseudoRandom(20_261_007);
  for (const room of roomsOf(rows).values()) spreadThread(room, random);
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'seed-demo.sql');
const ROWS_PER_INSERT = 40;

function textLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function literalOf(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (value instanceof Uint8Array) return `'\\x${Buffer.from(value).toString('hex')}'`;
  if (typeof value === 'object') return `${textLiteral(JSON.stringify(value))}::jsonb`;
  return textLiteral(String(value));
}

function insertsFor(table: string, rows: Record<string, unknown>[]): string[] {
  const first = rows[0];
  if (!first) return [`-- ${table}: no rows`];
  const columns = Object.keys(first);
  const statements: string[] = [`-- ${table}: ${rows.length} rows`];
  for (let at = 0; at < rows.length; at += ROWS_PER_INSERT) {
    const chunk = rows.slice(at, at + ROWS_PER_INSERT);
    const tuples = chunk.map(
      (row) => `  (${columns.map((column) => literalOf(row[column])).join(', ')})`,
    );
    statements.push(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${tuples.join(',\n')};`,
    );
  }
  return statements;
}

/** Any populated table this export does not know about must fail the run, not vanish quietly. */
async function assertFullCoverage(handle: DatabaseHandle): Promise<void> {
  const listed = await handle.db.execute<{ table_name: string }>(
    sql`select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  for (const { table_name: table } of rowsOf(listed)) {
    if (EXCLUDED.has(table) || EXPORT_TABLES.includes(table)) continue;
    const counted = await handle.db.execute<{ total: number }>(
      sql.raw(`select count(*)::int as total from ${table}`),
    );
    if ((rowsOf(counted)[0]?.total ?? 0) > 0) {
      throw new Error(`Table '${table}' has rows but is not classified in demo-export-cli.ts.`);
    }
  }
}

async function main(): Promise<void> {
  const handle = await openDatabase();
  await assertFullCoverage(handle);

  const sections: string[] = [
    '-- PSD Active Day — tier 3 of the data story (ADR-102): the DEMO SEED.',
    '--',
    '-- GENERATED by `npm run db:export-demo` — do not edit. To change the demo day, edit',
    '-- `scripts/seed-demo.mjs`, replay it against a fresh server, stop the server, re-export.',
    '--',
    '-- Applied by `db/bootstrap.ts` only when PSD_SEED=demo and the participant table is',
    '-- empty. Actor ids referenced here (facilitators, the superadmin) are the fixed ids',
    '-- from tier 2, `seed-default.sql`.',
    '',
    'BEGIN;',
  ];
  let total = 0;
  for (const table of EXPORT_TABLES) {
    const result = await handle.db.execute(sql.raw(`select * from ${table}`));
    const rows = rowsOf(result) as Record<string, unknown>[];
    settleChatClock(table, rows);
    total += rows.length;
    sections.push('', ...insertsFor(table, rows));
  }
  sections.push('', 'COMMIT;', '');

  await writeFile(OUT, sections.join('\n'), 'utf8');
  console.log(`seed-demo.sql written: ${total} rows across ${EXPORT_TABLES.length} tables`);
  await handle.close();
}

main().catch((error) => {
  console.error('demo export failed', describeUnhandledError(error));
  process.exitCode = 1;
});
