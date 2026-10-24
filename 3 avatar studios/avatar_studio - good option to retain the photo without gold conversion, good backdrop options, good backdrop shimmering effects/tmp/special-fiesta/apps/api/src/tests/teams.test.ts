import { messages } from '@psd/contracts';
import type { TeamDetailView } from '@psd/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { teamNameFor } from './fixtures/names.js';
import {
  createTeam,
  createTestContext,
  jsonRequest,
  withMethod,
  type ParticipantSession,
  type TestContext,
} from './harness.js';

describe('F6–F14 — team formation and captain actions', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  async function teamOf(captain: ParticipantSession): Promise<TeamDetailView> {
    const response = await ctx.app.request('/api/teams/mine', { headers: captain.headers });
    const body = await ctx.json<{ team: TeamDetailView }>(response);
    return body.team;
  }

  it('F6: creating a team makes the creator captain and mints a join code', async () => {
    const captain = await ctx.signUpParticipant();
    const response = await ctx.app.request(
      '/api/teams',
      jsonRequest({ teamName: teamNameFor(ctx.runId) }, captain.headers),
    );
    expect(response.status).toBe(201);
    const body = await ctx.json<{ team: TeamDetailView }>(response);
    expect(body.team.memberCount).toBe(1);
    expect(body.team.viewerIsCaptain).toBe(true);
    expect(body.team.joinCode).toMatch(/^[A-HJ-KM-NP-Z2-9]{6}$/);
  });

  it('rejects a duplicate team name case-insensitively (§4.2.10)', async () => {
    const first = await ctx.signUpParticipant();
    const second = await ctx.signUpParticipant();
    const name = teamNameFor(ctx.runId);
    await createTeam(ctx, first, name);
    const response = await ctx.app.request(
      '/api/teams',
      jsonRequest({ teamName: name.toUpperCase() }, second.headers),
    );
    expect(response.status).toBe(409);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.teamNameInvalid);
  });

  it('§4.2.1: a participant may hold only one team at a time', async () => {
    const captain = await ctx.signUpParticipant();
    await createTeam(ctx, captain, teamNameFor(ctx.runId));
    const response = await ctx.app.request(
      '/api/teams',
      jsonRequest({ teamName: teamNameFor(ctx.runId) }, captain.headers),
    );
    expect(response.status).toBe(400);
    const body = await ctx.json<{ error: { message: string } }>(response);
    expect(body.error.message).toBe(messages.alreadyOnTeam);
  });

  it('F7: joins by code, and F13 lock blocks the next joiner', async () => {
    const captain = await ctx.signUpParticipant();
    const joiner = await ctx.signUpParticipant();
    const blocked = await ctx.signUpParticipant();
    await createTeam(ctx, captain, teamNameFor(ctx.runId));
    const team = await teamOf(captain);

    const joined = await ctx.app.request(
      '/api/teams/join',
      jsonRequest({ joinCode: team.joinCode }, joiner.headers),
    );
    expect(joined.status).toBe(201);

    await ctx.app.request(
      `/api/teams/${team.id}/lock`,
      withMethod('PATCH', { isLocked: true }, captain.headers),
    );
    const rejected = await ctx.app.request(
      '/api/teams/join',
      jsonRequest({ joinCode: team.joinCode }, blocked.headers),
    );
    expect(rejected.status).toBe(400);
    const body = await ctx.json<{ error: { message: string } }>(rejected);
    expect(body.error.message).toBe(messages.teamLocked);
  });

  it('F11: the captain can add a member by nickname even while locked', async () => {
    const captain = await ctx.signUpParticipant();
    const invited = await ctx.signUpParticipant();
    await createTeam(ctx, captain, teamNameFor(ctx.runId));
    const team = await teamOf(captain);
    await ctx.app.request(
      `/api/teams/${team.id}/lock`,
      withMethod('PATCH', { isLocked: true }, captain.headers),
    );
    const response = await ctx.app.request(
      `/api/teams/${team.id}/members`,
      jsonRequest({ nickname: invited.nickname }, captain.headers),
    );
    expect(response.status).toBe(201);
    const body = await ctx.json<{ team: TeamDetailView }>(response);
    expect(body.team.memberCount).toBe(2);
  });

  it('NEGATIVE session scoping: a non-captain member cannot add, kick, lock or transfer', async () => {
    const captain = await ctx.signUpParticipant();
    const member = await ctx.signUpParticipant();
    const outsider = await ctx.signUpParticipant();
    await createTeam(ctx, captain, teamNameFor(ctx.runId));
    const team = await teamOf(captain);
    await ctx.app.request(
      `/api/teams/${team.id}/members`,
      jsonRequest({ nickname: member.nickname }, captain.headers),
    );

    const add = await ctx.app.request(
      `/api/teams/${team.id}/members`,
      jsonRequest({ nickname: outsider.nickname }, member.headers),
    );
    const kick = await ctx.app.request(
      `/api/teams/${team.id}/members/${captain.id}`,
      withMethod('DELETE', undefined, member.headers),
    );
    const lock = await ctx.app.request(
      `/api/teams/${team.id}/lock`,
      withMethod('PATCH', { isLocked: true }, member.headers),
    );
    const transfer = await ctx.app.request(
      `/api/teams/${team.id}/captain`,
      jsonRequest({ participantId: member.id }, member.headers),
    );
    expect([add.status, kick.status, lock.status, transfer.status]).toEqual([403, 403, 403, 403]);
  });

  it('§4.2.3: captain leaving auto-transfers captaincy to the earliest joiner', async () => {
    const captain = await ctx.signUpParticipant();
    const firstJoiner = await ctx.signUpParticipant();
    const secondJoiner = await ctx.signUpParticipant();
    await createTeam(ctx, captain, teamNameFor(ctx.runId));
    const team = await teamOf(captain);
    await ctx.app.request(
      '/api/teams/join',
      jsonRequest({ joinCode: team.joinCode }, firstJoiner.headers),
    );
    await ctx.app.request(
      '/api/teams/join',
      jsonRequest({ joinCode: team.joinCode }, secondJoiner.headers),
    );

    const left = await ctx.app.request(
      `/api/teams/${team.id}/leave`,
      jsonRequest({}, captain.headers),
    );
    const outcome = await ctx.json<{ outcome: string }>(left);
    expect(outcome.outcome).toBe('captaincy_transferred');
    const after = await teamOf(firstJoiner);
    expect(after.viewerIsCaptain).toBe(true);
    expect(after.memberCount).toBe(2);
  });

  it('§4.2.4: the last member leaving disbands the team and frees the name', async () => {
    const captain = await ctx.signUpParticipant();
    const name = teamNameFor(ctx.runId);
    await createTeam(ctx, captain, name);
    const team = await teamOf(captain);
    const left = await ctx.app.request(
      `/api/teams/${team.id}/leave`,
      jsonRequest({}, captain.headers),
    );
    const outcome = await ctx.json<{ outcome: string }>(left);
    expect(outcome.outcome).toBe('team_disbanded');

    const browse = await ctx.app.request('/api/teams', { headers: captain.headers });
    const list = await ctx.json<{ items: { id: string }[] }>(browse);
    expect(list.items.some((item) => item.id === team.id)).toBe(false);

    // Soft delete means the participant can immediately form a new team with the same name.
    const again = await ctx.app.request('/api/teams', jsonRequest({ teamName: name }, captain.headers));
    expect(again.status).toBe(201);
  });

  it('F14: captaincy transfer moves the flag to exactly one member', async () => {
    const captain = await ctx.signUpParticipant();
    const successor = await ctx.signUpParticipant();
    await createTeam(ctx, captain, teamNameFor(ctx.runId));
    const team = await teamOf(captain);
    await ctx.app.request(
      '/api/teams/join',
      jsonRequest({ joinCode: team.joinCode }, successor.headers),
    );
    const response = await ctx.app.request(
      `/api/teams/${team.id}/captain`,
      jsonRequest({ participantId: successor.id }, captain.headers),
    );
    expect(response.status).toBe(200);
    const body = await ctx.json<{ team: TeamDetailView }>(response);
    const captains = body.team.members.filter((member) => member.isCaptain);
    expect(captains).toHaveLength(1);
    expect(captains[0]?.participantId).toBe(successor.id);
  });

  it('S9/S10: browse hides the join code from non-members', async () => {
    const captain = await ctx.signUpParticipant();
    const stranger = await ctx.signUpParticipant();
    await createTeam(ctx, captain, teamNameFor(ctx.runId));
    const team = await teamOf(captain);
    const response = await ctx.app.request(`/api/teams/${team.id}`, { headers: stranger.headers });
    const body = await ctx.json<{ team: TeamDetailView }>(response);
    expect(body.team.joinCode).toBeNull();
    expect(body.team.captainNickname).toBe(captain.nickname);
  });
});
