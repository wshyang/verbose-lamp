import { messages } from '@psd/contracts';
import type { TeamDetailView } from '@psd/contracts';
import { listTeamMembers, listTeams } from '../db/entities/index.js';
import { notFound } from '../lib/http.js';
import type { AppContext } from '../lib/session.js';
import { teamDetailView } from '../views/teams.js';

/** The join code is member-only, so every detail read needs to know who is asking. */
export function viewerParticipantId(c: AppContext): string | null {
  const actor = c.get('actor');
  return actor && actor.type === 'participant' ? actor.participant.id : null;
}

export async function readTeamDetail(c: AppContext, teamId: string): Promise<TeamDetailView> {
  const summaries = await listTeams(c.get('db'));
  const summary = summaries.find((candidate) => candidate.id === teamId);
  if (!summary) throw notFound(messages.teamNotFound);
  const members = await listTeamMembers(c.get('db'), teamId);
  return teamDetailView({ summary, members, viewerParticipantId: viewerParticipantId(c) });
}
