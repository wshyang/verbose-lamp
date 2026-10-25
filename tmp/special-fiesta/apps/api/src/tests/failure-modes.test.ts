import { messages } from '@psd/contracts';
import type { ActivityView, SessionView } from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import type { DatabaseHandle } from '../db/client.js';
import {
  createTeam,
  createTestContext,
  jsonRequest,
  seedFringeReady,
  type TestContext,
  withMethod,
} from './harness.js';

/**
 * fds.md §8.4 — the app never shows a stack trace or a raw SQL error. Every unhappy path
 * answers with the documented copy, and anything unforeseen collapses to one generic 500.
 */
describe('Failure modes — unknown ids, wrong teams and unexpected errors', () => {
  let ctx: TestContext;
  const missingId = '01919000-0000-7000-8000-0000000000ff';

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  async function errorOf(response: Response): Promise<string> {
    const body = await ctx.json<{ error: { message: string } }>(response);
    return body.error.message;
  }

  it('answers an unrouted path with a plain 404 body', async () => {
    const response = await ctx.app.request('/api/does-not-exist');
    expect(response.status).toBe(404);
    expect(await errorOf(response)).toBe('Not found.');
  });

  it('turns an unexpected database failure into one generic 500 with no internals', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const brokenHandle = {
      db: new Proxy(
        {},
        {
          get: () => () => {
            throw new Error('FATAL: password authentication failed for user "psd"');
          },
        },
      ),
      runSql: async () => undefined,
      close: async () => undefined,
    } as unknown as DatabaseHandle;

    const response = await createApp(brokenHandle).request('/api/clusters');

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toBe(JSON.stringify({ error: { message: 'Something went wrong on our side.' } }));
    expect(body).not.toContain('password');
    // ADR-228 — the log gets the report, which keeps the message and drops the rest of the error object.
    expect(consoleError).toHaveBeenCalledWith(
      '[api] unhandled error',
      expect.objectContaining({ name: 'Error', message: expect.stringContaining('password authentication') }),
    );
    consoleError.mockRestore();
  });

  it('F47: staff lookup of an unknown nickname uses the "is this participant signed up" copy', async () => {
    const facilitator = await ctx.createFacilitator();
    const response = await ctx.app.request('/api/staff/participants/by-nickname/Nobody_at_all', {
      headers: facilitator.headers,
    });
    expect(response.status).toBe(404);
    expect(await errorOf(response)).toBe(messages.nicknameNotFound);
  });

  it('F48: resetting the PIN of an unknown participant is a 404, not a silent no-op', async () => {
    const facilitator = await ctx.createFacilitator();
    const response = await ctx.app.request(
      `/api/staff/participants/${missingId}/pin`,
      withMethod('PUT', { pin: '4321' }, facilitator.headers),
    );
    expect(response.status).toBe(404);
    expect(await errorOf(response)).toBe(messages.participantNotFound);
  });

  it('S20: the station switcher lists every activity with its live round inline', async () => {
    const fixture = await seedFringeReady(ctx);
    const response = await ctx.app.request('/api/fringe/activities', {
      headers: fixture.facilitator.headers,
    });
    expect(response.status).toBe(200);
    const { items } = await ctx.json<{ items: ActivityView[] }>(response);
    const mine = items.find((activity) => activity.id === fixture.activityId);
    expect(mine?.currentRound?.id).toBe(fixture.roundId);
  });

  it('S25: an unknown activity or round is a 404, not an empty station', async () => {
    const facilitator = await ctx.createFacilitator();
    const activity = await ctx.app.request(`/api/fringe/activities/${missingId}`, {
      headers: facilitator.headers,
    });
    expect(activity.status).toBe(404);
    expect(await errorOf(activity)).toBe(messages.activityNotFound);

    const round = await ctx.app.request(
      `/api/fringe/rounds/${missingId}/end`,
      jsonRequest({}, facilitator.headers),
    );
    expect(round.status).toBe(404);
    expect(await errorOf(round)).toBe(messages.roundNotFound);
  });

  it('F47: a staff nickname lookup returns the participant it found', async () => {
    const facilitator = await ctx.createFacilitator();
    const participant = await ctx.signUpParticipant();
    const response = await ctx.app.request(
      `/api/staff/participants/by-nickname/${participant.nickname}`,
      { headers: facilitator.headers },
    );
    expect(response.status).toBe(200);
    const body = await ctx.json<{ participant: { id: string } }>(response);
    expect(body.participant.id).toBe(participant.id);
  });

  it('F8: joining with a code nobody owns is a 404', async () => {
    const participant = await ctx.signUpParticipant();
    const response = await ctx.app.request(
      '/api/teams/join',
      jsonRequest({ joinCode: 'ZZZZZZ' }, participant.headers),
    );
    expect(response.status).toBe(404);
    expect(await errorOf(response)).toBe(messages.teamNotFound);
  });

  it('F11: a captain cannot add a nickname that never signed up', async () => {
    const captain = await ctx.signUpParticipant();
    const teamId = await createTeam(ctx, captain, `Addnobody_${ctx.runId}`);
    const response = await ctx.app.request(
      `/api/teams/${teamId}/members`,
      jsonRequest({ nickname: 'Ghost_no_such_person' }, captain.headers),
    );
    expect(response.status).toBe(404);
    expect(await errorOf(response)).toBe(messages.participantNotFound);
  });

  it('F11: a captain cannot poach someone who already has a team', async () => {
    const captain = await ctx.signUpParticipant();
    const teamId = await createTeam(ctx, captain, `Poachers_${ctx.runId}`);
    const otherCaptain = await ctx.signUpParticipant();
    await createTeam(ctx, otherCaptain, `Poached_${ctx.runId}`);
    const response = await ctx.app.request(
      `/api/teams/${teamId}/members`,
      jsonRequest({ nickname: otherCaptain.nickname }, captain.headers),
    );
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toBe(messages.targetAlreadyOnTeam);
  });

  it('F14: captaincy can only pass to a member of the team', async () => {
    const captain = await ctx.signUpParticipant();
    const teamId = await createTeam(ctx, captain, `Handover_${ctx.runId}`);
    const stranger = await ctx.signUpParticipant();
    const response = await ctx.app.request(
      `/api/teams/${teamId}/captain`,
      jsonRequest({ participantId: stranger.id }, captain.headers),
    );
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toBe(messages.captainMustBeMember);
  });

  it('F13: a participant who is not on the team cannot lock it', async () => {
    const captain = await ctx.signUpParticipant();
    const teamId = await createTeam(ctx, captain, `Outsiders_${ctx.runId}`);
    const stranger = await ctx.signUpParticipant();
    const response = await ctx.app.request(
      `/api/teams/${teamId}/lock`,
      withMethod('PATCH', { isLocked: true }, stranger.headers),
    );
    expect(response.status).toBe(403);
    expect(await errorOf(response)).toBe(messages.notCaptain);
  });

  it('S32: staff may read a team page without being a member of it', async () => {
    const captain = await ctx.signUpParticipant();
    const teamId = await createTeam(ctx, captain, `Readonly_${ctx.runId}`);
    const facilitator = await ctx.createFacilitator();
    const response = await ctx.app.request(`/api/teams/${teamId}`, {
      headers: facilitator.headers,
    });
    expect(response.status).toBe(200);
    const body = await ctx.json<{ team: { joinCode: string | null } }>(response);
    expect(body.team.joinCode).toBeNull();
  });

  it('F33/F36/F38: editing an unknown activity, court or facilitator is a 404', async () => {
    const superadmin = await ctx.signInSuperadmin();
    const activity = await ctx.app.request(
      `/api/admin/activities/${missingId}`,
      withMethod(
        'PUT',
        {
          activityName: 'Ghost activity',
          awardTiers: [{ label: 'Award', points: 5 }],
          isActive: true,
        },
        superadmin.headers,
      ),
    );
    expect(activity.status).toBe(404);
    expect(await errorOf(activity)).toBe(messages.activityNotFound);

    const facilitator = await ctx.app.request(
      `/api/admin/facilitators/${missingId}`,
      withMethod('PUT', { defaultStationType: 'none' }, superadmin.headers),
    );
    expect(facilitator.status).toBe(404);
    expect(await errorOf(facilitator)).toBe(messages.facilitatorNotFound);

    const passcode = await ctx.app.request(
      `/api/admin/superadmins/${missingId}/passcode`,
      withMethod('PUT', { passcode: '9876' }, superadmin.headers),
    );
    expect(passcode.status).toBe(404);
  });

  it('F19: a superadmin session reports itself as a superadmin with no station', async () => {
    const superadmin = await ctx.signInSuperadmin();
    const response = await ctx.app.request('/api/auth/session', {
      headers: superadmin.headers,
    });
    expect(response.status).toBe(200);
    const view = await ctx.json<SessionView>(response);
    expect(view).toEqual({
      actorType: 'superadmin',
      staff: { id: superadmin.id, username: 'superadmin', displayLabel: null },
    });
  });
});
