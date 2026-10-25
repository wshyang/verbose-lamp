import {
  addMemberRequestSchema,
  createTeamRequestSchema,
  joinTeamByCodeRequestSchema,
  messages,
  setLockRequestSchema,
  transferCaptaincyRequestSchema,
} from '@psd/contracts';
import { Hono } from 'hono';
import {
  addTeamMember,
  createTeamWithCaptain,
  findActiveMembership,
  findParticipantByNickname,
  findTeamByJoinCode,
  findTeamByName,
  invalidateMembership,
  listTeams,
  lockTeam,
  transferCaptaincy,
  unlockTeam,
} from '../db/entities/index.js';
import { badRequest, conflict, notFound, readBody, requireParam } from '../lib/http.js';
import {
  requireAnyActor,
  requireParticipant,
  type AppBindings,
  type AppContext,
} from '../lib/session.js';
import { teamSummaryView } from '../views/teams.js';
import { matchView } from '../views/tournament.js';
import { matchesOfTeam, readDay } from '../routes-tournament/support.js';
import { assertNoExistingTeam, assertTargetHasNoTeam, loadCaptainContext, loadTeam } from './guards.js';
import { readTeamDetail } from './detail.js';

/** F6–F14, F17 — team formation and captain management (fds.md §5.1 S7–S17). */
export function teamRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();
  registerTeamReads(routes);
  registerTeamJoining(routes);
  registerRosterActions(routes);
  registerCaptainActions(routes);
  return routes;
}

/** S9, S10, S11, S17 — anything a participant or facilitator can look at. */
function registerTeamReads(routes: Hono<AppBindings>): void {
  // S9 browse — also feeds the facilitator team picker (S22), so any actor may read it.
  routes.get('/', async (c) => {
    requireAnyActor(c);
    const teams = await listTeams(c.get('db'));
    return c.json({ items: teams.map(teamSummaryView) });
  });

  routes.get('/mine', async (c) => {
    const actor = requireParticipant(c);
    const membership = await findActiveMembership(c.get('db'), actor.participant.id);
    if (!membership) return c.json({ team: null });
    return c.json({ team: await readTeamDetail(c, membership.teamId) });
  });

  routes.get('/:teamId', async (c) => {
    requireAnyActor(c);
    return c.json({ team: await readTeamDetail(c, requireParam(c, 'teamId')) });
  });

  // S17 #surf-team-matches — ADR-277: the rebuilt tournament serves it again, in the same `MatchView` shape.
  routes.get('/:teamId/matches', async (c) => {
    requireAnyActor(c);
    const team = await loadTeam(c.get('db'), requireParam(c, 'teamId'));
    const day = await readDay(c.get('db'));
    const items = day === null ? [] : matchesOfTeam(day.context, team.id).map((match) => matchView(day.context, match));
    return c.json({ items });
  });
}

/** F6–F10 — creating, joining and leaving a team (S7, S8, S12). */
function registerTeamJoining(routes: Hono<AppBindings>): void {
  routes.post('/', async (c) => {
    const actor = requireParticipant(c);
    const body = await readBody(c, createTeamRequestSchema);
    await assertNoExistingTeam(c.get('db'), actor.participant.id);
    const taken = await findTeamByName(c.get('db'), body.teamName);
    if (taken) throw conflict(messages.teamNameInvalid, 'teamName');
    const team = await createTeamWithCaptain(c.get('db'), {
      teamName: body.teamName,
      captainParticipantId: actor.participant.id,
    });
    return c.json({ team: await readTeamDetail(c, team.id) }, 201);
  });

  // F7 join by code
  routes.post('/join', async (c) => {
    const actor = requireParticipant(c);
    const body = await readBody(c, joinTeamByCodeRequestSchema);
    await assertNoExistingTeam(c.get('db'), actor.participant.id);
    const team = await findTeamByJoinCode(c.get('db'), body.joinCode);
    if (!team) throw notFound(messages.teamNotFound);
    if (team.isLocked) throw badRequest(messages.teamLocked);
    await addTeamMember(c.get('db'), { teamId: team.id, participantId: actor.participant.id });
    return c.json({ team: await readTeamDetail(c, team.id) }, 201);
  });

  // F8 join from browse
  routes.post('/:teamId/join', async (c) => {
    const actor = requireParticipant(c);
    await assertNoExistingTeam(c.get('db'), actor.participant.id);
    const team = await loadTeam(c.get('db'), requireParam(c, 'teamId'));
    if (team.isLocked) throw badRequest(messages.teamLocked);
    await addTeamMember(c.get('db'), { teamId: team.id, participantId: actor.participant.id });
    return c.json({ team: await readTeamDetail(c, team.id) }, 201);
  });

  // F10 leave — §4.2.3 auto-transfer or §4.2.4 disband happens inside the repository
  routes.post('/:teamId/leave', async (c) => {
    const actor = requireParticipant(c);
    const team = await loadTeam(c.get('db'), requireParam(c, 'teamId'));
    const membership = await findActiveMembership(c.get('db'), actor.participant.id);
    if (!membership || membership.teamId !== team.id) throw badRequest(messages.notOnTeam);
    const outcome = await invalidateMembership(c.get('db'), {
      teamId: team.id,
      participantId: actor.participant.id,
    });
    return c.json({ outcome });
  });

}

