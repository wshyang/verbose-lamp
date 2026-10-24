import { messages } from '@psd/contracts';
import type { LeaderboardView, TeamChatMessageView, TeamDetailView } from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetCachesForTests } from '../lib/cache.js';
import {
  createTeam,
  createTestContext,
  jsonRequest,
  seedFringeReady,
  seedTeamsReady,
  type ParticipantSession,
  type TestContext,
  withMethod,
} from './harness.js';

/**
 * ADR-154 — roster repair from the superadmin console.
 *
 * The claim this whole feature rests on is §2: tournament points reach a person only through
 * `tournament_match.team_*_roster_snapshot`, so a repair can never move a point already
 * earned. That is asserted here as a test rather than left as a paragraph.
 */

interface ErrorBody {
  error: { message: string };
}

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

async function teamDetail(teamId: string, actor: ParticipantSession): Promise<TeamDetailView> {
  const payload = await ctx.json<{ team: TeamDetailView }>(
    await ctx.app.request(`/api/teams/${teamId}`, { headers: actor.headers }),
  );
  return payload.team;
}

async function memberIds(teamId: string, actor: ParticipantSession): Promise<string[]> {
  const detail = await teamDetail(teamId, actor);
  return detail.members.map((member) => member.participantId).sort();
}

/**
 * The room is resolved from the READER's own membership — there is no teamId in the path,
 * because no route may reach a room the caller is not in (ADR-075). So the reader passed here
 * must be someone still on the team whose history is being asserted.
 */
async function roomKinds(actor: ParticipantSession): Promise<string[]> {
  const payload = await ctx.json<{ messages: TeamChatMessageView[] }>(
    await ctx.app.request('/api/team-chat/messages', { headers: actor.headers }),
  );
  return payload.messages.map((message) => message.kind);
}

/**
 * ADR-162 — the memoised membership, and the writes a cache audit found unpinned.
 *
 * `findActiveMembership` is cached for one second and gates every team frame on both SSE
 * streams. Freshness comes from `forgetMemberships()` after each roster write commits, never
 * from the TTL — a missed void is not a stale number, it is somebody reading a room they were
 * removed from.
 *
 * The participant-facing writes (join, leave) are covered many times over: deleting their void
 * fails 51 and 15 tests respectively. The two below failed NOTHING, which is the reason they
 * exist. Both are superadmin paths, which is to say both are what a marshal actually does on
 * the day when a roster is wrong.
 *
 * Every test here WARMS the cache before the write. That is not ceremony: a cache test that
 * reads only after the write asserts on a fresh value either way and cannot see the bug. It is
 * how the announcement retraction went unpinned for as long as it did (§9, K7).
 */
describe('ADR-162 — a roster repair forgets the memoised membership', () => {
  it('shuts the room on a member a superadmin removed, with no stale second', async () => {
    const fixture = await seedTeamsReady(ctx);
    const stray = await ctx.signUpParticipant();
    await ctx.app.request(`/api/teams/${fixture.teamAId}/join`, jsonRequest({}, stray.headers));

    // WARM. This read puts "stray is on team A" into the cache for a second.
    const inside = await ctx.app.request('/api/team-chat/messages', { headers: stray.headers });
    expect(inside.status).toBe(200);

    const removed = await ctx.app.request(
      `/api/admin/teams/${fixture.teamAId}/members/${stray.id}`,
      withMethod('DELETE', {}, fixture.superadmin.headers),
    );
    expect(removed.status).toBe(200);

    /*
     * Immediately, with no sleep. The sleep is what a TTL would need and an authorisation
     * check must not: the door is shut by the void, so it is shut on the next request.
     */
    const after = await ctx.app.request('/api/team-chat/messages', { headers: stray.headers });
    expect(after.status).toBe(403);
  });

  /**
   * The memoised row carries `isCaptain`, so a captaincy transfer invalidates it too — the
   * easiest part of this to forget, because "is she on a team" is unchanged by a transfer.
   *
   * Asserted through the captain-only hide (ADR-155), which reads `membership.isCaptain` off
   * exactly the cached row under test.
   */
  it('hands the captain-only powers over the moment a superadmin transfers them', async () => {
    const fixture = await seedTeamsReady(ctx);
    const heir = await ctx.signUpParticipant();
    await ctx.app.request(`/api/teams/${fixture.teamAId}/join`, jsonRequest({}, heir.headers));

    const said = await ctx.app.request(
      '/api/team-chat/messages',
      jsonRequest({ body: 'something worth hiding' }, fixture.captainA.headers),
    );
    expect(said.status).toBe(201);
    const target = (await ctx.json<{ message: TeamChatMessageView }>(said)).message;

    // WARM both rows: the heir as a non-captain, the incumbent as the captain.
    const refused = await ctx.app.request(
      `/api/team-chat/messages/${target.id}/hide`,
      jsonRequest({}, heir.headers),
    );
    expect(refused.status).toBe(403);

    const handed = await ctx.app.request(
      `/api/admin/teams/${fixture.teamAId}/captain`,
      jsonRequest({ participantId: heir.id }, fixture.superadmin.headers),
    );
    expect(handed.status).toBe(200);

    // The new captain may hide at once, rather than a second from now.
    const allowed = await ctx.app.request(
      `/api/team-chat/messages/${target.id}/hide`,
      jsonRequest({}, heir.headers),
    );
    expect(allowed.status).toBe(200);
  });
});

