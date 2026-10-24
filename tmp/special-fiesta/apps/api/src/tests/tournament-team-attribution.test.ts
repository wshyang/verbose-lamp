import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminTournamentConsoleView, ParticipantTotalsView } from '@psd/contracts';
import { CLUSTER_CODES } from '@psd/contracts';
import { teamNameFor } from './fixtures/names.js';
import {
  createTeam,
  createTestContext,
  jsonRequest,
  type ActorSession,
  type ParticipantSession,
  type TestContext,
} from './harness.js';

/**
 * ADR-337 — team-level attribution, read off the board.
 *
 * A tournament award belongs to the TEAM and the team is paid it once. Each member of the paid roster
 * holds one share of it (`points / roster size`), so a cluster is credited its own fraction of the
 * team's award and no more. The old reading replicated the award to every member, which made a team's
 * contribution to its cluster scale with how many people happened to be on it: a 30-point win by a
 * five-person team moved the board 150, and the same win by a team one player short moved it 120.
 * A team that loses a player is not a weaker team.
 *
 * The numbers here are the point of the file, so every assertion is stated as "what the board gained".
 */

let ctx: TestContext;
let desk: ActorSession;

const [CLUSTER_A, CLUSTER_B] = [CLUSTER_CODES[0], CLUSTER_CODES[1]];

async function deskPost(path: string, body: unknown): Promise<AdminTournamentConsoleView> {
  const response = await ctx.app.request(`/api/admin/tournament${path}`, jsonRequest(body, desk.headers));
  expect(response.status, await response.clone().text()).toBeLessThan(300);
  return (await response.json()) as AdminTournamentConsoleView;
}

async function join(members: readonly ParticipantSession[], input: { teamId: string; captain: ParticipantSession }): Promise<void> {
  const detail = await ctx.app.request(`/api/teams/${input.teamId}`, { headers: input.captain.headers });
  const { team } = (await detail.json()) as { team: { joinCode: string } };
  for (const member of members) {
    const joined = await ctx.app.request('/api/teams/join', jsonRequest({ joinCode: team.joinCode }, member.headers));
    expect(joined.status).toBe(201);
  }
}

/** Every cluster's tournament column, by code — the board as the room reads it. */
async function board(viewer: ParticipantSession): Promise<Map<string, number>> {
  const response = await ctx.app.request('/api/leaderboard', { headers: viewer.headers });
  const body = (await response.json()) as { clusters: { clusterCode: string; tournamentPoints: number }[] };
  return new Map(body.clusters.map((cluster) => [cluster.clusterCode, cluster.tournamentPoints]));
}

async function gain(run: () => Promise<unknown>, viewer: ParticipantSession): Promise<Map<string, number>> {
  const before = await board(viewer);
  await run();
  const after = await board(viewer);
  return new Map([...after].map(([code, points]) => [code, points - (before.get(code) ?? 0)]));
}

async function tournamentPoints(member: ParticipantSession): Promise<number> {
  const response = await ctx.app.request('/api/me/scans', { headers: member.headers });
  return ((await response.json()) as { totals: ParticipantTotalsView }).totals.tournamentPoints;
}

/** A team of `size` people: the first is the captain, the rest join. All from `cluster`. */
async function team(cluster: string, size: number): Promise<{ teamId: string; members: ParticipantSession[] }> {
  const members: ParticipantSession[] = [];
  for (let index = 0; index < size; index += 1) members.push(await ctx.signUpParticipant({ clusterCode: cluster }));
  const [captain, ...rest] = members as [ParticipantSession, ...ParticipantSession[]];
  const teamId = await createTeam(ctx, captain, teamNameFor(ctx.runId));
  await join(rest, { teamId, captain });
  return { teamId, members };
}

let pair2: { teamId: string; members: ParticipantSession[] };
let mixed3: { teamId: string; members: ParticipantSession[] };
let seven: { teamId: string; members: ParticipantSession[] };
let soloB: { teamId: string; members: ParticipantSession[] };
let fiveA: { teamId: string; members: ParticipantSession[] };
let pairForTally: { teamId: string; members: ParticipantSession[] };

