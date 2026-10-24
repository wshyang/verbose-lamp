import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminTournamentConsoleView, MatchView, ParticipantTotalsView } from '@psd/contracts';
import { tournamentAwardRosters, tournamentAwards, tournamentMatchRosters } from '../db/schema/index.js';
import { teamNameFor } from './fixtures/names.js';
import { createTeam, createTestContext, jsonRequest, type ActorSession, type ParticipantSession, type TestContext } from './harness.js';

/**
 * ADR-276 — the points bridge, read off the board. A two-team round robin: Ana's team plays Ben's.
 * Cara joins Ana's team BEFORE kick-off and is paid; Dev joins it AFTER kick-off and is not — the
 * match pays who was on the team when it started. A correction re-pays the same people, a void stops
 * paying them, and a desk award pays the team as it stands at the moment of the award.
 *
 * ADR-337 — WHO is paid is unchanged, but HOW MUCH changed: the award is the team's and each member
 * of the paid roster holds a share of it (points / roster size). So a 30-point win by a two-person
 * team pays 15 and 15, and moves the board 30 — not 60.
 */

let ctx: TestContext;
let desk: ActorSession;
let marshal: ActorSession;
let ana: ParticipantSession;
let ben: ParticipantSession;
let cara: ParticipantSession;
let dev: ParticipantSession;
let anaTeam = '';
let benTeam = '';
let matchId = '';
let courtId = '';

/** Joins with the team's code, read through the captain's session: only a member sees it. */
async function join(member: ParticipantSession, input: { teamId: string; captain: ParticipantSession }): Promise<void> {
  const detail = await ctx.app.request(`/api/teams/${input.teamId}`, { headers: input.captain.headers });
  const { team } = (await detail.json()) as { team: { joinCode: string } };
  const joined = await ctx.app.request('/api/teams/join', jsonRequest({ joinCode: team.joinCode }, member.headers));
  expect(joined.status).toBe(201);
}

async function tournamentPoints(member: ParticipantSession): Promise<number> {
  const response = await ctx.app.request('/api/me/scans', { headers: member.headers });
  return ((await response.json()) as { totals: ParticipantTotalsView }).totals.tournamentPoints;
}

async function deskPost(path: string, body: unknown): Promise<AdminTournamentConsoleView> {
  const response = await ctx.app.request(`/api/admin/tournament${path}`, jsonRequest(body, desk.headers));
  expect(response.status, await response.clone().text()).toBeLessThan(300);
  return (await response.json()) as AdminTournamentConsoleView;
}

beforeAll(async () => {
  ctx = await createTestContext();
  desk = await ctx.signInSuperadmin();
  marshal = await ctx.createFacilitator();
  [ana, ben, cara, dev] = [await ctx.signUpParticipant(), await ctx.signUpParticipant(), await ctx.signUpParticipant(), await ctx.signUpParticipant()];
  anaTeam = await createTeam(ctx, ana, teamNameFor(ctx.runId));
  benTeam = await createTeam(ctx, ben, teamNameFor(ctx.runId));
  await join(cara, { teamId: anaTeam, captain: ana });
  courtId = (await deskPost('/courts', { courtNumber: 1, label: 'Court 1' })).courts[0]?.id ?? '';
  await deskPost('', { name: 'Bridge day', winPoints: 30, drawPoints: 20, lossPoints: 10, teamIds: [anaTeam, benTeam] });
  const started = await deskPost('/activate', { formatId: 'round_robin', matchMinutes: 12, changeoverMinutes: 3, restMinutes: 0 });
  matchId = started.tournament?.matches[0]?.id ?? '';
});

afterAll(async () => {
  await ctx.close();
});