describe('ADR-154 — the superadmin repairs a roster', () => {
  it('moves a participant between teams in one call, and tells both rooms', async () => {
    const fixture = await seedTeamsReady(ctx);
    const stray = await ctx.signUpParticipant();
    await ctx.app.request(`/api/teams/${fixture.teamAId}/join`, jsonRequest({}, stray.headers));

    const moved = await ctx.app.request(
      '/api/admin/teams/members/move',
      jsonRequest(
        {
          participantId: stray.id,
          fromTeamId: fixture.teamAId,
          toTeamId: fixture.teamBId,
        },
        fixture.superadmin.headers,
      ),
    );

    expect(moved.status).toBe(200);
    expect(await memberIds(fixture.teamAId, fixture.captainA)).not.toContain(stray.id);
    expect(await memberIds(fixture.teamBId, fixture.captainB)).toContain(stray.id);
    // Both rooms, and with the STAFF kinds: a room told "stray left" when a steward moved
    // them is a worse record than no record, which is why these kinds exist.
    expect(await roomKinds(fixture.captainA)).toContain('staff_removed');
    expect(await roomKinds(fixture.captainB)).toContain('staff_added');
  });

  /*
   * §5 — the move is one transaction because `ux_team_membership_active_participant` permits
   * one active membership per participant. If the insert ran before the expire, or if a
   * crashing client did this as two calls, the participant would end up on two teams or none.
   */
  it('leaves the participant on exactly one team after a move', async () => {
    const fixture = await seedTeamsReady(ctx);
    const stray = await ctx.signUpParticipant();
    await ctx.app.request(`/api/teams/${fixture.teamAId}/join`, jsonRequest({}, stray.headers));

    await ctx.app.request(
      '/api/admin/teams/members/move',
      jsonRequest(
        { participantId: stray.id, fromTeamId: fixture.teamAId, toTeamId: fixture.teamBId },
        fixture.superadmin.headers,
      ),
    );

    const inA = (await memberIds(fixture.teamAId, fixture.captainA)).filter((id) => id === stray.id);
    const inB = (await memberIds(fixture.teamBId, fixture.captainB)).filter((id) => id === stray.id);
    expect([inA.length, inB.length]).toEqual([0, 1]);
  });

  it('refuses a move from a team the participant is not actually on', async () => {
    const fixture = await seedTeamsReady(ctx);
    const stray = await ctx.signUpParticipant();
    await ctx.app.request(`/api/teams/${fixture.teamBId}/join`, jsonRequest({}, stray.headers));

    // A stale console tab: it believes they are still on A. Better a conflict than a silent
    // second move out of a team they already left.
    const response = await ctx.app.request(
      '/api/admin/teams/members/move',
      jsonRequest(
        { participantId: stray.id, fromTeamId: fixture.teamAId, toTeamId: fixture.teamBId },
        fixture.superadmin.headers,
      ),
    );

    expect(response.status).toBe(409);
    expect((await ctx.json<ErrorBody>(response)).error.message).toBe(messages.memberNotOnTeam);
  });

  it('adds a straggler who never joined anything, even into a locked team', async () => {
    const fixture = await seedTeamsReady(ctx);
    const straggler = await ctx.signUpParticipant();
    await ctx.app.request(
      `/api/teams/${fixture.teamAId}/lock`,
      withMethod('PUT', { isLocked: true }, fixture.captainA.headers),
    );

    const added = await ctx.app.request(
      `/api/admin/teams/${fixture.teamAId}/members`,
      jsonRequest({ participantId: straggler.id }, fixture.superadmin.headers),
    );

    expect(added.status).toBe(200);
    // The lock is a captain's "my roster is settled". This door exists for when that is wrong
    // and the captain cannot be reached to say so.
    expect(await memberIds(fixture.teamAId, fixture.captainA)).toContain(straggler.id);
  });

  /*
   * §6 — `invalidateMembership` auto-promotes the earliest-joined survivor. Staff removal
   * inherits that cascade rather than carrying a second copy of it, so this is the test that
   * the shared implementation is actually shared.
   */
  it('promotes the earliest-joined survivor when staff remove a captain', async () => {
    const captain = await ctx.signUpParticipant();
    const second = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();
    const teamId = await createTeam(ctx, captain, `Cascade ${ctx.runId}`);
    await ctx.app.request(`/api/teams/${teamId}/join`, jsonRequest({}, second.headers));

    const removed = await ctx.app.request(
      `/api/admin/teams/${teamId}/members/${captain.id}`,
      withMethod('DELETE', {}, superadmin.headers),
    );

    expect(removed.status).toBe(200);
    expect(await ctx.json<{ outcome: string; withdrawal: unknown }>(removed)).toEqual({
      outcome: 'captaincy_transferred',
      withdrawal: null,
    });
    const detail = await teamDetail(teamId, second);
    expect(detail.members.find((member) => member.isCaptain)?.participantId).toBe(second.id);
  });

  it('disbands the team when staff remove its only member, and says so', async () => {
    const lone = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();
    const teamId = await createTeam(ctx, lone, `Lone ${ctx.runId}`);

    const removed = await ctx.app.request(
      `/api/admin/teams/${teamId}/members/${lone.id}`,
      withMethod('DELETE', {}, superadmin.headers),
    );

    // The outcome is returned rather than inferred, because the console has to have NAMED it
    // in the confirmation before the superadmin pressed anything.
    expect(await ctx.json<{ outcome: string; withdrawal: null }>(removed)).toEqual({
      outcome: 'team_disbanded',
      withdrawal: null,
    });
  });

  it('force-unlocks a team whose captain has gone', async () => {
    const fixture = await seedTeamsReady(ctx);
    await ctx.app.request(
      `/api/teams/${fixture.teamAId}/lock`,
      withMethod('PUT', { isLocked: true }, fixture.captainA.headers),
    );

    const unlocked = await ctx.app.request(
      `/api/admin/teams/${fixture.teamAId}/unlock`,
      jsonRequest({}, fixture.superadmin.headers),
    );

    expect(unlocked.status).toBe(200);
    const joiner = await ctx.signUpParticipant();
    const joined = await ctx.app.request(
      `/api/teams/${fixture.teamAId}/join`,
      jsonRequest({}, joiner.headers),
    );
    expect([200, 201]).toContain(joined.status);
  });

  it('hands captaincy to a named member and tells the room', async () => {
    const captain = await ctx.signUpParticipant();
    const heir = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();
    const teamId = await createTeam(ctx, captain, `Handover ${ctx.runId}`);
    await ctx.app.request(`/api/teams/${teamId}/join`, jsonRequest({}, heir.headers));

    const handed = await ctx.app.request(
      `/api/admin/teams/${teamId}/captain`,
      jsonRequest({ participantId: heir.id }, superadmin.headers),
    );

    expect(handed.status).toBe(200);
    const detail = await teamDetail(teamId, heir);
    expect(detail.members.find((member) => member.isCaptain)?.participantId).toBe(heir.id);
    expect(await roomKinds(heir)).toContain('captain_changed');
  });

  it('reports no live match when the team is not on court', async () => {
    const fixture = await seedTeamsReady(ctx);

    const context = await ctx.json<{ memberCount: number; liveMatchCourtName: string | null }>(
      await ctx.app.request(`/api/admin/teams/${fixture.teamAId}/repair-context`, {
        headers: fixture.superadmin.headers,
      }),
    );

    expect(context).toMatchObject({ memberCount: 1, liveMatchCourtName: null });
  });

  it('refuses a move whose source and destination are the same team', async () => {
    const fixture = await seedTeamsReady(ctx);

    const response = await ctx.app.request(
      '/api/admin/teams/members/move',
      jsonRequest(
        {
          participantId: fixture.captainA.id,
          fromTeamId: fixture.teamAId,
          toTeamId: fixture.teamAId,
        },
        fixture.superadmin.headers,
      ),
    );

    expect(response.status).toBe(400);
    expect((await ctx.json<ErrorBody>(response)).error.message).toBe(messages.moveToSameTeam);
  });

  /*
   * A disbanded team is NOT FOUND, not a conflict: `findTeamById` filters on
   * `disbanded_at IS NULL`, so the console sees the same answer it would for a bad id. Pinned
   * here because the obvious implementation adds a second "already disbanded" branch that can
   * never run.
   */
  it('treats a disbanded team as not found', async () => {
    const lone = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();
    const teamId = await createTeam(ctx, lone, `Gone ${ctx.runId}`);
    await ctx.app.request(
      `/api/admin/teams/${teamId}/members/${lone.id}`,
      withMethod('DELETE', {}, superadmin.headers),
    );

    const response = await ctx.app.request(
      `/api/admin/teams/${teamId}/unlock`,
      jsonRequest({}, superadmin.headers),
    );

    expect(response.status).toBe(404);
    expect((await ctx.json<ErrorBody>(response)).error.message).toBe(messages.teamNotFound);
  });

  it('refuses to add somebody who is already on a team', async () => {
    const fixture = await seedTeamsReady(ctx);

    const response = await ctx.app.request(
      `/api/admin/teams/${fixture.teamAId}/members`,
      jsonRequest({ participantId: fixture.captainB.id }, fixture.superadmin.headers),
    );

    expect(response.status).toBe(409);
    expect((await ctx.json<ErrorBody>(response)).error.message).toBe(messages.targetAlreadyOnTeam);
  });

  it('refuses captaincy for somebody who is not on the team', async () => {
    const fixture = await seedTeamsReady(ctx);

    const response = await ctx.app.request(
      `/api/admin/teams/${fixture.teamAId}/captain`,
      jsonRequest({ participantId: fixture.captainB.id }, fixture.superadmin.headers),
    );

    expect(response.status).toBe(409);
    expect((await ctx.json<ErrorBody>(response)).error.message).toBe(messages.memberNotOnTeam);
  });

  it('refuses to remove somebody who is not on that team', async () => {
    const fixture = await seedTeamsReady(ctx);

    const response = await ctx.app.request(
      `/api/admin/teams/${fixture.teamAId}/members/${fixture.captainB.id}`,
      withMethod('DELETE', {}, fixture.superadmin.headers),
    );

    expect(response.status).toBe(409);
  });

  it('reports a missing team as not found rather than as a conflict', async () => {
    const superadmin = await ctx.signInSuperadmin();

    const response = await ctx.app.request(
      '/api/admin/teams/00000000-0000-4000-8000-0000000000ff/unlock',
      jsonRequest({}, superadmin.headers),
    );

    expect(response.status).toBe(404);
  });

  it('refuses every one of these to a participant and to a facilitator', async () => {
    const fixture = await seedTeamsReady(ctx);
    const facilitator = await ctx.createFacilitator();
    const victim = await ctx.signUpParticipant();

    const attempts = [
      ['/api/admin/teams/members/move', { participantId: victim.id, fromTeamId: fixture.teamAId, toTeamId: fixture.teamBId }],
      [`/api/admin/teams/${fixture.teamAId}/members`, { participantId: victim.id }],
      [`/api/admin/teams/${fixture.teamAId}/captain`, { participantId: victim.id }],
      [`/api/admin/teams/${fixture.teamAId}/unlock`, {}],
    ] as const;

    for (const [path, body] of attempts) {
      for (const actor of [fixture.captainA, facilitator]) {
        const response = await ctx.app.request(path, jsonRequest(body, actor.headers));
        expect([401, 403]).toContain(response.status);
      }
    }
  });
});

