import { messages } from '@psd/contracts';
import { findActiveMembership } from '../db/entities/index.js';
import type { ParticipantRow, TeamMembershipRow } from '../db/schema/index.js';
import { HttpError } from '../lib/http.js';
import { requireParticipant, type AppContext } from '../lib/session.js';

/**
 * ADR-063 — membership IS the authorization boundary for a team room, and it moves.
 *
 * Resolved on every request rather than captured once, because a participant can leave, be moved,
 * or have their team disbanded between two messages. Anything cached here would be a window in
 * which a former member still reads the room, so the repo's rule applies literally: active-row
 * filtering on every read *and every authorization check* (AGENTS.md non-negotiable #4).
 *
 * A participant with no team is refused with 403 rather than 404: the room exists as a concept and
 * they are simply not in one, which is not a leak — they already know.
 */
export interface RoomMember {
  membership: TeamMembershipRow;
  participant: ParticipantRow;
  /** Carried so the send limiter can key on the session, not the participant (ADR-046's reason). */
  sessionId: string;
}

export async function requireTeamMember(c: AppContext): Promise<RoomMember> {
  // The session already carries the whole participant row, so this costs one membership lookup.
  const actor = requireParticipant(c);
  const membership = await findActiveMembership(c.get('db'), actor.participant.id);
  if (membership === null) throw new HttpError(403, messages.teamChatNotAMember);
  return { membership, participant: actor.participant, sessionId: actor.sessionId };
}