describe('the points bridge — the board pays who was on the team', () => {
  it('freezes both rosters at kick-off', async () => {
    const started = await ctx.app.request('/api/tournament/matches', jsonRequest({ courtId, teamAId: anaTeam, teamBId: benTeam }, marshal.headers));
    expect(started.status).toBe(201);
    expect(((await started.json()) as { match: MatchView }).match.id).toBe(matchId);
    const rosters = await ctx.handle.db.select().from(tournamentMatchRosters).where(eq(tournamentMatchRosters.matchId, matchId));
    const byTeam = new Map(rosters.map((row) => [row.teamId, row.rosterSnapshot.map((entry) => entry.participantId).sort()]));
    expect(byTeam.get(anaTeam)).toEqual([ana.id, cara.id].sort());
    expect(byTeam.get(benTeam)).toEqual([ben.id]);
  });

  it('pays the kick-off roster on completion — and not a member who joined mid-match', async () => {
    await join(dev, { teamId: anaTeam, captain: ana });
    await ctx.app.request(`/api/tournament/matches/${matchId}/score`, jsonRequest({ side: 'a', from: 0, to: 1 }, marshal.headers));
    const done = await ctx.app.request(`/api/tournament/matches/${matchId}/complete`, jsonRequest({ winnerTeamId: anaTeam }, marshal.headers));
    expect(done.status).toBe(200);
    // ADR-337 — 30 across the two who played: 15 each. Ben's team is one person, so the 10 loss
    // is paid whole.
    expect(await tournamentPoints(ana)).toBe(15);
    expect(await tournamentPoints(cara)).toBe(15);
    expect(await tournamentPoints(dev)).toBe(0);
    expect(await tournamentPoints(ben)).toBe(10);
    const awards = await ctx.handle.db.select().from(tournamentAwards).where(eq(tournamentAwards.matchId, matchId));
    const rosters = await ctx.handle.db.select().from(tournamentAwardRosters);
    expect(rosters.map((row) => row.awardId).sort()).toEqual(awards.map((award) => award.id).sort());
  });

  it('re-pays the same people when the desk corrects the result', async () => {
    await deskPost(`/matches/${matchId}/result`, { scoreA: 0, scoreB: 3, reason: 'Scores entered the wrong way round.' });
    expect(await tournamentPoints(ana)).toBe(5);
    expect(await tournamentPoints(cara)).toBe(5);
    expect(await tournamentPoints(dev)).toBe(0);
    expect(await tournamentPoints(ben)).toBe(30);
  });

  it('stops paying anyone for a voided match, and pays again when it is unvoided', async () => {
    await deskPost(`/matches/${matchId}/void`, { isVoided: true, reason: 'Played by the wrong teams.' });
    expect([await tournamentPoints(ana), await tournamentPoints(ben)]).toEqual([0, 0]);
    await deskPost(`/matches/${matchId}/void`, { isVoided: false, reason: 'They were the right teams.' });
    expect([await tournamentPoints(ana), await tournamentPoints(ben)]).toEqual([5, 30]);
  });

  it('pays a desk award to the team as it stands now — Dev included — and stops on void', async () => {
    const awarded = await deskPost('/awards', { teamId: anaTeam, points: 5, reason: 'Fair play.' });
    // The TEAM's tally keeps the face value — the team was awarded 5 — while the three people on it
    // hold a share each.
    expect(awarded.tournament?.entrants.find((entrant) => entrant.teamId === anaTeam)?.awardedPoints).toBe(15);
    expect(await tournamentPoints(dev)).toBeCloseTo(5 / 3, 10);
    expect(await tournamentPoints(ana)).toBeCloseTo(5 + 5 / 3, 10);
    const [manual] = await ctx.handle.db.select().from(tournamentAwards).where(eq(tournamentAwards.kind, 'manual'));
    await deskPost(`/awards/${manual?.id}/void`, { reason: 'Meant for the other team.' });
    expect(await tournamentPoints(dev)).toBe(0);
    expect(await tournamentPoints(ana)).toBe(5);
  });

  it('carries the tournament column onto the cluster board', async () => {
    const response = await ctx.app.request('/api/leaderboard', { headers: ana.headers });
    const board = (await response.json()) as { clusters: { tournamentPoints: number }[] };
    // ADR-337 — the board now gains what the teams were AWARDED. Two live awards remain: the
    // corrected match (10 to Ana's team, 30 to Ben's) and nothing else — the desk's 5 was voided.
    // Under the old replication this read 10 + 10 + 30 = 50 for 40 points of awards.
    const total = board.clusters.reduce((sum, cluster) => sum + cluster.tournamentPoints, 0);
    expect(total).toBeCloseTo(40, 10);
  });
});
