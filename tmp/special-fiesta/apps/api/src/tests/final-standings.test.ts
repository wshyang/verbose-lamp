import type { FinalStandingsView } from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTeam,
  createTestContext,
  seedTeamsReady,
  type ActorSession,
  type TestContext,
} from './harness.js';
import { teamNameFor } from './fixtures/names.js';
import { resetCachesForTests } from '../lib/cache.js';

/**
 * ADR-161 — the final standings export.
 *
 * Played as one ordered day, because the interesting assertions are all about WHEN: the
 * export must answer at every hour of the event, and the two things it says about itself —
 * whether it is provisional, and whether there is a rostrum yet — have to change at exactly
 * the right moments. A test that only read a finished tournament would prove the easy half.
 */

let ctx: TestContext;
let superadmin: ActorSession;
let facilitator: ActorSession;

beforeAll(async () => {
  ctx = await createTestContext();
  const ready = await seedTeamsReady(ctx);
  superadmin = ready.superadmin;
  facilitator = ready.facilitator;
  // Eight teams total: two from seedTeamsReady plus six more.
  for (let i = 0; i < 6; i += 1) {
    const captain = await ctx.signUpParticipant();
    await createTeam(ctx, captain, teamNameFor(ctx.runId));
  }
});

afterAll(async () => {
  await ctx.close();
});

async function exportStandings(): Promise<FinalStandingsView> {
  resetCachesForTests();
  const response = await ctx.app.request('/api/admin/standings/final', {
    headers: superadmin.headers,
  });
  expect(response.status).toBe(200);
  const { standings } = await ctx.json<{ standings: FinalStandingsView }>(response);
  return standings;
}

describe('ADR-161 — the day leaves the building', () => {
  it('answers before a tournament exists at all, rather than refusing', async () => {
    const standings = await exportStandings();

    // The two halves that do not depend on a tournament are already real.
    expect(standings.clusters).toHaveLength(18);
    expect(standings.individuals.length).toBeGreaterThan(0);
    expect(standings.generatedAt).not.toBe('');

    expect(standings.tournamentStatus).toBeNull();
    expect(standings.teams).toEqual([]);
    expect(standings.podium).toEqual([]);
    // Nothing has finished, so nothing printed now may claim to be final.
    expect(standings.isProvisional).toBe(true);
  });

  /*
   * The whole reason the export reads every participant rather than the board's top ten.
   * Nobody has scored at this point, so the `> 0` filter the board carries would return an
   * empty list — and an empty list is exactly what a record must never silently become.
   */
  it('lists every participant, including everybody still on zero', async () => {
    const { individuals } = await exportStandings();

    expect(individuals).toHaveLength(8);
    expect(individuals.every((entry) => entry.totalPoints === 0)).toBe(true);
    // Ranked all the same, so a sheet printed at 09:00 is still a numbered list.
    expect(individuals.map((entry) => entry.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('is the superadmin’s alone', async () => {
    const asFacilitator = await ctx.app.request('/api/admin/standings/final', {
      headers: facilitator.headers,
    });
    expect(asFacilitator.status).toBe(403);
    const anonymous = await ctx.app.request('/api/admin/standings/final');
    expect(anonymous.status).toBe(401);
  });
});
