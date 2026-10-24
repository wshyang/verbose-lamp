import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { updateActivity } from '../db/entities/activities.js';
import { updateFacilitator } from '../db/entities/accounts.js';
import { findRoundById, endRound, reactivateRound } from '../db/entities/rounds.js';
import { findScanById } from '../db/entities/scans.js';
import { findTeamById } from '../db/entities/teams.js';
import { resetParticipantPin } from '../db/entities/participants.js';
import { firstOrDefault, firstOrNull, firstOrThrow, required, rowsOf } from '../db/rows.js';
import { createTestContext, type TestContext } from './harness.js';

/**
 * `src/db/rows.ts` is the single home for row-array narrowing (ADR-013), so the two defensive
 * branches every repository used to re-spell exist exactly once. This suite covers both arms
 * of both helpers directly, then proves the repositories wired them up the right way round:
 * a write that reports no row is an invariant breach, a read of a vanished id is `null`.
 */
describe('Row narrowing helpers (src/db/rows.ts)', () => {
  it('firstOrThrow returns the first row when the write reported one', () => {
    expect(firstOrThrow([{ id: 'a' }, { id: 'b' }], 'Court')).toEqual({ id: 'a' });
  });

  it('firstOrThrow names the caller when a write reports no row', () => {
    expect(() => firstOrThrow([], 'Court')).toThrowError(
      'Court: database write returned no row',
    );
  });

  it('firstOrNull returns the row when there is one', () => {
    expect(firstOrNull([{ id: 'a' }])).toEqual({ id: 'a' });
  });

  it('firstOrNull returns null for an empty result instead of undefined', () => {
    expect(firstOrNull([])).toBeNull();
  });

  it('firstOrDefault answers an aggregate over an empty table', () => {
    expect(firstOrDefault([{ total: 7 }], { total: 0 })).toEqual({ total: 7 });
    expect(firstOrDefault([], { total: 0 })).toEqual({ total: 0 });
  });

  it('required passes a present value straight through, including falsy ones', () => {
    expect(required(0, 'Count')).toBe(0);
    expect(required('', 'Label')).toBe('');
  });

  it('required names what was missing when the schema invariant is broken', () => {
    expect(() => required(null, 'Session participant')).toThrowError(
      'Session participant: expected a value, got none',
    );
    expect(() => required(undefined, 'Route parameter teamId')).toThrowError(
      'Route parameter teamId: expected a value, got none',
    );
  });

  it('rowsOf accepts both driver shapes for a raw SQL result', () => {
    expect(rowsOf([{ version: '0001' }])).toEqual([{ version: '0001' }]);
    expect(rowsOf({ rows: [{ version: '0001' }] })).toEqual([{ version: '0001' }]);
  });
});

describe('Repositories return null — never throw — when the id matches nothing', () => {
  let ctx: TestContext;
  const missingId = '01919000-0000-7000-8000-0000000000ff';

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('reads of a missing id resolve to null', async () => {
    const db = ctx.handle.db;
    expect(await findTeamById(db, missingId)).toBeNull();
    expect(await findRoundById(db, missingId)).toBeNull();
    expect(await findScanById(db, missingId)).toBeNull();
  });

  it('updates of a missing id resolve to null so the route can answer 404', async () => {
    const db = ctx.handle.db;
    expect(await endRound(db, missingId)).toBeNull();
    expect(await reactivateRound(db, missingId)).toBeNull();
    expect(await resetParticipantPin(db, { participantId: missingId, pin: '1234' })).toBeNull();
    expect(
      await updateActivity(db, {
        activityId: missingId,
        activityName: 'Gone',
        awardTiers: [{ label: 'Award', points: 5 }],
      }),
    ).toBeNull();
    expect(
      await updateFacilitator(db, { facilitatorId: missingId, defaultStationType: 'none' }),
    ).toBeNull();
  });
});
