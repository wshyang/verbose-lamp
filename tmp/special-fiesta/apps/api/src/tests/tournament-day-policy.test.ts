import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../db/ids.js';
import { tournaments, type TournamentRow } from '../db/schema/index.js';
import {
  bracketIsLive,
  deskDay,
  deskSetupSlot,
  dumbDay,
  liveBracket,
  liveDumbDay,
  openDayExists,
  readersDay,
  schedulerDay,
} from '../tournament/dayPolicy.js';
import { createTestContext, type TestContext } from './harness.js';

/**
 * ADR-345 — the day policy's whole matrix, on a real database.
 *
 * "Which tournament does this surface mean?" is a two-axis choice — row states (draft / live /
 * closed-started / discarded) × kinds (captain's ball / dumb courts) — and before the policy
 * module existed, ten routes composed those axes by hand. ADR-326 is what that costs (the
 * console resolved the desk's day one way, the close route another, and a dumb-only day had a
 * Close button that closed nothing), so this suite plays every combination the axes produce
 * and pins each policy's pick by name. Re-composing a policy differently elsewhere can no
 * longer pass silently: the answer is written down here, once, with the policy's name on it.
 *
 * The rows are bare `tournament` rows — every policy reads that table only — so the matrix
 * needs no entrants, courts or matches, and a case is seeded by name and asserted by name.
 */

let ctx: TestContext;

/** The desk that seeded the day — the actor columns are recorded, never joined on here. */
const DESK_ID = newId();

type Kind = 'captains_ball' | 'dumb_courts';
type RowState = 'draft' | 'live' | 'paused-live' | 'closed-started' | 'discarded';

type DaySeed = {
  name: string;
  kind: Kind;
  state: RowState;
  createdAt?: Date;
  startedAt?: Date;
  closedAt?: Date;
};

const T0 = new Date('2026-10-23T09:00:00.000Z');
const LATER = new Date('2026-10-23T17:00:00.000Z');
const EVEN_LATER = new Date('2026-10-23T18:30:00.000Z');

/** Seed one bare tournament row and return its name — the handle every assertion uses. */
async function seedDay(input: DaySeed): Promise<string> {
  const closed = input.state === 'closed-started' || input.state === 'discarded';
  await ctx.handle.db.insert(tournaments).values({
    id: newId(),
    name: input.name,
    kind: input.kind,
    status: input.state === 'draft' ? 'draft' : closed ? 'closed' : 'live',
    winPoints: 30,
    drawPoints: 20,
    lossPoints: 10,
    createdByKind: 'superadmin',
    createdById: DESK_ID,
    createdByLabel: 'the desk',
    createdAt: input.createdAt ?? T0,
    startedAt: input.state === 'closed-started' ? (input.startedAt ?? T0) : null,
    closedAt: closed ? (input.closedAt ?? LATER) : null,
    closeReason: closed ? 'the day is done' : null,
    pausedAt: input.state === 'paused-live' ? LATER : null,
  });
  return input.name;
}

/** The row's name, or null for "no answer" — the one shape every assertion reads. */
function nameOf(row: TournamentRow | null): string | null {
  return row === null ? null : row.name;
}

/** Every policy's answer, as one record keyed by policy name — the shape each case asserts. */
async function picks(): Promise<Record<string, string | boolean | null>> {
  const db = ctx.handle.db;
  return {
    readersDay: nameOf(await readersDay(db)),
    dumbDay: nameOf(await dumbDay(db)),
    deskDay: nameOf(await deskDay(db)),
    liveBracket: nameOf(await liveBracket(db)),
    liveDumbDay: nameOf(await liveDumbDay(db)),
    bracketIsLive: await bracketIsLive(db),
    openDayExists: await openDayExists(db),
    deskSetupSlot: nameOf(await deskSetupSlot(db)),
    schedulerDay: nameOf(await schedulerDay(db)),
  };
}

beforeAll(async () => {
  ctx = await createTestContext();
});

beforeEach(async () => {
  // Straight to the table, the way agenda.test.ts does: a test fixture may clear what the
  // product deliberately will not (there is no delete route, and there never will be).
  await ctx.handle.db.execute(sql`DELETE FROM tournament`);
});

