import {
  messages,
  moveMemberRequestSchema,
  rosterMemberRequestSchema,
  transferCaptaincyRequestSchema,
} from '@psd/contracts';
import { Hono } from 'hono';
import {
  addMemberAsStaff,
  findActiveMembership,
  findTeamById,
  forceUnlockTeam,
  memberCountOf,
  moveMember,
  removeMemberAsStaff,
  transferCaptaincyAsStaff,
} from '../db/entities/index.js';
import type { TeamRow } from '../db/schema/index.js';
import { badRequest, conflict, notFound, readBody, requireParam } from '../lib/http.js';
import { requireSuperadmin, type AppBindings, type AppContext } from '../lib/session.js';
import { entrantOfTeam, readDay } from '../routes-tournament/support.js';

/**
 * ADR-154 — roster repair from the console.
 *
 * `/admin/teams` was read-only by design: *"superadmins observe rosters, captains manage
 * them."* That holds for a normal day and fails at 10:40, when the captain is on court with a
 * flat phone and somebody has joined the wrong team off a code read out across a marquee.
 * This adds a second door; it does not move the first one, and every participant-facing
 * `/api/teams` route is untouched.
 *
 * Safe by construction: team points reach a person only through roster snapshots frozen at payment
 * (ADR-005/ADR-248), so nothing here can move a point that has already been earned.
 *
 * ADR-280 — `liveMatchCourtName` is the court the team is playing on right now, off the rebuilt
 * tournament, so the console can say so before a repair empties a team mid-match. `withdrawal`
 * stays null: in the rebuild a team leaves a tournament only by the desk's explicit withdraw
 * (`POST /api/admin/tournament/entrants/:teamId/withdraw`), never as a side effect of a roster fix.
 */
export function superadminTeamRepairRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();
  registerMembershipRepairs(routes);
  registerTeamRepairs(routes);
  return routes;
}

/**
 * The team must exist and still be live before any repair is attempted against it.
 *
 * There is no separate "already disbanded" branch, and that is not an omission:
 * `findTeamById` filters on `disbanded_at IS NULL`, so a disbanded team is simply not found.
 * A second guard here would be unreachable, and an unreachable guard is a branch no test can
 * pin — this repository treats that as a defect rather than as prudence.
 */
async function requireLiveTeam(c: AppContext, teamId: string): Promise<TeamRow> {
  const team = await findTeamById(c.get('db'), teamId);
  if (!team) throw notFound(messages.teamNotFound);
  return team;
}

function registerMembershipRepairs(routes: Hono<AppBindings>): void {
  /*
   * One route and one transaction, never a remove followed by an add from the browser:
   * `ux_team_membership_active_participant` allows one active membership per participant, so
   * the two halves in the wrong order are a 23505 — and a client that crashed between two
   * calls would leave somebody on no team at all.
   */
  routes.post('/teams/members/move', async (c) => {
    requireSuperadmin(c);
    const body = await readBody(c, moveMemberRequestSchema);
    if (body.fromTeamId === body.toTeamId) throw badRequest(messages.moveToSameTeam);
    await requireLiveTeam(c, body.fromTeamId);
    await requireLiveTeam(c, body.toTeamId);
    const membership = await findActiveMembership(c.get('db'), body.participantId);
    // Checked against the team the CALLER believed they were on. A stale console tab acting on
    // somebody who has already been moved is a conflict, not a silent second move.
    if (!membership || membership.teamId !== body.fromTeamId) {
      throw conflict(messages.memberNotOnTeam);
    }
    const outcome = await moveMember(c.get('db'), body);
    return c.json({ ...outcome, withdrawal: null });
  });

  routes.post('/teams/:teamId/members', async (c) => {
    requireSuperadmin(c);
    const teamId = requireParam(c, 'teamId');
    const body = await readBody(c, rosterMemberRequestSchema);
    await requireLiveTeam(c, teamId);
    // The lock is deliberately not consulted: this door exists for when the captain's
    // "my roster is settled" is wrong and the captain cannot be reached to say so.
    if (await findActiveMembership(c.get('db'), body.participantId)) {
      throw conflict(messages.targetAlreadyOnTeam);
    }
    await addMemberAsStaff(c.get('db'), { teamId, participantId: body.participantId });
    return c.json({ ok: true });
  });

  routes.delete('/teams/:teamId/members/:participantId', async (c) => {
    requireSuperadmin(c);
    const teamId = requireParam(c, 'teamId');
    const participantId = requireParam(c, 'participantId');
    await requireLiveTeam(c, teamId);
    const membership = await findActiveMembership(c.get('db'), participantId);
    if (!membership || membership.teamId !== teamId) throw conflict(messages.memberNotOnTeam);
    // §4.2.3/§4.2.4 are inherited wholesale, which is why the console has to have *said* which
    // of the three outcomes is coming before this was pressed.
    const result = await removeMemberAsStaff(c.get('db'), { teamId, participantId });
    return c.json({ ...result, withdrawal: null });
  });

  routes.post('/teams/:teamId/captain', async (c) => {
    requireSuperadmin(c);
    const teamId = requireParam(c, 'teamId');
    const body = await readBody(c, transferCaptaincyRequestSchema);
    const team = await requireLiveTeam(c, teamId);
    const membership = await findActiveMembership(c.get('db'), body.participantId);
    if (!membership || membership.teamId !== teamId) throw conflict(messages.memberNotOnTeam);
    await transferCaptaincyAsStaff(c.get('db'), {
      teamId,
      fromParticipantId: team.captainParticipantId,
      toParticipantId: body.participantId,
    });
    return c.json({ ok: true });
  });
}

/** The court a team is on right now, if it is mid-match in the day's tournament. */
async function liveCourtOf(c: AppContext, teamId: string): Promise<string | null> {
  const day = await readDay(c.get('db'));
  if (day === null) return null;
  const entrantId = entrantOfTeam(day.context, teamId);
  const live = day.context.state.matches.find(
    (match) => match.status === 'in_progress' && (match.slots.a.seatedEntrantId === entrantId || match.slots.b.seatedEntrantId === entrantId),
  );
  if (entrantId === null || live === undefined || live.courtId === null) return null;
  return day.context.courtLabels.get(live.courtId) ?? null;
}

function registerTeamRepairs(routes: Hono<AppBindings>): void {
  routes.post('/teams/:teamId/unlock', async (c) => {
    requireSuperadmin(c);
    const teamId = requireParam(c, 'teamId');
    await requireLiveTeam(c, teamId);
    // No subject participant, so no chat line: `team_chat_message.participant_id` is NOT NULL
    // and is the subject of the event. Recorded as a known gap in ADR-154 §8.
    await forceUnlockTeam(c.get('db'), teamId);
    return c.json({ ok: true });
  });

  // What the confirmation needs before anything is pressed: the cascade this repair would cause.
  routes.get('/teams/:teamId/repair-context', async (c) => {
    requireSuperadmin(c);
    const teamId = requireParam(c, 'teamId');
    const team = await requireLiveTeam(c, teamId);
    const memberCount = await memberCountOf(c.get('db'), teamId);
    return c.json({ teamName: team.teamName, memberCount, liveMatchCourtName: await liveCourtOf(c, teamId) });
  });
}
