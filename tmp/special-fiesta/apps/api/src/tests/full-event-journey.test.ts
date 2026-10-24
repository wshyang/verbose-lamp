import type { FinalStandingsView } from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uuidv7 } from 'uuidv7';
import {
  createTeam,
  createTestContext,
  jsonRequest,
  type ActorSession,
  type ParticipantSession,
  type TestContext,
} from './harness.js';
import { activityNameFor, teamNameFor } from './fixtures/names.js';
import { resetCachesForTests } from '../lib/cache.js';

/**
 * One whole event day, start to finish, in the order it actually happens.
 *
 * Every other tournament test in this directory proves one slice and provisions the rest by the
 * shortest route available — `final-standings.test.ts` walks its entire group stage over by
 * superadmin walkover, for instance, because what it is interrogating is the export and not the
 * matches. That is the right call for those tests and it leaves one thing unproven: that the
 * surfaces COMPOSE. A participant signs up, joins a team, earns points at a fringe station, and
 * then that same team plays sixteen real matches and ends up on a rostrum — and the points from
 * the morning and the points from the afternoon have to arrive in the same totals, through
 * caches that are invalidated along the way, without any step being set up by hand.
 *
 * So nothing here is a walkover and nothing is written behind the app's back. Every match is
 * started on a court by a facilitator, scored a rally at a time, and completed by naming the
 * winner the score implies. The protagonist is followed by name from the signup form to the
 * final standings export, because a total is only trustworthy if you can say where it came from.
 *
 * Eight teams, two groups of four (twelve group matches), two semi-finals and a final: fifteen
 * matches. The group results are chosen rather than random — a random day proves nothing twice —
 * and they are chosen so the group tables are decided on points rather than on any tie-break,
 * which is a different test's job (`tournament-standings`).
 */

const TEAM_COUNT = 8;
const FRINGE_POINTS = 15;

let ctx: TestContext;
let superadmin: ActorSession;
let facilitator: ActorSession;
let roundId: string;
/** ADR-009 — the station mints this once and replays it; the server pays only the first. */
const scanUuid = uuidv7();

/** The person this test follows all day. */
let nadia: ParticipantSession;
/** Nadia's team — the one she JOINS rather than captains. */
let nadiaTeamId: string;

const teamIds: string[] = [];
const captains: ParticipantSession[] = [];

beforeAll(async () => {
  ctx = await createTestContext();
  superadmin = await ctx.signInSuperadmin();
  facilitator = await ctx.createFacilitator();
});

afterAll(async () => {
  await ctx.close();
});

async function exportStandings(): Promise<FinalStandingsView> {
  // The export reads through the same caches the live board does, and this test crosses several
  // hours of event time in a few milliseconds. Clearing first is what makes the assertion about
  // the DATA rather than about how recently it happened to be read.
  resetCachesForTests();
  const response = await ctx.app.request('/api/admin/standings/final', {
    headers: superadmin.headers,
  });
  expect(response.status).toBe(200);
  const { standings } = await ctx.json<{ standings: FinalStandingsView }>(response);
  return standings;
}

async function totalFor(nickname: string): Promise<number> {
  const { individuals } = await exportStandings();
  const row = individuals.find((entry) => entry.nickname === nickname);
  expect(row, `${nickname} is missing from the standings`).toBeDefined();
  return row?.totalPoints ?? -1;
}

describe(`a whole event day, played through the app's own surfaces`, () => {
  it('signs up eight captains, each of whom raises a team', async () => {
    for (let index = 0; index < TEAM_COUNT; index += 1) {
      const captain = await ctx.signUpParticipant();
      captains.push(captain);
      teamIds.push(await createTeam(ctx, captain, teamNameFor(ctx.runId)));
    }

    expect(teamIds).toHaveLength(TEAM_COUNT);
    expect(new Set(teamIds).size).toBe(TEAM_COUNT);
    // Everybody starts on nothing. A day that begins with points on the board is a day whose
    // totals cannot be attributed later.
    const { individuals } = await exportStandings();
    expect(individuals).toHaveLength(TEAM_COUNT);
    expect(individuals.every((entry) => entry.totalPoints === 0)).toBe(true);
  });

  it('signs Nadia up and lets her JOIN a team with its code, not create one', async () => {
    nadia = await ctx.signUpParticipant({ nickname: `nadia_${ctx.runId}` });
    nadiaTeamId = teamIds[0] as string;

    // The captain's join code is the only way in (ADR-063) — this is the member's path, which
    // is a different route from the captain's and the one most participants actually walk.
    const detail = await ctx.app.request(`/api/teams/${nadiaTeamId}`, {
      headers: (captains[0] as ParticipantSession).headers,
    });
    const { team } = await ctx.json<{ team: { joinCode: string } }>(detail);
    expect(team.joinCode).not.toBe('');

    const joined = await ctx.app.request(
      '/api/teams/join',
      jsonRequest({ joinCode: team.joinCode }, nadia.headers),
    );
    expect(joined.status, await joined.clone().text()).toBe(201);

    const mine = await ctx.app.request('/api/teams/mine', { headers: nadia.headers });
    const { team: hers } = await ctx.json<{ team: { id: string } | null }>(mine);
    expect(hers?.id).toBe(nadiaTeamId);
  });

  it('gives her points at a fringe station, which is the morning’s only scoreboard', async () => {
    const created = await ctx.app.request(
      '/api/admin/activities',
      jsonRequest(
        {
          activityName: activityNameFor(ctx.runId),
          awardTiers: [{ label: 'Award', points: FRINGE_POINTS }],
        },
        superadmin.headers,
      ),
    );
    expect(created.status, await created.clone().text()).toBe(201);
    const { activity } = await ctx.json<{ activity: { id: string } }>(created);

    const opened = await ctx.app.request(
      `/api/fringe/activities/${activity.id}/rounds`,
      jsonRequest({}, facilitator.headers),
    );
    expect(opened.status, await opened.clone().text()).toBe(201);
    ({
      round: { id: roundId },
    } = await ctx.json<{ round: { id: string } }>(opened));

    const scanned = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        { nickname: nadia.nickname, roundId, tierLabel: 'Award', clientScanUuid: scanUuid, clientTimestamp: new Date().toISOString() },
        facilitator.headers,
      ),
    );
    expect(scanned.status, await scanned.clone().text()).toBe(201);

    expect(await totalFor(nadia.nickname)).toBe(FRINGE_POINTS);
  });

  it('refuses to pay her twice for the same scan, however many times the queue retries', async () => {
    // ADR-009 — the offline queue replays, so the second arrival must be a no-op with a 200,
    // not a second award and not an error the station would show as a failure.
    const replay = await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        // The SAME key the station minted the first time — that is what makes a replay a
        // replay rather than a second award (ADR-009).
        { nickname: nadia.nickname, roundId, tierLabel: 'Award', clientScanUuid: scanUuid, clientTimestamp: new Date().toISOString() },
        facilitator.headers,
      ),
    );
    expect(replay.status).toBe(200);
    const { duplicate } = await ctx.json<{ duplicate: boolean }>(replay);
    expect(duplicate).toBe(true);

    expect(await totalFor(nadia.nickname)).toBe(FRINGE_POINTS);
  });
});