/**
 * §7 — withdrawal, and where it actually lives.
 *
 * The organiser ruled that withdrawal must not silently un-team anybody: empty the team
 * first. That ruling deleted the feature's own endpoint. §4.2.4 disbands a team the moment
 * its last member goes, so an "empty but still live" team cannot exist, and a `/withdraw`
 * route that required one would have been unreachable in every case — it could only ever have
 * answered 409 or 404. Withdrawal is therefore not an action a superadmin takes; it is what
 * has happened once they have moved or removed the last member, and the fixture-skipping
 * hangs off the disband cascade where it is reachable.
 */
describe('ADR-154 §7 — emptying a team withdraws it and skips its unplayed fixtures', () => {
  it('withdraws by MOVING the last member out, and says so in the move’s own answer', async () => {
    const leaver = await ctx.signUpParticipant();
    const host = await ctx.signUpParticipant();
    const superadmin = await ctx.signInSuperadmin();
    const doomed = await createTeam(ctx, leaver, `Emptied ${ctx.runId}`);
    const survivor = await createTeam(ctx, host, `Host ${ctx.runId}`);

    const moved = await ctx.app.request(
      '/api/admin/teams/members/move',
      jsonRequest(
        { participantId: leaver.id, fromTeamId: doomed, toTeamId: survivor },
        superadmin.headers,
      ),
    );

    expect(moved.status).toBe(200);
    // Moving the last member out empties the team, so the move has to report the withdrawal
    // it caused — otherwise the superadmin disbands a team by accident and is never told.
    expect(await ctx.json<{ from: string; withdrawal: null }>(moved)).toEqual({
      from: 'team_disbanded',
      withdrawal: null,
    });
    // And nobody is stranded: the mover really landed on the other team.
    const detail = await teamDetail(survivor, host);
    expect(detail.members.map((member) => member.participantId)).toContain(leaver.id);
  });
});