/** F11–F12 — the captain changes who is on the roster (S13, S14). */
function registerRosterActions(routes: Hono<AppBindings>): void {
  // F11 captain adds by nickname — bypasses the lock by design
  routes.post('/:teamId/members', async (c) => {
    const actor = requireParticipant(c);
    const body = await readBody(c, addMemberRequestSchema);
    const { team } = await loadCaptainContext(c.get('db'), {
      teamId: requireParam(c, 'teamId'),
      participantId: actor.participant.id,
    });
    const target = await findParticipantByNickname(c.get('db'), body.nickname);
    if (!target) throw notFound(messages.participantNotFound);
    await assertTargetHasNoTeam(c.get('db'), target.id);
    await addTeamMember(c.get('db'), { teamId: team.id, participantId: target.id });
    return c.json({ team: await readTeamDetail(c, team.id) }, 201);
  });

  // F12 captain kicks
  routes.delete('/:teamId/members/:participantId', async (c) => {
    const actor = requireParticipant(c);
    const targetId = requireParam(c, 'participantId');
    const { team, members } = await loadCaptainContext(c.get('db'), {
      teamId: requireParam(c, 'teamId'),
      participantId: actor.participant.id,
    });
    const target = members.find((member) => member.participantId === targetId);
    if (!target) throw notFound(messages.memberNotOnTeam);
    if (target.isCaptain) throw badRequest(messages.notCaptain);
    await invalidateMembership(c.get('db'), { teamId: team.id, participantId: targetId });
    return c.json({ team: await readTeamDetail(c, team.id) });
  });

}

/** F13–F14 — the captain changes the team's own state (S15, S16). */
function registerCaptainActions(routes: Hono<AppBindings>): void {
  // F13 lock toggle
  routes.patch('/:teamId/lock', async (c) => {
    const actor = requireParticipant(c);
    const body = await readBody(c, setLockRequestSchema);
    const { team } = await loadCaptainContext(c.get('db'), {
      teamId: requireParam(c, 'teamId'),
      participantId: actor.participant.id,
    });
    await applyLock(c, { teamId: team.id, isLocked: body.isLocked });
    return c.json({ team: await readTeamDetail(c, team.id) });
  });

  // F14 transfer captaincy
  routes.post('/:teamId/captain', async (c) => {
    const actor = requireParticipant(c);
    const body = await readBody(c, transferCaptaincyRequestSchema);
    const { team, members } = await loadCaptainContext(c.get('db'), {
      teamId: requireParam(c, 'teamId'),
      participantId: actor.participant.id,
    });
    const successor = members.find((member) => member.participantId === body.participantId);
    if (!successor) throw badRequest(messages.captainMustBeMember);
    await transferCaptaincy(c.get('db'), {
      teamId: team.id,
      fromParticipantId: actor.participant.id,
      toParticipantId: successor.participantId,
    });
    return c.json({ team: await readTeamDetail(c, team.id) });
  });
}

/** No flag arguments (AGENTS-function-design.md §3): two named repository calls. */
async function applyLock(
  c: AppContext,
  input: { teamId: string; isLocked: boolean },
): Promise<void> {
  if (input.isLocked) {
    await lockTeam(c.get('db'), input.teamId);
    return;
  }
  await unlockTeam(c.get('db'), input.teamId);
}