beforeAll(async () => {
  ctx = await createTestContext();
  desk = await ctx.signInSuperadmin();
  // A dumb day is enough: it awards teams without building fixtures, which is exactly the shape
  // this rule has to hold for (ADR-321 pays teams constantly). Every team is entered before the
  // tournament is created — the desk award route refuses a team that is not an entrant.
  pair2 = await team(CLUSTER_A, 2);
  seven = await team(CLUSTER_A, 7);
  fiveA = await team(CLUSTER_A, 5);
  pairForTally = await team(CLUSTER_A, 2);
  soloB = await team(CLUSTER_B, 1);
  // A deliberately mixed team: two from A, one from B.
  const captain = await ctx.signUpParticipant({ clusterCode: CLUSTER_A });
  const mate = await ctx.signUpParticipant({ clusterCode: CLUSTER_A });
  const other = await ctx.signUpParticipant({ clusterCode: CLUSTER_B });
  const mixedTeamId = await createTeam(ctx, captain, teamNameFor(ctx.runId));
  await join([mate, other], { teamId: mixedTeamId, captain });
  mixed3 = { teamId: mixedTeamId, members: [captain, mate, other] };

  await deskPost('', {
    name: 'Attribution day',
    kind: 'dumb_courts',
    winPoints: 0,
    drawPoints: 0,
    lossPoints: 0,
    teamIds: [pair2.teamId, seven.teamId, fiveA.teamId, pairForTally.teamId, soloB.teamId, mixed3.teamId],
    tiers: [{ label: 'Gold', points: 100 }],
  });
  await deskPost('/activate', { dumb: true, matchMinutes: 12, changeoverMinutes: 3, restMinutes: 0 });
});

afterAll(async () => {
  await ctx.close();
});

describe('ADR-337 — a team award is worth the team’s points, once', () => {
  it('pays a two-person team 50 each and moves the board 100, not 200', async () => {
    const viewer = pair2.members[0] as ParticipantSession;
    const gained = await gain(
      () => deskPost('/awards', { teamId: pair2.teamId, points: 100, reason: 'A clean sweep.' }),
      viewer,
    );
    // 100 across two members: 50 each, and the cluster gains exactly the award.
    expect(gained.get(CLUSTER_A)).toBeCloseTo(100, 9);
    expect(await tournamentPoints(pair2.members[0] as ParticipantSession)).toBeCloseTo(50, 9);
    expect(await tournamentPoints(pair2.members[1] as ParticipantSession)).toBeCloseTo(50, 9);
  });

  it('splits a mixed-cluster team proportionally, and the parts sum to the award', async () => {
    // Three people, two from A and one from B: a 100-point award is 66.66… to A and 33.33… to B.
    const viewer = mixed3.members[0] as ParticipantSession;
    const before = await board(viewer);
    await deskPost('/awards', { teamId: mixed3.teamId, points: 100, reason: 'Split down the middle.' });
    const after = await board(viewer);

    const gainedA = after.get(CLUSTER_A)! - before.get(CLUSTER_A)!;
    const gainedB = after.get(CLUSTER_B)! - before.get(CLUSTER_B)!;
    // Two of three shares and one of three. The board carries the value collapsed to six decimals
    // (ADR-337's ordering rule), so 66.666667 rather than 66.66666666666667 — that is the wire's
    // precision, not a rounding of the score.
    expect(gainedA).toBeCloseTo(200 / 3, 5);
    expect(gainedB).toBeCloseTo(100 / 3, 5);
    expect(gainedA).toBeCloseTo(66.666667, 6);
    expect(gainedB).toBeCloseTo(33.333333, 6);
    // The team's award is preserved: the clusters gain the 100, to the wire's precision.
    expect(gainedA + gainedB).toBeCloseTo(100, 5);
  });

  it('holds a team of seven to the award: 100 / 7 each, 100 on the board', async () => {
    const viewer = seven.members[0] as ParticipantSession;
    const gained = await gain(
      () => deskPost('/awards', { teamId: seven.teamId, points: 100, reason: 'A full squad.' }),
      viewer,
    );
    expect(gained.get(CLUSTER_A)).toBeCloseTo(100, 9);
    // Seven members on 14.285714… — the sum is the drift case the ordering collapse exists for.
    for (const member of seven.members) expect(await tournamentPoints(member)).toBeCloseTo(100 / 7, 9);
  });

  it('earns a cluster the same for the same award whether the team is one person or five', async () => {
    const soloGain = await gain(
      () => deskPost('/awards', { teamId: soloB.teamId, points: 60, reason: 'One on their own.' }),
      soloB.members[0] as ParticipantSession,
    );
    const fiveGain = await gain(
      () => deskPost('/awards', { teamId: fiveA.teamId, points: 60, reason: 'Five of them.' }),
      fiveA.members[0] as ParticipantSession,
    );

    // The defect this ADR removes: before, B gained 60 and A gained 300 for the same 60-point award.
    expect(soloGain.get(CLUSTER_B)).toBeCloseTo(60, 9);
    expect(fiveGain.get(CLUSTER_A)).toBeCloseTo(60, 9);
  });

  it('keeps the team’s own tally at the face value', async () => {
    const view = await deskPost('/awards', { teamId: pairForTally.teamId, points: 30, reason: 'Face value check.' });
    const entrant = view.tournament?.entrants.find((candidate) => candidate.teamId === pairForTally.teamId);
    expect(entrant?.awardedPoints).toBe(30);
    // …while each member holds half.
    expect(await tournamentPoints(pairForTally.members[0] as ParticipantSession)).toBeCloseTo(15, 9);
    expect(await tournamentPoints(pairForTally.members[1] as ParticipantSession)).toBeCloseTo(15, 9);
  });
});
