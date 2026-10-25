import { messages } from '@psd/contracts';
import type { AppDatabase } from '../db/client.js';
import { findActiveMembership, findTeamById, listTeamMembers } from '../db/entities/index.js';
import type { TeamMemberRecord } from '../db/entities/index.js';
import type { TeamRow } from '../db/schema/index.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';

/**
 * Authorization derivation for captain actions (fds.md §9.3): captaincy is proven by an
 * ACTIVE TeamMembership row, never by the denormalised team.captain_participant_id and never
 * by an expired row (AGENTS-database.md §3.3).
 */

export interface CaptainContext {
  team: TeamRow;
  members: TeamMemberRecord[];
}

export async function loadTeam(db: AppDatabase, teamId: string): Promise<TeamRow> {
  const team = await findTeamById(db, teamId);
  if (!team) throw notFound(messages.teamNotFound);
  return team;
}

export async function loadCaptainContext(
  db: AppDatabase,
  input: { teamId: string; participantId: string },
): Promise<CaptainContext> {
  const team = await loadTeam(db, input.teamId);
  const members = await listTeamMembers(db, team.id);
  const viewer = members.find((member) => member.participantId === input.participantId);
  if (!viewer) throw forbidden(messages.notCaptain);
  if (!viewer.isCaptain) throw forbidden(messages.notCaptain);
  return { team, members };
}

export async function assertNoExistingTeam(db: AppDatabase, participantId: string): Promise<void> {
  const membership = await findActiveMembership(db, participantId);
  if (membership) throw badRequest(messages.alreadyOnTeam);
}

export async function assertTargetHasNoTeam(db: AppDatabase, participantId: string): Promise<void> {
  const membership = await findActiveMembership(db, participantId);
  if (membership) throw badRequest(messages.targetAlreadyOnTeam);
}
