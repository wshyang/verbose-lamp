import { messages } from '@psd/contracts';
import type { TeamDetailView, TeamSummaryView } from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTeam,
  createTestContext,
  jsonRequest,
  type TestContext,
  withMethod,
} from './harness.js';

/**
 * F8–F13, F17 — the membership verbs a participant actually uses on the day: joining from the
 * browse list, being kicked, unlocking, and reading their own team's match history.
 */

interface ErrorBody {
  error: { message: string; field?: string };
}

describe('F8–F13, F17 — joining, kicking, unlocking and team history', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('F8 — joins straight from the browse list', async () => {
    const captain = await ctx.signUpParticipant();
    const joiner = await ctx.signUpParticipant();
    const teamId = await createTeam(ctx, captain, `Browse ${ctx.runId}`);

    const joined = await ctx.app.request(
      `/api/teams/${teamId}/join`,
      jsonRequest({}, joiner.headers),
    );
    expect(joined.status).toBe(201);
    const { team } = await ctx.json<{ team: TeamDetailView }>(joined);
    expect(team.members.map((member) => member.nickname)).toContain(joiner.nickname);
    expect(team.viewerIsMember).toBe(true);
    expect(team.viewerIsCaptain).toBe(false);
  });

  it('F8/F13 — a locked team refuses a browse join', async () => {
    const captain = await ctx.signUpParticipant();
    const joiner = await ctx.signUpParticipant();
    const teamId = await createTeam(ctx, captain, `Locked ${ctx.runId}`);
    await ctx.app.request(
      `/api/teams/${teamId}/lock`,
      withMethod('PATCH', { isLocked: true }, captain.headers),
    );

    const blocked = await ctx.app.request(
      `/api/teams/${teamId}/join`,
      jsonRequest({}, joiner.headers),
    );
    expect(blocked.status).toBe(400);
    expect((await ctx.json<ErrorBody>(blocked)).error.message).toBe(messages.teamLocked);
  });

  it('F13 — unlocking lets the next joiner in again', async () => {
    const captain = await ctx.signUpParticipant();
    const joiner = await ctx.signUpParticipant();
    const teamId = await createTeam(ctx, captain, `Unlock ${ctx.runId}`);

    await ctx.app.request(
      `/api/teams/${teamId}/lock`,
      withMethod('PATCH', { isLocked: true }, captain.headers),
    );
    const unlocked = await ctx.app.request(
      `/api/teams/${teamId}/lock`,
      withMethod('PATCH', { isLocked: false }, captain.headers),
    );
    expect((await ctx.json<{ team: TeamDetailView }>(unlocked)).team.isLocked).toBe(false);

    const joined = await ctx.app.request(
      `/api/teams/${teamId}/join`,
      jsonRequest({}, joiner.headers),
    );
    expect(joined.status).toBe(201);
  });

  it('F12 — the captain kicks a member, and the roster shrinks', async () => {
    const captain = await ctx.signUpParticipant();
    const member = await ctx.signUpParticipant();
    const teamId = await createTeam(ctx, captain, `Kick ${ctx.runId}`);
    await ctx.app.request(`/api/teams/${teamId}/join`, jsonRequest({}, member.headers));

    const kicked = await ctx.app.request(
      `/api/teams/${teamId}/members/${member.id}`,
      withMethod('DELETE', undefined, captain.headers),
    );
    expect(kicked.status).toBe(200);
    const { team } = await ctx.json<{ team: TeamDetailView }>(kicked);
    expect(team.members.map((item) => item.nickname)).not.toContain(member.nickname);

    // The kicked participant is free to join another team (partial unique index, ADR-011).
    const otherCaptain = await ctx.signUpParticipant();
    const otherTeam = await createTeam(ctx, otherCaptain, `Rebound ${ctx.runId}`);
    const rejoined = await ctx.app.request(
      `/api/teams/${otherTeam}/join`,
      jsonRequest({}, member.headers),
    );
    expect(rejoined.status).toBe(201);
  });

  it('F12 — kicking someone who is not on the team 404s, and the captain cannot kick themselves', async () => {
    const captain = await ctx.signUpParticipant();
    const stranger = await ctx.signUpParticipant();
    const teamId = await createTeam(ctx, captain, `Guard ${ctx.runId}`);

    const notAMember = await ctx.app.request(
      `/api/teams/${teamId}/members/${stranger.id}`,
      withMethod('DELETE', undefined, captain.headers),
    );
    expect(notAMember.status).toBe(404);
    expect((await ctx.json<ErrorBody>(notAMember)).error.message).toBe(messages.memberNotOnTeam);

    const self = await ctx.app.request(
      `/api/teams/${teamId}/members/${captain.id}`,
      withMethod('DELETE', undefined, captain.headers),
    );
    expect(self.status).toBe(400);
  });

  it('F10 — leaving a team you are not on is refused', async () => {
    const captain = await ctx.signUpParticipant();
    const stranger = await ctx.signUpParticipant();
    const teamId = await createTeam(ctx, captain, `Outsider ${ctx.runId}`);

    const response = await ctx.app.request(
      `/api/teams/${teamId}/leave`,
      jsonRequest({}, stranger.headers),
    );
    expect(response.status).toBe(400);
    expect((await ctx.json<ErrorBody>(response)).error.message).toBe(messages.notOnTeam);
  });

  it('F9 — /teams/mine answers null before joining and the team afterwards', async () => {
    const participant = await ctx.signUpParticipant();

    const before = await ctx.app.request('/api/teams/mine', { headers: participant.headers });
    expect(await ctx.json<{ team: TeamDetailView | null }>(before)).toEqual({ team: null });

    const teamId = await createTeam(ctx, participant, `Mine ${ctx.runId}`);
    const after = await ctx.app.request('/api/teams/mine', { headers: participant.headers });
    const { team } = await ctx.json<{ team: TeamDetailView }>(after);
    expect(team.id).toBe(teamId);
    expect(team.joinCode).toHaveLength(6);
  });

  it('F17 — an unknown team id 404s on both detail and history', async () => {
    const participant = await ctx.signUpParticipant();
    const missing = '00000000-0000-7000-8000-000000000008';
    const detail = await ctx.app.request(`/api/teams/${missing}`, {
      headers: participant.headers,
    });
    const history = await ctx.app.request(`/api/teams/${missing}/matches`, {
      headers: participant.headers,
    });
    expect([detail.status, history.status]).toEqual([404, 404]);
  });

  it('F8 — the browse list carries member counts and the captain nickname', async () => {
    const captain = await ctx.signUpParticipant();
    const teamId = await createTeam(ctx, captain, `Listed ${ctx.runId}`);
    const viewer = await ctx.signUpParticipant();

    const response = await ctx.app.request('/api/teams', { headers: viewer.headers });
    const { items } = await ctx.json<{ items: TeamSummaryView[] }>(response);
    const mine = items.find((item) => item.id === teamId);
    expect(mine?.captainNickname).toBe(captain.nickname);
    expect(mine?.memberCount).toBe(1);
  });
});

