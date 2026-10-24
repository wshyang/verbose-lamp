import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminTournamentConsoleView, DumbCourtView, ParticipantTotalsView } from '@psd/contracts';
import { CLUSTER_CODES } from '@psd/contracts';
import { tournamentAwards, tournamentDumbAwards, tournamentMatches, tournamentSchedulers } from '../db/schema/index.js';
import { teamNameFor } from './fixtures/names.js';
import { createTeam, createTestContext, jsonRequest, type ActorSession, type ParticipantSession, type TestContext } from './harness.js';

/**
 * ADR-321 — dumb courts, end to end. A dumb tournament starts with no fixtures at all; a court
 * master awards a configured tier to a team and the points reach the team as it stands, sliced
 * across its roster (ADR-337) — so a mixed-cluster team's award is split by cluster, not
 * replicated; a double-tap replays instead of double-paying;
 * Results shows award lines only and Line-ups says there are none; the awarding court master can
 * take an award back inside the undo window, and nobody else can.
 */

let ctx: TestContext;
let desk: ActorSession;
let marshal: ActorSession;
let otherMarshal: ActorSession;
let ana: ParticipantSession;
let cara: ParticipantSession;
let anaTeam = '';
let benTeam = '';
let courtId = '';

async function deskPost(path: string, body: unknown): Promise<{ status: number; body: AdminTournamentConsoleView }> {
  const response = await ctx.app.request(`/api/admin/tournament${path}`, jsonRequest(body, desk.headers));
  return { status: response.status, body: (await response.json()) as AdminTournamentConsoleView };
}

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

async function dumbCourt(session: ActorSession): Promise<{ status: number; body: DumbCourtView }> {
  const response = await ctx.app.request(`/api/tournament/dumb/courts/${courtId}`, { headers: session.headers });
  return { status: response.status, body: (await response.json()) as DumbCourtView };
}

const TIERS = [
  { label: 'Played', points: 2 },
  { label: 'Gold', points: 10 },
];

beforeAll(async () => {
  ctx = await createTestContext();
  desk = await ctx.signInSuperadmin();
  marshal = await ctx.createFacilitator();
  otherMarshal = await ctx.createFacilitator();
  // A deliberately mixed-cluster team: the captain from one cluster, a member from another.
  ana = await ctx.signUpParticipant({ clusterCode: CLUSTER_CODES[0] });
  cara = await ctx.signUpParticipant({ clusterCode: CLUSTER_CODES[1] });
  const ben = await ctx.signUpParticipant();
  anaTeam = await createTeam(ctx, ana, teamNameFor(ctx.runId));
  benTeam = await createTeam(ctx, ben, teamNameFor(ctx.runId));
  await join(cara, { teamId: anaTeam, captain: ana });
  courtId = (await deskPost('/courts', { courtNumber: 1, label: 'Court 1' })).body.courts[0]?.id ?? '';
});

afterAll(async () => {
  await ctx.close();
});