afterAll(() => ctx.close());

describe('the day policy matrix — row states × kinds', () => {
  it('an empty day answers nothing, everywhere', async () => {
    expect(await picks()).toEqual({
      readersDay: null,
      dumbDay: null,
      deskDay: null,
      liveBracket: null,
      liveDumbDay: null,
      bracketIsLive: false,
      openDayExists: false,
      deskSetupSlot: null,
      schedulerDay: null,
    });
  });

  it('a draft bracket is the desk\'s work in progress: the desk and the scheduler see it, no reader does', async () => {
    await seedDay({ name: 'draft bracket', kind: 'captains_ball', state: 'draft' });
    expect(await picks()).toEqual({
      readersDay: null,
      dumbDay: null,
      deskDay: 'draft bracket',
      liveBracket: null,
      liveDumbDay: null,
      bracketIsLive: false,
      openDayExists: true,
      deskSetupSlot: 'draft bracket',
      schedulerDay: 'draft bracket',
    });
  });

  it('a live bracket is the day, for everyone', async () => {
    await seedDay({ name: 'live bracket', kind: 'captains_ball', state: 'live' });
    expect(await picks()).toEqual({
      readersDay: 'live bracket',
      dumbDay: null,
      deskDay: 'live bracket',
      liveBracket: 'live bracket',
      liveDumbDay: null,
      bracketIsLive: true,
      openDayExists: true,
      deskSetupSlot: 'live bracket',
      schedulerDay: 'live bracket',
    });
  });

  it('a paused bracket is still the day — the planner reads pausedAt itself and re-plans nothing', async () => {
    await seedDay({ name: 'paused bracket', kind: 'captains_ball', state: 'paused-live' });
    expect(await picks()).toEqual({
      readersDay: 'paused bracket',
      dumbDay: null,
      deskDay: 'paused bracket',
      liveBracket: 'paused bracket',
      liveDumbDay: null,
      bracketIsLive: true,
      openDayExists: true,
      deskSetupSlot: 'paused bracket',
      schedulerDay: 'paused bracket',
    });
  });

  it('a played bracket keeps feeding the readers (its results stand), but nothing is open', async () => {
    await seedDay({ name: 'played bracket', kind: 'captains_ball', state: 'closed-started' });
    expect(await picks()).toEqual({
      readersDay: 'played bracket',
      dumbDay: null,
      deskDay: 'played bracket',
      liveBracket: null,
      liveDumbDay: null,
      bracketIsLive: false,
      openDayExists: false,
      deskSetupSlot: 'played bracket',
      schedulerDay: null,
    });
  });

  it('a discarded bracket (closed without ever starting) shows nobody anything — except the desk, which may look at its own history', async () => {
    await seedDay({ name: 'discarded bracket', kind: 'captains_ball', state: 'discarded' });
    expect(await picks()).toEqual({
      readersDay: null,
      dumbDay: null,
      deskDay: 'discarded bracket',
      liveBracket: null,
      liveDumbDay: null,
      bracketIsLive: false,
      openDayExists: false,
      deskSetupSlot: 'discarded bracket',
      schedulerDay: null,
    });
  });

  it('a draft dumb day is the desk\'s draft first (ADR-336 — whatever its kind), and no reader\'s day', async () => {
    await seedDay({ name: 'draft dumb', kind: 'dumb_courts', state: 'draft' });
    expect(await picks()).toEqual({
      readersDay: null,
      dumbDay: null,
      deskDay: 'draft dumb',
      liveBracket: null,
      liveDumbDay: null,
      bracketIsLive: false,
      openDayExists: false,
      deskSetupSlot: 'draft dumb',
      schedulerDay: null,
    });
  });

  it('a live dumb day is the award day — for its own surfaces and the desk, never for the bracket\'s readers', async () => {
    await seedDay({ name: 'live dumb', kind: 'dumb_courts', state: 'live' });
    expect(await picks()).toEqual({
      readersDay: null,
      dumbDay: 'live dumb',
      deskDay: 'live dumb',
      liveBracket: null,
      liveDumbDay: 'live dumb',
      bracketIsLive: false,
      openDayExists: false,
      deskSetupSlot: 'live dumb',
      schedulerDay: null,
    });
  });

  it('a played dumb day keeps feeding the award ledger\'s readers, exactly as a played bracket does', async () => {
    await seedDay({ name: 'played dumb', kind: 'dumb_courts', state: 'closed-started' });
    expect(await picks()).toEqual({
      readersDay: null,
      dumbDay: 'played dumb',
      deskDay: 'played dumb',
      liveBracket: null,
      liveDumbDay: null,
      bracketIsLive: false,
      openDayExists: false,
      deskSetupSlot: 'played dumb',
      schedulerDay: null,
    });
  });

  it('two drafts: the setup screen works on the newest one whatever its kind (ADR-336), while the console prefers the open bracket (ADR-321)', async () => {
    await seedDay({ name: 'older draft bracket', kind: 'captains_ball', state: 'draft', createdAt: T0 });
    await seedDay({ name: 'newer draft dumb', kind: 'dumb_courts', state: 'draft', createdAt: LATER });
    expect(await picks()).toEqual({
      readersDay: null,
      dumbDay: null,
      deskDay: 'older draft bracket',
      liveBracket: null,
      liveDumbDay: null,
      bracketIsLive: false,
      openDayExists: true,
      deskSetupSlot: 'newer draft dumb',
      schedulerDay: 'older draft bracket',
    });
  });

  it('both kinds closed: the desk takes the most recently closed one whatever it is (a discarded dumb day included), the readers keep their played bracket', async () => {
    await seedDay({ name: 'played bracket', kind: 'captains_ball', state: 'closed-started', startedAt: T0, closedAt: LATER });
    await seedDay({ name: 'discarded dumb', kind: 'dumb_courts', state: 'discarded', closedAt: EVEN_LATER });
    expect(await picks()).toEqual({
      readersDay: 'played bracket',
      dumbDay: null,
      deskDay: 'discarded dumb',
      liveBracket: null,
      liveDumbDay: null,
      bracketIsLive: false,
      openDayExists: false,
      deskSetupSlot: 'discarded dumb',
      schedulerDay: null,
    });
  });

  it('a draft bracket beside a live dumb day: the desk still prefers the open bracket (ADR-321), and the draft stays reachable (ADR-336)', async () => {
    await seedDay({ name: 'draft bracket', kind: 'captains_ball', state: 'draft' });
    await seedDay({ name: 'live dumb', kind: 'dumb_courts', state: 'live' });
    expect(await picks()).toEqual({
      readersDay: null,
      dumbDay: 'live dumb',
      deskDay: 'draft bracket',
      liveBracket: null,
      liveDumbDay: 'live dumb',
      bracketIsLive: false,
      openDayExists: true,
      deskSetupSlot: 'draft bracket',
      schedulerDay: 'draft bracket',
    });
  });
});