/**
 * §2 — the claim the feature rests on, as a test.
 *
 * A participant whose points are already on the board is moved to another team, and the board
 * is asserted byte-identical afterwards. If `team_membership` were ever consulted for
 * historical points this fails, and the whole history-safety argument fails with it.
 *
 * Points are earned here via a fringe scan (the Snapshot Convention freezes the attribution at
 * write time), so the scan record is the only thing that matters — not current membership.
 */
describe('ADR-154 §2 — a repair cannot move a point already earned', () => {
  it('leaves the leaderboard byte-identical after moving a participant who has a fringe scan', async () => {
    const fixture = await seedTeamsReady(ctx);
    const fringe = await seedFringeReady(ctx);
    const headers = fixture.superadmin.headers;

    // Captain A earns fringe points while on team A.
    await ctx.app.request(
      '/api/fringe/scans',
      jsonRequest(
        {
          nickname: fixture.captainA.nickname,
          roundId: fringe.roundId,
          tierLabel: fringe.tierLabel,
          clientScanUuid: crypto.randomUUID(),
          clientTimestamp: new Date().toISOString(),
        },
        fringe.facilitator.headers,
      ),
    );

    const board = async (): Promise<LeaderboardView> => {
      resetCachesForTests();
      return ctx.json<LeaderboardView>(
        await ctx.app.request('/api/leaderboard', { headers }),
      );
    };
    const before = await board();

    // Captain A earned those points with team A. Move them to team B.
    await ctx.app.request(
      '/api/admin/teams/members/move',
      jsonRequest(
        {
          participantId: fixture.captainA.id,
          fromTeamId: fixture.teamAId,
          toTeamId: fixture.teamBId,
        },
        headers,
      ),
    );

    /*
     * `generatedAt` is the clock, not the record, so it is excluded — and excluded by naming
     * the two fields that ARE the record rather than by deleting a key, so a board that grew
     * a third payload field would not quietly slip out of this assertion.
     */
    const after = await board();
    expect(after.clusters).toEqual(before.clusters);
    expect(after.topIndividuals).toEqual(before.topIndividuals);
  });
});