/**
 * ADR-162 — the participant-facing captaincy handover, and the memoised membership row.
 *
 * `findActiveMembership` is cached for a second and the row it returns carries `isCaptain`, so
 * a transfer has to void it even though nobody joined or left. Easy to miss precisely because
 * "is she on a team" is unchanged by a handover — and `teams.transferCaptaincy` is its own
 * seam, separate from the superadmin path through `announcingAll`, so covering one does not
 * cover the other. Deleting this void failed no test before this one existed.
 *
 * Asserted through the captain-only hide (ADR-155), which reads `isCaptain` off exactly the
 * cached row under test, and with the cache WARMED first — a cache test that reads only after
 * the write is fresh either way and sees nothing.
 */
describe('ADR-162 — a captaincy handover forgets the memoised membership', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('moves the captain-only powers at once, in both directions', async () => {
    const captain = await ctx.signUpParticipant();
    const heir = await ctx.signUpParticipant();
    const teamId = await createTeam(ctx, captain, `Handover ${ctx.runId}`);
    expect(
      (await ctx.app.request(`/api/teams/${teamId}/join`, jsonRequest({}, heir.headers))).status,
    ).toBe(201);

    const said = await ctx.app.request(
      '/api/team-chat/messages',
      jsonRequest({ body: 'a line for the record' }, captain.headers),
    );
    expect(said.status).toBe(201);
    const target = (await ctx.json<{ message: { id: string } }>(said)).message;

    // WARM: the heir is cached as an ordinary member, the captain as the captain.
    expect(
      (
        await ctx.app.request(
          `/api/team-chat/messages/${target.id}/hide`,
          jsonRequest({}, heir.headers),
        )
      ).status,
    ).toBe(403);

    const handed = await ctx.app.request(
      `/api/teams/${teamId}/captain`,
      jsonRequest({ participantId: heir.id }, captain.headers),
    );
    expect(handed.status).toBe(200);

    // The heir may hide now, not a second from now.
    expect(
      (
        await ctx.app.request(
          `/api/team-chat/messages/${target.id}/hide`,
          jsonRequest({}, heir.headers),
        )
      ).status,
    ).toBe(200);

    /*
     * And the other direction, which is the half a one-sided test would miss: the outgoing
     * captain's cached row said `isCaptain: true`, so if the void were missing they would keep
     * the power they just gave away rather than merely the heir lacking it.
     */
    const second = await ctx.app.request(
      '/api/team-chat/messages',
      jsonRequest({ body: 'and another' }, heir.headers),
    );
    expect(second.status).toBe(201);
    const fresh = (await ctx.json<{ message: { id: string } }>(second)).message;
    expect(
      (
        await ctx.app.request(
          `/api/team-chat/messages/${fresh.id}/hide`,
          jsonRequest({}, captain.headers),
        )
      ).status,
    ).toBe(403);
  });
});