describe('ADR-321 — dumb courts', () => {
  it('refuses a dumb draft with no tiers, then saves the tiers on the draft', async () => {
    const bare = await deskPost('', { name: 'Dumb day', kind: 'dumb_courts', winPoints: 0, drawPoints: 0, lossPoints: 0, teamIds: [anaTeam, benTeam] });
    expect(bare.status).toBe(400);
    const created = await deskPost('', { name: 'Dumb day', kind: 'dumb_courts', winPoints: 0, drawPoints: 0, lossPoints: 0, teamIds: [anaTeam, benTeam], tiers: TIERS });
    expect(created.status).toBe(201);
    expect(created.body.tournament?.kind).toBe('dumb_courts');
    expect(created.body.tournament?.dumbTiers).toEqual(TIERS);
  });

  it('starts with no format and builds nothing: no stages, no matches, no scheduler', async () => {
    const refused = await deskPost('/activate', { formatId: 'round_robin', matchMinutes: 12, changeoverMinutes: 3, restMinutes: 0 });
    expect(refused.status).toBe(400);
    const started = await deskPost('/activate', { dumb: true, matchMinutes: 12, changeoverMinutes: 3, restMinutes: 0 });
    expect(started.status).toBe(200);
    expect(started.body.tournament?.status).toBe('live');
    expect(started.body.tournament?.stages).toEqual([]);
    expect(started.body.tournament?.matches).toEqual([]);
    expect(started.body.tournament?.scheduler).toBeNull();
    expect(await ctx.handle.db.select().from(tournamentMatches)).toEqual([]);
    expect(await ctx.handle.db.select().from(tournamentSchedulers)).toEqual([]);
  });

  it('serves the court page: tiers, teams, and no line-ups anywhere', async () => {
    const status = await ctx.app.request('/api/tournament/dumb/status', { headers: marshal.headers });
    expect(((await status.json()) as { active: boolean }).active).toBe(true);
    const view = await dumbCourt(marshal);
    expect(view.status).toBe(200);
    expect(view.body.tiers).toEqual(TIERS);
    expect(view.body.teams.map((team) => team.teamName)).toHaveLength(2);
    expect(view.body.teams.find((team) => team.teamId === anaTeam)?.memberCount).toBe(2);
    const lineups = await ctx.app.request('/api/tournament/lineups', { headers: ana.headers });
    const lineupsBody = (await lineups.json()) as { mode: string; items: unknown[] };
    expect(lineupsBody.mode).toBe('dumb');
    expect(lineupsBody.items).toEqual([]);
    const courtLineups = await ctx.app.request(`/api/tournament/courts/${courtId}/lineups`, { headers: marshal.headers });
    expect(((await courtLineups.json()) as { items: unknown[] }).items).toEqual([]);
  });

  it('awards a tier to the mixed-cluster team as it stands, and a double-tap pays once', async () => {
    const clientAwardUuid = randomUUID();
    const award = { teamId: anaTeam, tierLabel: 'Gold', clientAwardUuid };
    const first = await ctx.app.request(`/api/tournament/dumb/courts/${courtId}/awards`, jsonRequest(award, marshal.headers));
    expect(first.status).toBe(201);
    const replay = await ctx.app.request(`/api/tournament/dumb/courts/${courtId}/awards`, jsonRequest(award, marshal.headers));
    expect(replay.status).toBe(200);
    const awards = await ctx.handle.db.select().from(tournamentAwards);
    expect(awards).toHaveLength(1);
    expect(awards[0]?.points).toBe(10);
    const metas = await ctx.handle.db.select().from(tournamentDumbAwards);
    expect(metas).toHaveLength(1);
    expect(metas[0]?.tierLabel).toBe('Gold');
    // ADR-337 — the award is the team's and the team is paid it once: two members hold 5 each, so
    // the two clusters the team spans gain 5 and 5. The award adding up to 20 on the board was the
    // defect this rule removes.
    expect(await tournamentPoints(ana)).toBe(5);
    expect(await tournamentPoints(cara)).toBe(5);
    const board = await ctx.app.request('/api/leaderboard', { headers: ana.headers });
    const clusters = ((await board.json()) as { clusters: { clusterCode: string; tournamentPoints: number }[] }).clusters;
    expect(clusters.find((cluster) => cluster.clusterCode === CLUSTER_CODES[0])?.tournamentPoints).toBe(5);
    expect(clusters.find((cluster) => cluster.clusterCode === CLUSTER_CODES[1])?.tournamentPoints).toBe(5);
    // The team's own ledger row and Results line keep the face value: the TEAM earned 10.
    expect(awards[0]?.points).toBe(10);
  });

  it('shows Results as award lines only — "Team XXX is awarded XXX points!"', async () => {
    const feed = await ctx.app.request('/api/tournament/matches/feed', { headers: ana.headers });
    const body = (await feed.json()) as { mode: string; items: unknown[]; awards: { teamName: string; points: number; isVoided: boolean }[] };
    expect(body.mode).toBe('dumb');
    expect(body.items).toEqual([]);
    expect(body.awards).toHaveLength(1);
    expect(body.awards[0]?.points).toBe(10);
    expect(body.awards[0]?.isVoided).toBe(false);
    expect(body.awards[0]?.teamName.length).toBeGreaterThan(0);
  });

  it('lets the desk void a dumb award after the court window, with a reason', async () => {
    const clientAwardUuid = randomUUID();
    const created = await ctx.app.request(
      `/api/tournament/dumb/courts/${courtId}/awards`,
      jsonRequest({ teamId: benTeam, tierLabel: 'Played', clientAwardUuid }, marshal.headers),
    );
    expect(created.status).toBe(201);
    const award = (await ctx.handle.db.select().from(tournamentAwards)).find((row) => row.points === 2);
    const voided = await ctx.app.request(
      `/api/admin/tournament/awards/${award?.id}/void`,
      jsonRequest({ reason: 'Wrong court entirely.' }, desk.headers),
    );
    expect(voided.status).toBe(200);
    const feed = await ctx.app.request('/api/tournament/matches/feed', { headers: ana.headers });
    const body = (await feed.json()) as { awards: { points: number; isVoided: boolean }[] };
    expect(body.awards.find((entry) => entry.points === 2)?.isVoided).toBe(true);
  });

  it('refuses an unknown tier and lets only the awarding court master undo, inside the window', async () => {
    const badTier = await ctx.app.request(
      `/api/tournament/dumb/courts/${courtId}/awards`,
      jsonRequest({ teamId: benTeam, tierLabel: 'Platinum', clientAwardUuid: randomUUID() }, marshal.headers),
    );
    expect(badTier.status).toBe(400);
    const [award] = await ctx.handle.db.select().from(tournamentAwards);
    const byOther = await ctx.app.request(`/api/tournament/dumb/awards/${award?.id}/void`, jsonRequest({}, otherMarshal.headers));
    expect(byOther.status).toBe(400);
    const undone = await ctx.app.request(`/api/tournament/dumb/awards/${award?.id}/void`, jsonRequest({}, marshal.headers));
    expect(undone.status).toBe(200);
    expect(await tournamentPoints(ana)).toBe(0);
    expect(await tournamentPoints(cara)).toBe(0);
    const feed = await ctx.app.request('/api/tournament/matches/feed', { headers: ana.headers });
    const body = (await feed.json()) as { awards: { isVoided: boolean }[] };
    expect(body.awards[0]?.isVoided).toBe(true);
  });
});