describe('ADR-326 — the desk\'s close and the console\'s day are one choice', () => {
  it('a dumb-only day: the console\'s day is the dumb day, and the close acts on dumb courts (the bug was a Close button that closed nothing)', async () => {
    await seedDay({ name: 'live dumb', kind: 'dumb_courts', state: 'live' });
    const day = await deskDay(ctx.handle.db);
    expect(day?.name).toBe('live dumb');
    // The close route's whole kind choice, as one line: openDayExists is the picker.
    const closeKind = (await openDayExists(ctx.handle.db)) ? 'captains_ball' : 'dumb_courts';
    expect(closeKind).toBe('dumb_courts');
    expect(closeKind).toBe(day?.kind);
  });

  it('both kinds live: the console prefers the bracket (ADR-321) and so does the close', async () => {
    await seedDay({ name: 'live bracket', kind: 'captains_ball', state: 'live' });
    await seedDay({ name: 'live dumb', kind: 'dumb_courts', state: 'live' });
    const day = await deskDay(ctx.handle.db);
    expect(day?.name).toBe('live bracket');
    const closeKind = (await openDayExists(ctx.handle.db)) ? 'captains_ball' : 'dumb_courts';
    expect(closeKind).toBe('captains_ball');
    expect(closeKind).toBe(day?.kind);
  });
});
